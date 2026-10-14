/**
 * Dobles compartidos por las suites de este paquete.
 *
 * El nucleo es puro y su transporte es inyectable, asi que NINGUNA prueba abre
 * un socket ni necesita una clave de API: el `fetch`, el reloj y la espera se
 * sustituyen aqui una sola vez y las suites solo comprueban comportamiento.
 */

import { expect } from 'vitest'
import { RetrievalError } from '../src/errors.ts'
import type { FetchLike, HttpRequestLike, HttpResponseLike } from '../src/http.ts'

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

/** Un `fetch` doble que responde de una cola; la ultima respuesta se repite. */
export function queuedTransport(responses: readonly HttpResponseLike[]): TransportDouble {
  const calls: RecordedCall[] = []
  let index = 0
  return {
    calls,
    fetch: (url, init) => {
      calls.push({ url, init })
      const response = responses[Math.min(index, responses.length - 1)]
      index += 1
      if (response === undefined) return Promise.reject(new Error('queuedTransport: no response was queued'))
      return Promise.resolve(response)
    },
  }
}

/** Un reloj doble: el tiempo solo avanza cuando alguien duerme. */
export interface ClockDouble {
  /** El reloj inyectable. */
  readonly now: () => number
  /** La espera inyectable, que registra y avanza el reloj. */
  readonly sleep: (ms: number) => Promise<void>
  /** Los milisegundos que se han pedido dormir, en orden. */
  readonly sleeps: number[]
}

/** Crea un reloj doble que arranca en `start`. */
export function clockDouble(start = 0): ClockDouble {
  let current = start
  const sleeps: number[] = []
  return {
    sleeps,
    now: () => current,
    sleep: (ms) => {
      sleeps.push(ms)
      current += ms
      return Promise.resolve()
    },
  }
}

/** Ejecuta una operacion asincrona que debe fallar y devuelve el error tipado. */
export async function failureOf(operation: Promise<unknown>): Promise<RetrievalError> {
  const outcome = await operation.then(
    () => undefined,
    (error: unknown) => error,
  )
  expect(outcome).toBeInstanceOf(RetrievalError)
  return outcome as RetrievalError
}

/** Ejecuta una operacion sincrona que debe fallar y devuelve el error tipado. */
export function thrownBy(operation: () => unknown): RetrievalError {
  try {
    operation()
  } catch (error) {
    if (error instanceof RetrievalError) return error
    throw error
  }
  throw new Error('thrownBy: the operation did not throw')
}
