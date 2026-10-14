/**
 * Por que: los dos clientes de la API de Helmcode (embeddings y rerank) fallan
 * con el MISMO vocabulario, y quien los llama tiene que poder decidir sin
 * parsear mensajes: 401 no se reintenta, 402 no se reintenta, 429 se reintenta
 * con el intervalo que el proveedor declara, 5xx es un fallo del proveedor y
 * una respuesta que no cuadra es un fallo de contrato. Una sola clase con un
 * codigo —en vez de una jerarquia de excepciones— mantiene ese vocabulario en
 * un sitio y deja que `instanceof` siga siendo la comprobacion barata.
 *
 * @module @deepseek-ai/dsh-retrieval-helmcode/errors
 */

/** Las clases de fallo que este nucleo distingue. */
export type RetrievalErrorCode =
  /** 401: la clave no vale. */
  | 'AUTH'
  /** 402: la clave no tiene creditos. */
  | 'CREDITS'
  /** 429: limite de ritmo; puede traer `providerRetryAfterMs`. */
  | 'RATE_LIMIT'
  /** 5xx, o un estado que el nucleo no sabe clasificar. */
  | 'PROVIDER'
  /** La respuesta no tiene la forma contratada (cuerpo, indices, dimension). */
  | 'MALFORMED'
  /** Una medida no cuadra: el vector no tiene la dimension del indice. */
  | 'DIMENSION'
  /** El indice local se uso despues de cerrarlo. */
  | 'CLOSED'

/** Datos de contexto opcionales de un {@link RetrievalError}. */
export interface RetrievalErrorOptions {
  /** Estado HTTP que provoco el fallo, cuando lo hay. */
  readonly status?: number | undefined
  /** Milisegundos que el proveedor pide esperar, cuando los declara. */
  readonly providerRetryAfterMs?: number | undefined
  /** Causa original, para no perder el error de debajo. */
  readonly cause?: unknown
}

/**
 * El fallo tipado del nucleo de recuperacion.
 *
 * Se usa `instanceof RetrievalError` y se ramifica por `code`: los clientes de
 * arriba deciden con eso si reintentan y cuanto esperan.
 */
export class RetrievalError extends Error {
  /** La clase de fallo. */
  readonly code: RetrievalErrorCode

  /** Estado HTTP del proveedor, o `undefined` si el fallo no vino de uno. */
  readonly status: number | undefined

  /** Intervalo pedido por el proveedor en un 429, o `undefined`. */
  readonly providerRetryAfterMs: number | undefined

  /**
   * @param code - la clase de fallo.
   * @param message - mensaje con el contexto suficiente para diagnosticar.
   * @param options - estado, intervalo del proveedor y causa original.
   */
  constructor(code: RetrievalErrorCode, message: string, options: RetrievalErrorOptions = {}) {
    super(message, { cause: options.cause })
    this.name = 'RetrievalError'
    this.code = code
    this.status = options.status
    this.providerRetryAfterMs = options.providerRetryAfterMs
  }
}
