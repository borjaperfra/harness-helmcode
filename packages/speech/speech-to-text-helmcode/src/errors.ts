/**
 * Por que: los fallos de la transcripcion se DECIDEN, no se parsean. 401 no se
 * reintenta, 429 se reintenta con el intervalo que el proveedor declara, 413
 * dice que el audio no cabe y 5xx es un fallo del proveedor. Una sola clase con
 * un codigo —en vez de una jerarquia de excepciones— mantiene ese vocabulario
 * en un sitio y deja que `instanceof` siga siendo la comprobacion barata.
 *
 * @module @deepseek-ai/dsh-speech-to-text-helmcode/errors
 */

/** Las clases de fallo que este proveedor distingue. */
export type TranscriptionErrorCode =
  /** 401: la clave no vale. */
  | 'AUTH'
  /** 429: limite de ritmo; puede traer `providerRetryAfterMs`. */
  | 'RATE_LIMIT'
  /** 413, o un segmento que no cabe en el limite por peticion. */
  | 'FILE_TOO_LARGE'
  /** 5xx, o un estado que el proveedor no sabe clasificar. */
  | 'PROVIDER'
  /** La respuesta (o el audio) no tiene la forma contratada. */
  | 'MALFORMED'
  /** No hay una clave utilizable en el credential store. */
  | 'MISSING_CREDENTIAL'
  /** No hay un `fetch` global con el que enviar el audio. */
  | 'NO_TRANSPORT'

/** Datos de contexto opcionales de un {@link TranscriptionError}. */
export interface TranscriptionErrorOptions {
  /** Estado HTTP que provoco el fallo, cuando lo hay. */
  readonly status?: number | undefined
  /** Milisegundos que el proveedor pide esperar, cuando los declara. */
  readonly providerRetryAfterMs?: number | undefined
  /** Causa original, para no perder el error de debajo. */
  readonly cause?: unknown
}

/**
 * El fallo tipado del proveedor de transcripcion.
 *
 * Se usa `instanceof TranscriptionError` y se ramifica por `code`: el cliente
 * decide con eso si reintenta y cuanto espera.
 */
export class TranscriptionError extends Error {
  /** La clase de fallo. */
  readonly code: TranscriptionErrorCode

  /** Estado HTTP del proveedor, o `undefined` si el fallo no vino de uno. */
  readonly status: number | undefined

  /** Intervalo pedido por el proveedor en un 429, o `undefined`. */
  readonly providerRetryAfterMs: number | undefined

  /**
   * @param code - la clase de fallo.
   * @param message - mensaje con el contexto suficiente para diagnosticar.
   * @param options - estado, intervalo del proveedor y causa original.
   */
  constructor(code: TranscriptionErrorCode, message: string, options: TranscriptionErrorOptions = {}) {
    super(message, { cause: options.cause })
    this.name = 'TranscriptionError'
    this.code = code
    this.status = options.status
    this.providerRetryAfterMs = options.providerRetryAfterMs
  }
}
