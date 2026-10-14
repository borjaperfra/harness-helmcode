/**
 * Por que: los dos clientes de Helmcode hablan el mismo protocolo minimo —POST
 * JSON con `Authorization: Bearer`— y fallan con las mismas clases (401 AUTH,
 * 402 CREDITS, 429 RATE_LIMIT, 5xx PROVIDER). Ese protocolo vive aqui, en UN
 * sitio, y con el `fetch` INYECTADO: los tests pasan un doble y el nucleo
 * entero se prueba sin red y sin clave de API.
 *
 * No hay reintentos en este nivel a proposito: el espaciado de ritmo y el
 * reintento de 429 son de los clientes de arriba, que conocen su cuota. Aqui
 * solo se parsea `Retry-After` y se expone en `providerRetryAfterMs` para que
 * la decision sea de quien la toma.
 *
 * @module @deepseek-ai/dsh-retrieval-helmcode/http
 */

import { RetrievalError } from './errors.ts'

/** La cara minima de una respuesta HTTP que este cliente lee. */
export interface HttpResponseLike {
  /** Estado HTTP. */
  readonly status: number
  /** Cabeceras; solo se consulta `Retry-After`. */
  readonly headers: { get(name: string): string | null }
  /** El cuerpo completo, como texto. */
  text(): Promise<string>
}

/** La peticion tal como la construye este cliente. */
export interface HttpRequestLike {
  /** Verbo HTTP; siempre `POST`. */
  readonly method: string
  /** Cabeceras completas, ya con la autorizacion. */
  readonly headers: Record<string, string>
  /** Cuerpo ya serializado. */
  readonly body: string
}

/**
 * El transporte inyectable.
 *
 * `globalThis.fetch` lo satisface y un doble de test tambien: esa costura es lo
 * que mantiene este nucleo sin red y sin clave.
 */
export type FetchLike = (url: string, init: HttpRequestLike) => Promise<HttpResponseLike>

/** Opciones del cliente HTTP. */
export interface HelmcodeHttpOptions {
  /** Raiz de la API, con o sin barra final (p. ej. `https://api.helmcode.com`). */
  readonly baseUrl: string
  /** Clave de API; viaja como `Bearer`. */
  readonly apiKey: string
  /**
   * Transporte. Es OBLIGATORIO a proposito: este nucleo nunca busca el `fetch`
   * global por su cuenta, asi que no existe un camino que salga a la red —ni en
   * los tests ni en produccion— sin que la composicion lo decida y lo pueda
   * sustituir por un doble.
   */
  readonly fetch: FetchLike
}

/** Milisegundos de un segundo, para `Retry-After` en segundos. */
const MS_PER_SECOND = 1000

/** Maximo de caracteres del cuerpo que un error cita, para no volcar respuestas enteras. */
const ERROR_SNIPPET_CHARS = 200

/** Estado unico que este nucleo acepta como exito. */
const SUCCESS_STATUS = 200

/**
 * Traduce `Retry-After` a milisegundos.
 *
 * El proveedor puede mandar segundos (`"2"`) o una fecha HTTP. Un valor
 * ausente, vacio o ilegible no inventa una espera: devuelve `undefined` y el
 * cliente de arriba aplica su propio intervalo. Una fecha ya pasada vale 0,
 * que significa "reintenta ya" y nunca una espera negativa.
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
 * El cliente HTTP minimo de la API de Helmcode: una ruta, un cuerpo JSON y las
 * cuatro clases de fallo.
 */
export class HelmcodeHttp {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly transport: FetchLike

  /**
   * @param options - raiz de la API, clave y transporte inyectado.
   */
  constructor(options: HelmcodeHttpOptions) {
    // La raiz se normaliza sin barra final para que `baseUrl + path` no lleve
    // una barra doble, que algunos proxies tratan como otra ruta.
    this.baseUrl = options.baseUrl.replace(/\/+$/u, '')
    this.apiKey = options.apiKey
    this.transport = options.fetch
  }

  /**
   * Envia un cuerpo JSON a `path` y devuelve el JSON de la respuesta.
   *
   * @param path - ruta dentro de la API (p. ej. `/v1/embeddings`).
   * @param body - cuerpo serializable; se envia como JSON tal cual.
   * @returns el cuerpo de la respuesta ya parseado.
   * @throws {RetrievalError} AUTH (401), CREDITS (402), RATE_LIMIT (429),
   * PROVIDER (5xx o estado inesperado) y MALFORMED (cuerpo que no es JSON).
   *         El 429 lleva `providerRetryAfterMs` cuando el proveedor lo declara.
   */
  async postJson(path: string, body: unknown): Promise<unknown> {
    const response = await this.transport(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const text = await response.text()
    const snippet = text.trim().slice(0, ERROR_SNIPPET_CHARS)
    if (response.status === 401) {
      throw new RetrievalError('AUTH', `Helmcode rejected the API key (401): ${snippet}`, { status: response.status })
    }
    if (response.status === 402) {
      throw new RetrievalError('CREDITS', `Helmcode reports no credits for this key (402): ${snippet}`, { status: response.status })
    }
    if (response.status === 429) {
      throw new RetrievalError('RATE_LIMIT', `Helmcode rate-limited the request (429): ${snippet}`, {
        status: response.status,
        providerRetryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
      })
    }
    if (response.status >= 500) {
      throw new RetrievalError('PROVIDER', `Helmcode failed with status ${response.status}: ${snippet}`, { status: response.status })
    }
    if (response.status !== SUCCESS_STATUS) {
      throw new RetrievalError('PROVIDER', `Helmcode answered an unexpected status ${response.status}: ${snippet}`, { status: response.status })
    }
    try {
      return JSON.parse(text)
    } catch (error) {
      throw new RetrievalError('MALFORMED', `Helmcode answered 200 with a body that is not JSON: ${snippet}`, { cause: error })
    }
  }
}
