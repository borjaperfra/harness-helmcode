/**
 * Dobles compartidos por las suites de este paquete.
 *
 * El nucleo es puro y su transporte es inyectable, asi que NINGUNA prueba abre
 * un socket, pide una clave ni duerme de verdad: el `fetch`, la espera y el WAV
 * de entrada se construyen aqui una sola vez y las suites solo comprueban
 * comportamiento.
 */

import { expect } from 'vitest'
import type { FetchLike, HttpRequestLike, HttpResponseLike } from '../src/client.ts'
import { TranscriptionError } from '../src/errors.ts'

/** Una respuesta HTTP con el cuerpo JSON dado. */
export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): HttpResponseLike {
  return textResponse(status, JSON.stringify(body), headers)
}

/** Una respuesta HTTP con el cuerpo crudo dado (para cuerpos que no son JSON). */
export function textResponse(status: number, body: string, headers: Record<string, string> = {}): HttpResponseLike {
  return {
    status,
    headers: { get: name => headers[name.toLowerCase()] ?? null },
    text: () => Promise.resolve(body),
  }
}

/** Una llamada vista por el transporte doble. */
export interface RecordedCall {
  /** URL pedida. */
  readonly url: string
  /** Peticion construida por el cliente. */
  readonly init: HttpRequestLike
}

/** El transporte doble y las llamadas que ha visto. */
export interface TransportDouble {
  /** El `fetch` inyectable. */
  readonly fetch: FetchLike
  /** Las llamadas, en orden. */
  readonly calls: RecordedCall[]
}

/**
 * Un `fetch` doble que responde de una cola; la ultima respuesta se repite.
 *
 * Un elemento `Error` de la cola RECHAZA la peticion, que es como se prueba un
 * fallo de transporte sin red.
 */
export function queuedTransport(responses: ReadonlyArray<HttpResponseLike | Error>): TransportDouble {
  const calls: RecordedCall[] = []
  let index = 0
  return {
    calls,
    fetch: (url, init) => {
      calls.push({ url, init })
      const response = responses[Math.min(index, responses.length - 1)]
      index += 1
      if (response === undefined) return Promise.reject(new Error('queuedTransport: no response was queued'))
      return response instanceof Error ? Promise.reject(response) : Promise.resolve(response)
    },
  }
}

/** Cuerpo de un trozo `fmt ` de 16 bytes. */
export function fmtBody(
  format: number,
  channels: number,
  sampleRate: number,
  blockAlign: number,
  bitsPerSample: number,
): Uint8Array {
  const body = new Uint8Array(16)
  const view = new DataView(body.buffer)
  view.setUint16(0, format, true)
  view.setUint16(2, channels, true)
  view.setUint32(4, sampleRate, true)
  view.setUint32(8, sampleRate * blockAlign, true)
  view.setUint16(12, blockAlign, true)
  view.setUint16(14, bitsPerSample, true)
  return body
}

/** Un trozo RIFF con su identificador y su cuerpo. */
export interface RiffChunk {
  /** Identificador de cuatro caracteres. */
  readonly id: string
  /** Bytes del cuerpo. */
  readonly body: Uint8Array
  /** Tamano DECLARADO, para construir un trozo que miente sobre su cuerpo. */
  readonly declaredBytes?: number
}

/**
 * Construye un contenedor RIFF/WAVE con los trozos dados.
 *
 * @param chunks - los trozos, en orden.
 * @returns los bytes completos del contenedor.
 */
export function riff(chunks: readonly RiffChunk[]): Uint8Array {
  const size = 12 + chunks.reduce((total, chunk) => {
    const declared = chunk.declaredBytes ?? chunk.body.byteLength
    return total + 8 + declared + (declared % 2)
  }, 0)
  const audio = new Uint8Array(size)
  const view = new DataView(audio.buffer)
  const writeId = (offset: number, id: string): void => {
    for (let index = 0; index < id.length; index += 1) view.setUint8(offset + index, id.charCodeAt(index))
  }
  writeId(0, 'RIFF')
  view.setUint32(4, size - 8, true)
  writeId(8, 'WAVE')
  let offset = 12
  for (const chunk of chunks) {
    const declared = chunk.declaredBytes ?? chunk.body.byteLength
    writeId(offset, chunk.id)
    view.setUint32(offset + 4, declared, true)
    audio.set(chunk.body, offset + 8)
    offset += 8 + declared + (declared % 2)
  }
  return audio
}

/** Opciones del WAV de prueba. */
export interface WaveFixtureOptions {
  /** Duracion del audio, en segundos. */
  readonly seconds?: number
  /** Frecuencia de muestreo. */
  readonly sampleRate?: number
  /** Canales. */
  readonly channels?: number
  /** Bits por muestra. */
  readonly bitsPerSample?: number
  /** Formato WAV (1 PCM, 3 float, otro para probar el rechazo). */
  readonly format?: number
}

/**
 * Construye un WAV canonico con la duracion pedida.
 *
 * @param options - duracion, frecuencia, canales, profundidad y formato.
 * @returns los bytes completos del WAV.
 */
export function waveBytes(options: WaveFixtureOptions = {}): Uint8Array {
  const sampleRate = options.sampleRate ?? 16_000
  const channels = options.channels ?? 1
  const bitsPerSample = options.bitsPerSample ?? 16
  const blockAlign = (channels * bitsPerSample) / 8
  const frames = Math.round((options.seconds ?? 1) * sampleRate)
  return riff([
    { id: 'fmt ', body: fmtBody(options.format ?? 1, channels, sampleRate, blockAlign, bitsPerSample) },
    { id: 'data', body: new Uint8Array(frames * blockAlign) },
  ])
}

/** La espera doble y los milisegundos que se han pedido dormir. */
export interface SleepDouble {
  /** La espera inyectable. */
  readonly sleep: (ms: number) => Promise<void>
  /** Los milisegundos pedidos, en orden. */
  readonly sleeps: number[]
}

/** Crea una espera doble que no duerme. */
export function sleepDouble(): SleepDouble {
  const sleeps: number[] = []
  return { sleeps, sleep: (ms) => { sleeps.push(ms); return Promise.resolve() } }
}

/** Ejecuta una operacion asincrona que debe fallar y devuelve el error tipado. */
export async function failureOf(operation: Promise<unknown>): Promise<TranscriptionError> {
  const outcome = await operation.then(
    () => undefined,
    (error: unknown) => error,
  )
  expect(outcome).toBeInstanceOf(TranscriptionError)
  return outcome as TranscriptionError
}

/** Ejecuta una operacion sincrona que debe fallar y devuelve el error tipado. */
export function thrownBy(operation: () => unknown): TranscriptionError {
  try {
    operation()
  } catch (error) {
    if (error instanceof TranscriptionError) return error
    throw error
  }
  throw new Error('thrownBy: the operation did not throw')
}
