/**
 * El whisper de Helmcode como proveedor de transcripcion del harness.
 *
 * El nucleo puro —troceador de WAV y cliente del endpoint— vive en los otros
 * modulos del paquete; este fichero es el CABLEADO, y sus tres decisiones no son
 * intercambiables:
 *
 * 1. **Implementa la interfaz de STT que ya existe.** Registra el proveedor en
 *    `ctx.speechToText`, el mismo registro que usa el proveedor local
 *    experimental, asi que el voice-input-bundle puede montarlo sin cambios.
 * 2. **La clave sale del credential store.** `ctx.credentials` resuelve
 *    `HELMCODE_API_KEY` al principio de CADA transcripcion —la misma clave que
 *    ya usa la ruta de inferencia—, de modo que una clave rotada llega a la
 *    siguiente llamada sin reiniciar nada y sin viajar por la composicion.
 * 3. **El transporte se inyecta EXPLICITAMENTE.** El cliente exige un `fetch`
 *    sin valor por defecto y aqui se pasa `globalThis.fetch`, leido en cada
 *    transcripcion: no hay camino que salga a la red sin que la composicion lo
 *    haya decidido, y los tests sustituyen ese global por un doble.
 *
 * El audio SALE HACIA LA UE: `https://api.helmcode.com` es la ruta europea y la
 * guardia de egress ya cubre este endpoint en su allowlist.
 *
 * @module @deepseek-ai/dsh-speech-to-text-helmcode
 */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
// Type-only: el registro `ctx.speechToText` y los tipos de la interfaz.
import type {} from '@deepseek-ai/dsh-experimental-speech-to-text'
import type {
  SpeechInput,
  SpeechProviderId,
  SpeechProviderInfo,
  Transcript,
} from '@deepseek-ai/dsh-experimental-speech-to-text/types'
import z from '@deepseek-ai/schemastery'
import { chunkWave } from './chunker.ts'
import { HelmcodeTranscriptionClient } from './client.ts'
import type { FetchLike } from './client.ts'
import { TranscriptionError } from './errors.ts'

export * from './chunker.ts'
export * from './client.ts'
export * from './errors.ts'

/** Nombre del plugin para los diagnosticos del loader. */
export const name = 'speech-to-text-helmcode'

/**
 * Los dos seams que hay que inyectar: `speechToText` (el registro en el que se
 * da de alta el proveedor) y `credentials` (de donde sale la clave, que NO
 * viaja en el patch del bundle).
 */
export const inject = ['speechToText', 'credentials']

/** El id con el que este proveedor se registra por defecto. */
export const DEFAULT_PROVIDER_ID = 'helmcode-whisper'

/** La referencia de credencial por defecto de la clave de Helmcode. */
export const DEFAULT_API_KEY_REF = 'HELMCODE_API_KEY'

/**
 * La raiz por defecto de la API de Helmcode, SIN `/v1`: el cliente anade
 * {@link TRANSCRIPTION_PATH}.
 */
export const DEFAULT_BASE_URL = 'https://api.helmcode.com'

/** El modelo de transcripcion por defecto. */
export const DEFAULT_MODEL = 'whisper'

/** La duracion objetivo de cada segmento, en segundos (~2 minutos). */
export const DEFAULT_SEGMENT_SECONDS = 120

/** El limite por peticion de whisper: 25 MB. */
export const MAX_REQUEST_BYTES = 25 * 1024 * 1024

/** Los reintentos por defecto de un 429. */
export const DEFAULT_MAX_RETRIES = 2

/** La espera por defecto tras un 429 sin `Retry-After`, en milisegundos. */
export const DEFAULT_RETRY_DELAY_MS = 1000

/**
 * Los idiomas que whisper acepta, mas `auto` para deteccion automatica.
 *
 * El registro de STT exige que el idioma elegido este en esta lista: por eso
 * incluye el juego completo del modelo (99+ idiomas) y no solo unos pocos, que
 * dejarian fuera selecciones legitimas.
 */
export const WHISPER_LANGUAGES: readonly string[] = [
  'auto', 'af', 'am', 'ar', 'as', 'az', 'ba', 'be', 'bg', 'bn', 'bo', 'br', 'bs', 'ca', 'cs', 'cy', 'da', 'de',
  'el', 'en', 'es', 'et', 'eu', 'fa', 'fi', 'fo', 'fr', 'gl', 'gu', 'ha', 'haw', 'he', 'hi', 'hr', 'ht', 'hu',
  'hy', 'id', 'is', 'it', 'ja', 'jw', 'ka', 'kk', 'km', 'kn', 'ko', 'la', 'lb', 'ln', 'lo', 'lt', 'lv', 'mg',
  'mi', 'mk', 'ml', 'mn', 'mr', 'ms', 'mt', 'my', 'ne', 'nl', 'nn', 'no', 'oc', 'pa', 'pl', 'ps', 'pt', 'ro',
  'ru', 'sa', 'sd', 'si', 'sk', 'sl', 'sn', 'so', 'sq', 'sr', 'su', 'sv', 'sw', 'ta', 'te', 'tg', 'th', 'tk',
  'tl', 'tr', 'tt', 'uk', 'ur', 'uz', 'vi', 'yi', 'yo', 'yue', 'zh',
]

/** La configuracion del plugin, tal como la declara el perfil. */
export interface Config {
  /** Id del proveedor registrado. Ausente: {@link DEFAULT_PROVIDER_ID}. */
  providerId?: string
  /** Referencia de credencial de la clave. Ausente: {@link DEFAULT_API_KEY_REF}. */
  apiKeyRef?: string
  /** Raiz de la API, sin `/v1`. Ausente: {@link DEFAULT_BASE_URL}. */
  baseURL?: string
  /** Modelo pedido al endpoint. Ausente: {@link DEFAULT_MODEL}. */
  model?: string
  /** Duracion objetivo de cada segmento. Ausente: {@link DEFAULT_SEGMENT_SECONDS}. */
  segmentSeconds?: number
  /** Limite de bytes por peticion. Ausente: {@link MAX_REQUEST_BYTES}. */
  maxRequestBytes?: number
  /** Reintentos de un 429; `0` los desactiva. Ausente: {@link DEFAULT_MAX_RETRIES}. */
  maxRetries?: number
  /** Espera tras un 429 sin `Retry-After`. Ausente: {@link DEFAULT_RETRY_DELAY_MS}. */
  retryDelayMs?: number
}

/**
 * Esquema de configuracion NATIVO de Schemastery, que es el unico que el
 * validador de config del harness reconoce. Los ocho campos son opcionales; sin
 * ninguno, el plugin usa sus valores por defecto (ver {@link Config}).
 */
export const Config: z<Config> = z.object({
  providerId: z.string(),
  apiKeyRef: z.string(),
  baseURL: z.string(),
  model: z.string(),
  segmentSeconds: z.number(),
  maxRequestBytes: z.number(),
  maxRetries: z.number(),
  retryDelayMs: z.number(),
})

/** La configuracion ya resuelta, con los valores por defecto aplicados. */
interface EffectiveConfig {
  readonly providerId: string
  readonly apiKeyRef: string
  readonly baseURL: string
  readonly model: string
  readonly segmentSeconds: number
  readonly maxRequestBytes: number
  readonly maxRetries: number
  readonly retryDelayMs: number
}

/**
 * Comprueba que un campo de la configuracion es un entero positivo.
 *
 * @param field - nombre del campo, para el mensaje.
 * @param value - el valor declarado.
 * @returns el valor, ya comprobado.
 * @throws {Error} cuando no es un entero positivo.
 */
function requirePositiveInteger(field: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`speech-to-text-helmcode: ${field} must be a positive integer`)
  }
  return value
}

/**
 * Comprueba que un campo de la configuracion es un entero no negativo.
 *
 * @param field - nombre del campo, para el mensaje.
 * @param value - el valor declarado.
 * @returns el valor, ya comprobado.
 * @throws {Error} cuando no es un entero no negativo.
 */
function requireNonNegativeInteger(field: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`speech-to-text-helmcode: ${field} must be a non-negative integer`)
  }
  return value
}

/**
 * Aplica los valores por defecto y comprueba los limites declarados.
 *
 * @param config - la configuracion del perfil, tal como llego del loader.
 * @returns la configuracion efectiva.
 * @throws {Error} cuando un tamano no es un entero positivo, o cuando el
 *         numero de reintentos o la espera son negativos.
 */
function effectiveConfig(config: Config): EffectiveConfig {
  return {
    providerId: config.providerId ?? DEFAULT_PROVIDER_ID,
    apiKeyRef: config.apiKeyRef ?? DEFAULT_API_KEY_REF,
    baseURL: config.baseURL ?? DEFAULT_BASE_URL,
    model: config.model ?? DEFAULT_MODEL,
    segmentSeconds: requirePositiveInteger('segmentSeconds', config.segmentSeconds ?? DEFAULT_SEGMENT_SECONDS),
    maxRequestBytes: requirePositiveInteger('maxRequestBytes', config.maxRequestBytes ?? MAX_REQUEST_BYTES),
    maxRetries: requireNonNegativeInteger('maxRetries', config.maxRetries ?? DEFAULT_MAX_RETRIES),
    retryDelayMs: requireNonNegativeInteger('retryDelayMs', config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS),
  }
}

/**
 * La clave de Helmcode, resuelta en el credential store.
 *
 * @param ctx - contexto del plugin, dueno del seam `credentials`.
 * @param reference - la referencia declarada por la configuracion.
 * @returns el valor de la credencial.
 * @throws {TranscriptionError} MISSING_CREDENTIAL cuando la referencia no tiene
 *         la forma de una credencial o cuando no hay valor: sin clave no se
 *         abre ninguna peticion.
 */
async function resolveApiKey(ctx: Context, reference: string): Promise<string> {
  let ref: CredentialRef
  try {
    ref = credentialRef(reference)
  } catch (error) {
    throw new TranscriptionError(
      'MISSING_CREDENTIAL',
      `speech-to-text-helmcode: "${reference}" is not a valid credential reference (${String(error)}), `
      + 'so no transcription request can be authorized',
      { cause: error },
    )
  }
  const credential = await ctx.credentials.resolve(ref)
  if (credential === undefined) {
    throw new TranscriptionError(
      'MISSING_CREDENTIAL',
      `speech-to-text-helmcode: no credential is configured for ${reference}, so the provider refuses `
      + 'instead of transcribing without a key; store the Helmcode API key in the credential store and retry',
    )
  }
  return credential.value
}

/**
 * El transporte explicito: `globalThis.fetch`, leido en CADA transcripcion para
 * que la composicion —y un test con su doble— decidan por donde sale el trafico.
 *
 * @returns el `fetch` global.
 * @throws {TranscriptionError} NO_TRANSPORT si no hay un `fetch` global llamable.
 */
function globalTransport(): FetchLike {
  const impl = globalThis.fetch
  if (typeof impl !== 'function') {
    throw new TranscriptionError(
      'NO_TRANSPORT',
      'speech-to-text-helmcode: globalThis.fetch is unavailable, so no Helmcode request can be made; '
      + 'the provider refuses instead of transcribing without a transport',
    )
  }
  return impl
}

/**
 * Espera de verdad, para el reintento de un 429 en produccion.
 *
 * @param ms - milisegundos a esperar.
 * @returns una promesa que se resuelve tras la espera.
 */
function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

/**
 * Transcribe un audio completo con la clave resuelta y el `fetch` global.
 *
 * @param ctx - contexto del plugin.
 * @param effective - la configuracion ya resuelta.
 * @param input - el audio del harness y el idioma elegido.
 * @param signal - cancelacion de la llamada.
 * @returns el texto de todos los segmentos, la duracion medida del audio y el
 *         tiempo de inferencia acumulado.
 * @throws {TranscriptionError} MISSING_CREDENTIAL, NO_TRANSPORT o el codigo del
 *         nucleo (AUTH, RATE_LIMIT, FILE_TOO_LARGE, PROVIDER, MALFORMED).
 */
async function transcribe(
  ctx: Context,
  effective: EffectiveConfig,
  input: SpeechInput,
  signal: AbortSignal,
): Promise<Transcript> {
  signal.throwIfAborted()
  const apiKey = await resolveApiKey(ctx, effective.apiKeyRef)
  const client = new HelmcodeTranscriptionClient({
    baseUrl: effective.baseURL,
    apiKey,
    fetch: globalTransport(),
    model: effective.model,
    maxBytes: effective.maxRequestBytes,
    maxRetries: effective.maxRetries,
    retryDelayMs: effective.retryDelayMs,
    sleep: realSleep,
  })
  const segments = chunkWave(input.audio, {
    segmentSeconds: effective.segmentSeconds,
    maxBytes: effective.maxRequestBytes,
  })
  const texts: string[] = []
  let audioSeconds = 0
  let inferenceSeconds = 0
  for (const segment of segments) {
    const startedAt = performance.now()
    const text = await client.transcribe(segment, input.language, signal)
    inferenceSeconds += (performance.now() - startedAt) / 1000
    audioSeconds += segment.seconds
    if (text !== '') texts.push(text)
  }
  return { text: texts.join(' '), audioSeconds, inferenceSeconds }
}

/**
 * Registra el proveedor de whisper en el registro de STT del harness.
 *
 * @param ctx - contexto del plugin, dueno de los seams `speechToText` y `credentials`.
 * @param config - configuracion ya validada por {@link Config}.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const effective = effectiveConfig(config)
  const info: SpeechProviderInfo = {
    id: effective.providerId as SpeechProviderId,
    name: `Helmcode whisper (${effective.model})`,
    location: 'cloud',
    languages: WHISPER_LANGUAGES,
  }
  ctx.effect(() => {
    const unregister = ctx.speechToText.register({
      info,
      transcribe: async (input, signal) => await transcribe(ctx, effective, input, signal),
    })
    return async () => { await unregister() }
  })
}
