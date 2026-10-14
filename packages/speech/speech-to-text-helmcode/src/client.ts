/**
 * Por que: el endpoint de whisper es un POST multipart con
 * `Authorization: Bearer`, y la clave NO viaja por la composicion: sale del
 * credential store. El `fetch` se INYECTA y es obligatorio, asi que no existe
 * un camino que salga a la red sin que quien compone lo haya decidido; los
 * tests pasan un doble y este cliente entero se prueba sin red y sin clave.
 *
 * El reintento de 429 vive AQUI, junto a la respuesta que lo provoca: el
 * proveedor declara `Retry-After` y este cliente espera exactamente eso —o su
 * intervalo por defecto cuando no lo declara— antes de repetir la peticion.
 * Ningun otro estado se reintenta: 401 no se arregla repitiendo.
 *
 * @module @deepseek-ai/dsh-speech-to-text-helmcode/client
 */

import type { AudioSegment } from './chunker.ts'
import { TranscriptionError } from './errors.ts'

/** Ruta del endpoint de transcripcion dentro de la API de Helmcode. */
export const TRANSCRIPTION_PATH = '/v1/audio/transcriptions'

/** Nombre con el que el fichero de audio viaja en el formulario. */
export const AUDIO_FILENAME = 'audio.wav'

/** Tipo MIME del audio que envia este cliente. */
export const AUDIO_MIME = 'audio/wav'

/** Idioma que pide deteccion automatica en vez de un codigo ISO. */
export const AUTO_LANGUAGE = 'auto'

/** Milisegundos de un segundo, para `Retry-After` en segundos. */
const MS_PER_SECOND = 1000

/** Maximo de caracteres del cuerpo que un error cita, para no volcar respuestas enteras. */
const ERROR_SNIPPET_CHARS = 200

/** Estado unico que este cliente acepta como exito. */
const SUCCESS_STATUS = 200

/** La cara minima de una respuesta HTTP que este cliente lee. */
export interface HttpResponseLike {
  /** Estado HTTP. */
  readonly status: number
  /** Cabeceras; solo se consulta `Retry-After`. */
  readonly headers: { get(name: string): string | null }
  /** El cuerpo completo, como texto. */
  readonly text: () => Promise<string>
}

/** La peticion tal como la construye este cliente. */
export interface HttpRequestLike {
  /** Verbo HTTP; siempre `POST`. */
  readonly method: string
  /** Cabeceras completas, ya con la autorizacion. */
  readonly headers: Record<string, string>
  /** Formulario multipart con el modelo, el idioma y el fichero. */
  readonly body: FormData
  /** Cancelacion de la llamada, para que el `fetch` real la respete. */
  readonly signal: AbortSignal
}

/**
 * El transporte inyectable.
 *
 * `globalThis.fetch` lo satisface y un doble de test tambien: esa costura es lo
 * que mantiene este cliente sin red y sin clave.
 */
export type FetchLike = (url: string, init: HttpRequestLike) => Promise<HttpResponseLike>

/** Opciones del cliente de transcripcion. */
export interface HelmcodeTranscriptionClientOptions {
  /** Raiz de la API, con o sin barra final (p. ej. `https://api.helmcode.com`). */
  readonly baseUrl: string
  /** Clave de API; viaja como `Bearer`. */
  readonly apiKey: string
  /**
   * Transporte. Es OBLIGATORIO a proposito: este cliente nunca busca el `fetch`
   * global por su cuenta, asi que no hay camino que salga a la red —ni en los
   * tests ni en produccion— sin que la composicion lo decida y lo pueda
   * sustituir por un doble.
   */
  readonly fetch: FetchLike
  /** Modelo que se pide al endpoint. */
  readonly model: string
  /** Bytes maximos por peticion; un segmento mayor se rechaza antes de enviarse. */
  readonly maxBytes: number
  /** Reintentos que un 429 puede consumir antes de rendirse. */
  readonly maxRetries: number
  /** Espera por defecto tras un 429 que no declara `Retry-After`. */
  readonly retryDelayMs: number
  /** Espera inyectable, para que los tests no duerman de verdad. */
  readonly sleep: (ms: number) => Promise<void>
}

/**
 * Traduce `Retry-After` a milisegundos.
 *
 * El proveedor puede mandar segundos (`"2"`) o una fecha HTTP. Un valor
 * ausente, vacio o ilegible no inventa una espera: devuelve `undefined` y el
 * cliente aplica su propio intervalo. Una fecha ya pasada vale 0, que significa
 * "reintenta ya" y nunca una espera negativa.
 *
 * @param header - valor crudo de la cabecera, o `null` si no vino.
 * @returns los milisegundos a esperar, o `undefined` si no son legibles.
 */
function parseRetryAfter(header: string | null): number | undefined {
  if (header === null) return undefined
  const value = header.trim()
  if (value === '') return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * MS_PER_SECOND))
  const at = Date.parse(value)
  if (Number.isNaN(at)) return undefined
  return Math.max(0, at - Date.now())
}

/**
 * Lee el campo `text` de una respuesta JSON sin afirmar su forma.
 *
 * @param body - el cuerpo ya parseado.
 * @returns la transcripcion, o `undefined` cuando el cuerpo no la trae.
 */
function readTranscript(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const text: unknown = Reflect.get(body, 'text')
  return typeof text === 'string' ? text : undefined
}

/**
 * El cliente HTTP minimo del endpoint de transcripcion de Helmcode.
 */
export class HelmcodeTranscriptionClient {
  private readonly url: string
  private readonly apiKey: string
  private readonly transport: FetchLike
  private readonly model: string
  private readonly maxBytes: number
  private readonly maxRetries: number
  private readonly retryDelayMs: number
  private readonly sleep: (ms: number) => Promise<void>

  /**
   * @param options - raiz de la API, clave, transporte inyectado, modelo,
   * limites de tamano, reintentos y espera inyectable.
   */
  constructor(options: HelmcodeTranscriptionClientOptions) {
    // La raiz se normaliza sin barra final para que `baseUrl + path` no lleve
    // una barra doble, que algunos proxies tratan como otra ruta.
    this.url = `${options.baseUrl.replace(/\/+$/u, '')}${TRANSCRIPTION_PATH}`
    this.apiKey = options.apiKey
    this.transport = options.fetch
    this.model = options.model
    this.maxBytes = options.maxBytes
    this.maxRetries = options.maxRetries
    this.retryDelayMs = options.retryDelayMs
    this.sleep = options.sleep
  }

  /**
   * Transcribe un segmento, reintentando solo lo que un reintento arregla.
   *
   * @param segment - WAV completo y su duracion.
   * @param language - codigo ISO del audio, o `auto` para deteccion automatica.
   * @param signal - cancelacion de la llamada.
   * @returns el texto reconocido; una cadena vacia significa que no se oyo voz.
   * @throws {TranscriptionError} FILE_TOO_LARGE antes de enviar cuando el
   *         segmento supera el limite, AUTH (401), FILE_TOO_LARGE (413),
   *         PROVIDER (5xx o estado inesperado) y MALFORMED (cuerpo sin la forma
   *         contratada). Un 429 se reintenta hasta `maxRetries` veces y, agotado,
   *         sale como RATE_LIMIT.
   */
  async transcribe(segment: AudioSegment, language: string, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted()
    if (segment.audio.byteLength > this.maxBytes) {
      throw new TranscriptionError(
        'FILE_TOO_LARGE',
        `speech-to-text-helmcode: the ${String(segment.audio.byteLength)}-byte audio segment exceeds the `
        + `${String(this.maxBytes)}-byte limit of one transcription request`,
      )
    }
    const form = new FormData()
    form.append('model', this.model)
    if (language !== AUTO_LANGUAGE) form.append('language', language)
    // El `slice()` da un buffer propio de tipo `ArrayBuffer`, que es lo que
    // `Blob` acepta: el segmento ya es una copia, asi que no se comparte estado
    // con el audio del llamante.
    form.append('file', new Blob([segment.audio.slice().buffer], { type: AUDIO_MIME }), AUDIO_FILENAME)
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.send(form, signal)
      } catch (error) {
        if (!(error instanceof TranscriptionError) || error.code !== 'RATE_LIMIT' || attempt >= this.maxRetries) {
          throw error
        }
        signal.throwIfAborted()
        await this.sleep(error.providerRetryAfterMs ?? this.retryDelayMs)
      }
    }
  }

  /**
   * Envia el formulario una vez y traduce la respuesta.
   *
   * @param form - el multipart ya construido.
   * @param signal - cancelacion de la llamada.
   * @returns el texto reconocido.
   * @throws {TranscriptionError} con el codigo del estado o del contrato.
   */
  private async send(form: FormData, signal: AbortSignal): Promise<string> {
    const response = await this.transport(this.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: form,
      signal,
    })
    const text = await response.text()
    const snippet = text.trim().slice(0, ERROR_SNIPPET_CHARS)
    if (response.status === 401) {
      throw new TranscriptionError('AUTH', `Helmcode rejected the API key (401): ${snippet}`, { status: response.status })
    }
    if (response.status === 429) {
      throw new TranscriptionError('RATE_LIMIT', `Helmcode rate-limited the request (429): ${snippet}`, {
        status: response.status,
        providerRetryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
      })
    }
    if (response.status === 413) {
      throw new TranscriptionError(
        'FILE_TOO_LARGE',
        `Helmcode rejected the audio as too large (413): ${snippet}`,
        { status: response.status },
      )
    }
    if (response.status >= 500) {
      throw new TranscriptionError(
        'PROVIDER',
        `Helmcode failed with status ${String(response.status)}: ${snippet}`,
        { status: response.status },
      )
    }
    if (response.status !== SUCCESS_STATUS) {
      throw new TranscriptionError(
        'PROVIDER',
        `Helmcode answered an unexpected status ${String(response.status)}: ${snippet}`,
        { status: response.status },
      )
    }
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch (error) {
      throw new TranscriptionError(
        'MALFORMED',
        `Helmcode answered 200 with a body that is not JSON: ${snippet}`,
        { cause: error },
      )
    }
    const transcript = readTranscript(body)
    if (transcript === undefined) {
      throw new TranscriptionError(
        'MALFORMED',
        `Helmcode answered 200 without a string "text" field: ${snippet}`,
      )
    }
    return transcript
  }
}
