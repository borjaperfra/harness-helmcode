/**
 * El troceador: lectura de la cabecera WAV, corte alineado a la trama y
 * reconstruccion de segmentos completos.
 *
 * Todo lo que se prueba aqui son bytes construidos en memoria: no hay ficheros,
 * ni red, ni reloj.
 */

import { describe, expect, it } from 'vitest'
import { chunkWave, readWave } from '../src/chunker.ts'
import type { WaveLayout } from '../src/chunker.ts'
import { fmtBody, riff, thrownBy, waveBytes } from './doubles.ts'

/** Formato por defecto de las pruebas: 16 kHz, mono, 16 bits (32 000 B/s). */
const BYTES_PER_SECOND = 32_000

/** El tramo de audio de un WAV, sin su cabecera. */
function audioOf(audio: Uint8Array): Uint8Array {
  const layout = readWave(audio)
  return audio.subarray(layout.dataStart, layout.dataStart + layout.dataBytes)
}

/** Compara dos tramos de audio sin recorrerlos elemento a elemento en el test. */
function sameAudio(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.from(left).equals(Buffer.from(right))
}

/** Devuelve una copia del WAV con un campo de 2 o 4 bytes del `fmt ` puesto a cero. */
function zeroed(field: 'channels' | 'sampleRate' | 'blockAlign' | 'bitsPerSample'): Uint8Array {
  const audio = waveBytes()
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength)
  const offsets = { channels: [22, 2], sampleRate: [24, 4], blockAlign: [32, 2], bitsPerSample: [34, 2] } as const
  const [offset, bytes] = offsets[field]
  if (bytes === 4) view.setUint32(offset, 0, true)
  else view.setUint16(offset, 0, true)
  return audio
}

/** Escribe cuatro caracteres ASCII en una copia del audio. */
function patched(audio: Uint8Array, offset: number, text: string): Uint8Array {
  const copy = audio.slice()
  for (let index = 0; index < text.length; index += 1) copy[offset + index] = text.charCodeAt(index)
  return copy
}

describe('readWave', () => {
  it('lee la cabecera de un WAV PCM canonico', () => {
    const layout = readWave(waveBytes({ seconds: 2, sampleRate: 44_100, channels: 2, bitsPerSample: 16 }))
    expect(layout).toEqual({
      format: 1,
      channels: 2,
      sampleRate: 44_100,
      bitsPerSample: 16,
      blockAlign: 4,
      dataStart: 44,
      dataBytes: 2 * 44_100 * 4,
    })
  })

  it('acepta un WAV de coma flotante IEEE', () => {
    expect(readWave(waveBytes({ format: 3 })).format).toBe(3)
  })

  it('salta los trozos que no son fmt ni data', () => {
    const audio = riff([
      { id: 'fmt ', body: fmtBody(1, 1, 16_000, 2, 16) },
      { id: 'LIST', body: new Uint8Array([1, 2, 3, 4]) },
      { id: 'data', body: new Uint8Array(8) },
    ])
    expect(readWave(audio)).toMatchObject({ dataStart: 56, dataBytes: 8 })
  })

  it.each([
    ['shorter than a RIFF header', () => new Uint8Array(4)],
    ['not RIFF/WAVE', () => patched(waveBytes(), 0, 'RIFX')],
    ['not RIFF/WAVE', () => patched(waveBytes(), 8, 'AVI ')],
    ['runs past the end', () => {
      const audio = waveBytes()
      new DataView(audio.buffer).setUint32(40, 100_000, true)
      return audio
    }],
    ['fmt chunk is shorter', () => riff([{ id: 'fmt ', body: new Uint8Array(14) }, { id: 'data', body: new Uint8Array(4) }])],
    ['no fmt chunk', () => riff([{ id: 'data', body: new Uint8Array(4) }])],
    ['no data chunk', () => riff([{ id: 'fmt ', body: fmtBody(1, 1, 16_000, 2, 16) }])],
    ['neither PCM nor IEEE float', () => waveBytes({ format: 2 })],
    ['at zero', () => zeroed('channels')],
    ['at zero', () => zeroed('sampleRate')],
    ['at zero', () => zeroed('blockAlign')],
    ['at zero', () => zeroed('bitsPerSample')],
    ['holds no audio', () => riff([{ id: 'fmt ', body: fmtBody(1, 1, 16_000, 2, 16) }, { id: 'data', body: new Uint8Array(0) }])],
  ])('rechaza un audio malformado (%s)', (_reason, build) => {
    const failure = thrownBy(() => readWave(build()))
    expect(failure.code).toBe('MALFORMED')
    expect(failure.message).toContain('not a WAV this provider can chunk')
  })
})

describe('chunkWave', () => {
  it('deja un audio corto en un unico segmento con su duracion medida', () => {
    const audio = waveBytes({ seconds: 30 })
    const segments = chunkWave(audio, { segmentSeconds: 120, maxBytes: 25 * 1024 * 1024 })
    expect(segments).toHaveLength(1)
    expect(segments[0]?.seconds).toBe(30)
    expect(segments[0]?.audio.byteLength).toBe(44 + 30 * BYTES_PER_SECOND)
    expect(sameAudio(audioOf(segments[0]!.audio), audioOf(audio))).toBe(true)
  })

  it('trocea cinco minutos en tres segmentos de dos, dos y uno y los reconstruye completos', () => {
    const audio = waveBytes({ seconds: 300 })
    const segments = chunkWave(audio, { segmentSeconds: 120, maxBytes: 25 * 1024 * 1024 })
    expect(segments.map(segment => segment.seconds)).toEqual([120, 120, 60])
    const original = audioOf(audio)
    const joined = new Uint8Array(original.byteLength)
    let offset = 0
    for (const segment of segments) {
      const layout: WaveLayout = readWave(segment.audio)
      expect(layout.dataBytes).toBe(segment.seconds * BYTES_PER_SECOND)
      joined.set(audioOf(segment.audio), offset)
      offset += layout.dataBytes
    }
    expect(offset).toBe(original.byteLength)
    expect(sameAudio(joined, original)).toBe(true)
  })

  it('respeta el limite de bytes cuando es mas estrecho que la duracion objetivo', () => {
    const audio = waveBytes({ seconds: 10 })
    const segments = chunkWave(audio, { segmentSeconds: 120, maxBytes: 32_000 })
    expect(segments.map(segment => segment.seconds)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
  })

  it('rechaza un limite que no admite ni una trama antes de construir nada', () => {
    const failure = thrownBy(() => chunkWave(waveBytes(), { segmentSeconds: 120, maxBytes: 1 }))
    expect(failure.code).toBe('FILE_TOO_LARGE')
    expect(failure.message).toContain('cannot hold one 2-byte audio frame')
  })

  it('propaga el malformado del audio que no sabe leer', () => {
    expect(thrownBy(() => chunkWave(new Uint8Array(2), { segmentSeconds: 120, maxBytes: 1024 })).code).toBe('MALFORMED')
  })
})
