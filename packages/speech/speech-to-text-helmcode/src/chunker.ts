/**
 * Por que: whisper cobra por peticion y rechaza mas de 25 MB, asi que el audio
 * largo se trocea ANTES de salir, y la duracion se LEE del propio fichero en
 * vez de estimarse. Este modulo trabaja sobre WAV PCM (el formato que graba el
 * harness): lee su cabecera, corta la peticion en segmentos alineados a la
 * trama y reconstruye un WAV COMPLETO por segmento, de modo que el proveedor
 * nunca recibe un trozo de bytes a medias.
 *
 * @module @deepseek-ai/dsh-speech-to-text-helmcode/chunker
 */

import { TranscriptionError } from './errors.ts'

/** Un segmento listo para una peticion: WAV completo y su duracion medida. */
export interface AudioSegment {
  /** El WAV del segmento, con cabecera propia. */
  readonly audio: Uint8Array
  /** Duracion medida del segmento, en segundos. */
  readonly seconds: number
}

/** La cabecera WAV que este troceador sabe reconstruir. */
export interface WaveLayout {
  /** Formato de audio: 1 PCM entero o 3 coma flotante IEEE. */
  readonly format: number
  /** Canales. */
  readonly channels: number
  /** Frecuencia de muestreo en hercios. */
  readonly sampleRate: number
  /** Bits por muestra. */
  readonly bitsPerSample: number
  /** Bytes de una trama (todos los canales de una muestra). */
  readonly blockAlign: number
  /** Offset del primer byte de audio. */
  readonly dataStart: number
  /** Bytes de audio disponibles. */
  readonly dataBytes: number
}

/** Opciones del troceado. */
export interface ChunkWaveOptions {
  /** Duracion objetivo de cada segmento, en segundos. */
  readonly segmentSeconds: number
  /** Tamano maximo de cada peticion, en bytes. */
  readonly maxBytes: number
}

/** Bytes minimos de un contenedor RIFF/WAVE: cabecera RIFF mas la marca WAVE. */
const RIFF_HEADER_BYTES = 12

/** Bytes de cabecera de cada trozo RIFF: identificador y tamano. */
const CHUNK_HEADER_BYTES = 8

/** Bytes minimos del trozo `fmt ` que este troceador acepta. */
const FMT_CHUNK_BYTES = 16

/** Bytes de la cabecera canonica que reconstruye {@link wrapWave}. */
const CANONICAL_HEADER_BYTES = 44

/** Formato WAV de enteros PCM. */
const PCM_FORMAT = 1

/** Formato WAV de coma flotante IEEE. */
const FLOAT_FORMAT = 3

/**
 * El fallo de contrato de un audio que este troceador no sabe leer.
 *
 * @param detail - que parte del contrato no cuadra.
 * @returns el fallo tipado, listo para lanzar.
 */
function malformed(detail: string): TranscriptionError {
  return new TranscriptionError(
    'MALFORMED',
    `speech-to-text-helmcode: the audio is not a WAV this provider can chunk (${detail})`,
  )
}

/**
 * Lee cuatro bytes ASCII de un WAV.
 *
 * @param view - vista sobre los bytes del audio.
 * @param offset - posicion del primer byte.
 * @returns el identificador del trozo o la marca.
 */
function ascii(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  )
}

/**
 * Escribe cuatro bytes ASCII en un WAV reconstruido.
 *
 * @param view - vista sobre los bytes de salida.
 * @param offset - posicion del primer byte.
 * @param text - los cuatro caracteres a escribir.
 */
function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index))
}

/** Los campos del trozo `fmt ` que el troceado necesita. */
interface WaveFormat {
  readonly format: number
  readonly channels: number
  readonly sampleRate: number
  readonly bitsPerSample: number
  readonly blockAlign: number
}

/**
 * Lee la cabecera de un WAV PCM y localiza su audio.
 *
 * @param audio - los bytes completos del fichero.
 * @returns el formato y la extension del audio.
 * @throws {TranscriptionError} MALFORMED cuando el contenedor no es un
 *         RIFF/WAVE, falta `fmt ` o `data`, el formato no es PCM/float, la
 *         cabecera esta incompleta o el audio esta vacio.
 */
export function readWave(audio: Uint8Array): WaveLayout {
  if (audio.byteLength < RIFF_HEADER_BYTES) throw malformed('it is shorter than a RIFF header')
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength)
  if (ascii(view, 0) !== 'RIFF' || ascii(view, 8) !== 'WAVE') throw malformed('its container is not RIFF/WAVE')
  let format: WaveFormat | undefined
  let data: { start: number; bytes: number } | undefined
  let offset = RIFF_HEADER_BYTES
  while (offset + CHUNK_HEADER_BYTES <= audio.byteLength) {
    const id = ascii(view, offset)
    const size = view.getUint32(offset + 4, true)
    const start = offset + CHUNK_HEADER_BYTES
    const end = start + size
    if (end > audio.byteLength) throw malformed(`its ${id} chunk runs past the end of the audio`)
    if (id === 'fmt ') {
      if (size < FMT_CHUNK_BYTES) throw malformed('its fmt chunk is shorter than 16 bytes')
      format = {
        format: view.getUint16(start, true),
        channels: view.getUint16(start + 2, true),
        sampleRate: view.getUint32(start + 4, true),
        blockAlign: view.getUint16(start + 12, true),
        bitsPerSample: view.getUint16(start + 14, true),
      }
    } else if (id === 'data') {
      data = { start, bytes: size }
    }
    // Los trozos RIFF se alinean a palabra: un tamano impar lleva un byte de relleno.
    offset = end + (size % 2)
  }
  if (format === undefined) throw malformed('it has no fmt chunk')
  if (data === undefined) throw malformed('it has no data chunk')
  if (format.format !== PCM_FORMAT && format.format !== FLOAT_FORMAT) {
    throw malformed(`its audio format ${String(format.format)} is neither PCM nor IEEE float`)
  }
  if (format.channels === 0 || format.sampleRate === 0 || format.blockAlign === 0 || format.bitsPerSample === 0) {
    throw malformed('its fmt chunk leaves channels, sample rate, block align or bit depth at zero')
  }
  if (data.bytes === 0) throw malformed('its data chunk holds no audio')
  return {
    format: format.format,
    channels: format.channels,
    sampleRate: format.sampleRate,
    bitsPerSample: format.bitsPerSample,
    blockAlign: format.blockAlign,
    dataStart: data.start,
    dataBytes: data.bytes,
  }
}

/**
 * Reconstruye un WAV canonico de 44 bytes de cabecera sobre un tramo del audio.
 *
 * @param audio - los bytes del fichero original.
 * @param layout - la cabecera ya leida.
 * @param start - primer byte del audio del segmento.
 * @param bytes - bytes que entran en el segmento.
 * @returns un WAV completo, con su propia cabecera.
 */
function wrapWave(audio: Uint8Array, layout: WaveLayout, start: number, bytes: number): Uint8Array {
  const segment = new Uint8Array(CANONICAL_HEADER_BYTES + bytes)
  const view = new DataView(segment.buffer)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, CANONICAL_HEADER_BYTES - CHUNK_HEADER_BYTES + bytes, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, FMT_CHUNK_BYTES, true)
  view.setUint16(20, layout.format, true)
  view.setUint16(22, layout.channels, true)
  view.setUint32(24, layout.sampleRate, true)
  view.setUint32(28, layout.sampleRate * layout.blockAlign, true)
  view.setUint16(32, layout.blockAlign, true)
  view.setUint16(34, layout.bitsPerSample, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, bytes, true)
  segment.set(audio.subarray(start, start + bytes), CANONICAL_HEADER_BYTES)
  return segment
}

/**
 * Trocea un WAV en segmentos que respetan la duracion objetivo y el limite por
 * peticion.
 *
 * El corte se alinea a la trama, asi que un segmento nunca parte una muestra ni
 * deja un canal a medias. Un audio que ya cabe sale entero, en un unico
 * segmento, y la suma de las duraciones devueltas es la del audio de entrada.
 *
 * @param audio - los bytes completos del WAV.
 * @param options - duracion objetivo y limite de bytes por peticion.
 * @returns los segmentos, en orden de reproduccion.
 * @throws {TranscriptionError} MALFORMED cuando el audio no es un WAV legible,
 *         FILE_TOO_LARGE cuando el limite no admite ni una trama.
 */
export function chunkWave(audio: Uint8Array, options: ChunkWaveOptions): readonly AudioSegment[] {
  const layout = readWave(audio)
  const bytesPerSecond = layout.sampleRate * layout.blockAlign
  const limit = Math.min(options.segmentSeconds * bytesPerSecond, options.maxBytes)
  const aligned = limit - (limit % layout.blockAlign)
  if (aligned < layout.blockAlign) {
    throw new TranscriptionError(
      'FILE_TOO_LARGE',
      `speech-to-text-helmcode: the ${String(options.maxBytes)}-byte request limit cannot hold one `
      + `${String(layout.blockAlign)}-byte audio frame, so no segment could be built`,
    )
  }
  const segments: AudioSegment[] = []
  const end = layout.dataStart + layout.dataBytes
  for (let start = layout.dataStart; start < end; start += aligned) {
    const bytes = Math.min(aligned, end - start)
    segments.push({ audio: wrapWave(audio, layout, start, bytes), seconds: bytes / bytesPerSecond })
  }
  return segments
}
