/**
 * Por que: `qwen3-embedding` devuelve 4096 dimensiones y esta documentado a 60
 * peticiones por minuto, asi que quien llama no puede mandar un documento por
 * peticion ni confiar en que la respuesta llegue en el orden de entrada. Las
 * tres decisiones de este modulo salen de ahi: lotes de como maximo 32, un
 * intervalo minimo entre peticiones (espaciado en el cliente, que es el unico
 * que ve su propia cuota) y reordenacion por `data[].index`.
 *
 * El `fetch` llega inyectado a traves de {@link HelmcodeHttp}, el reloj y el
 * sueno tambien: los tests no esperan de verdad ni abren un socket.
 *
 * @module @deepseek-ai/dsh-retrieval-helmcode/embed
 */

import { RetrievalError } from './errors.ts'
import type { HelmcodeHttp } from './http.ts'

/** Un vector de embedding; el orden de sus componentes es el del modelo. */
export type Embedding = readonly number[]

/**
 * El embedder tal como lo ve el pipeline.
 *
 * Es una interfaz para que los tests inyecten un doble sin red y para que el
 * pipeline no dependa del cliente concreto.
 */
export interface Embedder {
  /**
   * Embebe los textos en el orden dado.
   *
   * @param texts - los textos a embeber.
   * @returns un vector por texto, en el MISMO orden de entrada.
   */
  embed(texts: readonly string[]): Promise<Embedding[]>
}

/** El modelo de embeddings de la API de Helmcode. */
export const HELMCODE_EMBEDDING_MODEL = 'qwen3-embedding'

/** Dimensiones que declara el modelo; una respuesta con otra medida es un fallo de contrato. */
export const EMBEDDING_DIMENSIONS = 4096

/** Maximo de entradas por peticion que tolera el endpoint. */
export const MAX_EMBED_BATCH = 32

/** Intervalo minimo por defecto entre peticiones, en milisegundos (60 rpm). */
export const DEFAULT_MIN_INTERVAL_MS = 1000

/** Reintentos por defecto ante un 429. */
export const DEFAULT_MAX_RETRIES = 3

/** Ruta del endpoint de embeddings. */
const EMBEDDINGS_PATH = '/v1/embeddings'

/** Opciones del embedder. */
export interface HelmcodeEmbedderOptions {
  /** Cliente HTTP con el `fetch` inyectado. */
  readonly http: HelmcodeHttp
  /** Entradas por peticion (por defecto {@link MAX_EMBED_BATCH}). */
  readonly batchSize?: number | undefined
  /** Intervalo minimo entre peticiones, en ms (por defecto {@link DEFAULT_MIN_INTERVAL_MS}). */
  readonly minIntervalMs?: number | undefined
  /** Reintentos ante 429 (por defecto {@link DEFAULT_MAX_RETRIES}). */
  readonly maxRetries?: number | undefined
  /** Espera inyectable; los tests la sustituyen por un doble sin reloj real. */
  readonly sleep?: ((ms: number) => Promise<void>) | undefined
  /** Reloj inyectable, en milisegundos; por defecto `Date.now`. */
  readonly now?: (() => number) | undefined
}

/** La espera real, para cuando nadie inyecta una. */
function realSleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Devuelve un valor como `Error` para poder relanzarlo sin perder el tipo.
 *
 * `only-throw-error` prohibe relanzar un `unknown`; el contrato de
 * {@link FetchLike} es rechazar con `Error`, y un doble que rechace otra cosa se
 * convierte aqui en un fallo con mensaje en vez de en un valor raro hacia arriba.
 */
function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error('the Helmcode transport rejected with a non-Error value')
}

/** Descarta si el valor es un objeto JSON con campos. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** El campo `data` de una respuesta, o `undefined` si la respuesta no es un objeto. */
function responseData(raw: unknown): unknown {
  if (!isRecord(raw)) return undefined
  return raw.data
}

/** Comprueba que un valor es un vector numerico de la dimension contratada. */
function isEmbeddingVector(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length === EMBEDDING_DIMENSIONS
    && value.every(item => typeof item === 'number')
}

/**
 * Reordena y valida la respuesta de `/v1/embeddings`.
 *
 * @param raw - el cuerpo JSON del proveedor.
 * @param expected - cuantas entradas se pidieron.
 * @returns los vectores en el orden de entrada.
 * @throws {RetrievalError} MALFORMED si falta una entrada, sobra, se repite un
 * indice, o un vector no tiene la forma contratada.
 */
function parseEmbeddings(raw: unknown, expected: number): Embedding[] {
  const data = responseData(raw)
  if (!Array.isArray(data) || data.length !== expected) {
    throw new RetrievalError(
      'MALFORMED',
      `the embeddings endpoint answered ${Array.isArray(data) ? data.length : 'no'} entries for ${expected} inputs`,
    )
  }
  const slots = new Array<Embedding | undefined>(expected).fill(undefined)
  for (const entry of data) {
    if (!isRecord(entry)) {
      throw new RetrievalError('MALFORMED', 'the embeddings endpoint answered an entry that is not a JSON object')
    }
    const index = entry.index
    if (typeof index !== 'number' || index < 0 || index >= expected) {
      throw new RetrievalError('MALFORMED', `the embeddings endpoint answered an out-of-range index for ${expected} inputs`)
    }
    if (!isEmbeddingVector(entry.embedding)) {
      throw new RetrievalError('MALFORMED', `embedding ${index} is not a numeric vector of ${EMBEDDING_DIMENSIONS} dimensions`)
    }
    slots[index] = entry.embedding
  }
  const ordered: Embedding[] = []
  for (const vector of slots) {
    if (vector === undefined) {
      throw new RetrievalError('MALFORMED', `the embeddings endpoint did not answer input index ${ordered.length}`)
    }
    ordered.push(vector)
  }
  return ordered
}

/**
 * El cliente de embeddings de Helmcode.
 *
 * Espacia las peticiones, las parte en lotes de {@link MAX_EMBED_BATCH} y
 * reintenta el 429 respetando `Retry-After` hasta {@link DEFAULT_MAX_RETRIES}
 * veces. Nada de esto toca la red por si mismo: todo pasa por el cliente HTTP
 * inyectado.
 */
export class HelmcodeEmbedder implements Embedder {
  private readonly http: HelmcodeHttp
  private readonly batchSize: number
  private readonly minIntervalMs: number
  private readonly maxRetries: number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly now: () => number
  /** Instante a partir del cual se puede volver a llamar (espaciado de ritmo). */
  private nextSlotAt = 0

  /**
   * @param options - cliente HTTP, lote, intervalo, reintentos, reloj y espera.
   */
  constructor(options: HelmcodeEmbedderOptions) {
    this.http = options.http
    this.batchSize = options.batchSize ?? MAX_EMBED_BATCH
    this.minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
    this.sleep = options.sleep ?? realSleep
    this.now = options.now ?? (() => Date.now())
  }

  /**
   * Embebe los textos en lotes, respetando el orden.
   *
   * @param texts - los textos a embeber.
   * @returns un vector por texto, en el MISMO orden de entrada.
   * @throws {RetrievalError} la clase de fallo que devuelva el cliente HTTP, o
   * MALFORMED si una respuesta no cuadra.
   */
  async embed(texts: readonly string[]): Promise<Embedding[]> {
    const embeddings: Embedding[] = []
    for (let start = 0; start < texts.length; start += this.batchSize) {
      const batch = texts.slice(start, start + this.batchSize)
      embeddings.push(...await this.embedBatch(batch))
    }
    return embeddings
  }

  /** Un lote: espera su turno, pide y parsea. */
  private async embedBatch(batch: readonly string[]): Promise<Embedding[]> {
    await this.waitForSlot()
    const raw = await this.request(batch, 0)
    return parseEmbeddings(raw, batch.length)
  }

  /** Deja pasar el intervalo minimo entre peticiones. */
  private async waitForSlot(): Promise<void> {
    const wait = this.nextSlotAt - this.now()
    if (wait > 0) await this.sleep(wait)
    this.nextSlotAt = this.now() + this.minIntervalMs
  }

  /**
   * Pide un lote, reintentando el 429 hasta agotar {@link maxRetries}.
   *
   * @param batch - las entradas del lote.
   * @param attempt - reintentos ya consumidos.
   * @returns el cuerpo JSON del proveedor.
   */
  private async request(batch: readonly string[], attempt: number): Promise<unknown> {
    try {
      return await this.http.postJson(EMBEDDINGS_PATH, { model: HELMCODE_EMBEDDING_MODEL, input: batch })
    } catch (error) {
      if (!(error instanceof RetrievalError && error.code === 'RATE_LIMIT') || attempt >= this.maxRetries) {
        throw asError(error)
      }
      // El proveedor manda; sin cabecera legible, el intervalo minimo propio es
      // la unica espera defendible.
      await this.sleep(error.providerRetryAfterMs ?? this.minIntervalMs)
      return this.request(batch, attempt + 1)
    }
  }
}
