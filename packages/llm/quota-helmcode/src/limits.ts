/**
 * Tabla de limites y cuotas de Helmcode, y las decisiones de atribucion.
 *
 * Con tarifa plana no se agota el dinero: se agotan las peticiones por minuto,
 * la concurrencia por modelo y la cuota mensual del plan. Esta tabla es la unica
 * fuente de esos numeros, y `verify.mjs`/`verify-route.cjs` del repositorio de
 * datos la contrastan con la documentacion publicada.
 *
 * Procedencia: https://helmcode.com/docs/rate-limits y https://helmcode.com/es/pricing,
 * consultadas el 2026-10-13. Los valores `null` son desconocidos, no cero.
 *
 * @module dsh-quota-helmcode/limits
 */

/** Los planes publicados. `enterprise` es a medida: casi todo queda por negociar. */
export type PlanId = 'starter' | 'growth' | 'scale' | 'enterprise'

/**
 * El cubo de cuota al que pertenece un modelo, que es lo que decide si su
 * consumo se agota o no.
 *
 * - `unlimited`: tokens ilimitados en todos los planes; solo limitan rpm y concurrencia.
 * - `sota`: cuenta contra la cuota mensual del plan.
 * - `addon`: cuota propia, por organizacion, separada de la del plan.
 */
export type QuotaBucket = 'unlimited' | 'sota' | 'addon'

/** La ruta de proveedor cuyo consumo pertenece a la cuota de Helmcode. */
export const HELMCODE_PROVIDER = 'helmcode'

/** Cuota mensual de un plan, en tokens. */
export interface PlanLimits {
  /** Precio de lista en euros al mes; `null` en enterprise, que es a medida. */
  readonly priceEurMonth: number | null
  /** API keys incluidas. */
  readonly apiKeys: number
  /** Cuota mensual del cubo `sota`, en tokens; `null` cuando es a medida. */
  readonly sotaTokensPerMonth: number | null
  /** Cuota mensual del add-on GLM 5.3, en tokens; `null` cuando es a medida. */
  readonly addonTokensPerMonth: number | null
  /** Imagenes al mes por organizacion; `null` cuando es a medida. */
  readonly imagesPerMonth: number | null
}

/** Los tres planes publicados con cifra, y el enterprise sin cifra publicada. */
export const PLANS: Readonly<Record<PlanId, PlanLimits>> = Object.freeze({
  starter: Object.freeze({
    priceEurMonth: 399,
    apiKeys: 5,
    sotaTokensPerMonth: 5_000_000_000,
    addonTokensPerMonth: 2_000_000_000,
    imagesPerMonth: 300,
  }),
  growth: Object.freeze({
    priceEurMonth: 1_299,
    apiKeys: 15,
    sotaTokensPerMonth: 15_000_000_000,
    addonTokensPerMonth: 6_500_000_000,
    imagesPerMonth: 600,
  }),
  scale: Object.freeze({
    priceEurMonth: 3_199,
    apiKeys: 40,
    sotaTokensPerMonth: 35_000_000_000,
    addonTokensPerMonth: 18_000_000_000,
    imagesPerMonth: 1_200,
  }),
  enterprise: Object.freeze({
    priceEurMonth: null,
    apiKeys: 60,
    sotaTokensPerMonth: null,
    addonTokensPerMonth: null,
    imagesPerMonth: null,
  }),
})

/** El plan que se asume cuando el perfil no dice ninguno. */
export const DEFAULT_PLAN: PlanId = 'growth'

/** Modelos con tokens ilimitados en todos los planes. */
export const UNLIMITED_MODELS: readonly string[] = Object.freeze(['qwen3.6', 'gemma4'])

/** Modelos que cuentan contra la cuota mensual del plan. */
export const SOTA_MODELS: readonly string[] = Object.freeze(['deepseek-v4-flash', 'glm5.3-flash'])

/** El add-on de pago por key: cuota propia y nunca cubierto por un plan. */
export const ADDON_MODELS: readonly string[] = Object.freeze(['glm5.3'])

/** Limites por API key, comunes a todos los planes. */
export interface KeyLimits {
  /** Peticiones por minuto. */
  readonly requestsPerMinute: number
  /** Peticiones concurrentes por modelo. */
  readonly concurrencyPerModel: number
  /** Peticiones concurrentes en los modelos de la lista siguiente. */
  readonly concurrencyPerModelHigh: number
  /** Los modelos que disfrutan de la concurrencia alta. */
  readonly highConcurrencyModels: readonly string[]
  /**
   * Tokens por minuto. `null` porque la documentacion se contradice: la pagina
   * de limites dice 2M para modelos de lenguaje y la de precios dice 3M por key.
   * Ver discrepancia D6. El medidor no debe asumir ninguna de las dos.
   */
  readonly tokensPerMinute: number | null
  /** Contexto maximo por peticion, comun a los modelos de un millon. */
  readonly contextPerRequest: number
}

/** Limites por key publicados. */
export const KEY_LIMITS: KeyLimits = Object.freeze({
  requestsPerMinute: 100,
  concurrencyPerModel: 5,
  concurrencyPerModelHigh: 10,
  highConcurrencyModels: Object.freeze(['glm5.3', 'glm5.3-flash', 'glm5.2', 'deepseek-v4-flash', 'qwen3.8-flash']),
  tokensPerMinute: null,
  contextPerRequest: 1_048_576,
})

/**
 * A que cubo pertenece una llamada concreta.
 *
 * La atribucion es por RUTA, no por identificador de modelo, y ese detalle es el
 * que evita un error caro: el mismo despliegue puede servir `deepseek-v4-flash`
 * o `glm5.3-flash` por otra ruta (en esta maquina, la ruta NaN los sirve), y
 * contarlos como cuota de Helmcode seria imputar a un plan un consumo que no es
 * suyo. Cualquier proveedor que no sea Helmcode devuelve `undefined`: no hay
 * cuota que descontar.
 *
 * @param provider - la ruta de proveedor que sirvio la llamada.
 * @param model - el identificador exacto del modelo.
 * @returns el cubo, o `undefined` cuando la llamada no pertenece a Helmcode.
 */
export function bucketOf(provider: string, model: string): QuotaBucket | undefined {
  if (provider !== HELMCODE_PROVIDER) return undefined
  if (ADDON_MODELS.includes(model)) return 'addon'
  if (SOTA_MODELS.includes(model)) return 'sota'
  if (UNLIMITED_MODELS.includes(model)) return 'unlimited'
  // Un modelo de Helmcode que la tabla no conoce se trata como ilimitado a
  // proposito: cobrar una cuota por algo que no se ha podido clasificar
  // bloquearia trabajo legitimo, y el aviso queda en el estado del medidor.
  return 'unlimited'
}

/**
 * Cuantas peticiones concurrentes admite un modelo.
 * @param model - el identificador exacto del modelo.
 * @returns el limite de concurrencia aplicable.
 */
export function concurrencyLimitFor(model: string): number {
  return KEY_LIMITS.highConcurrencyModels.includes(model)
    ? KEY_LIMITS.concurrencyPerModelHigh
    : KEY_LIMITS.concurrencyPerModel
}

/**
 * Cuota mensual de un cubo para un plan.
 * @param plan - el plan contratado.
 * @param bucket - el cubo cuyo tope se consulta.
 * @returns el tope en tokens, o `null` cuando el plan es a medida o el cubo es ilimitado.
 */
export function monthlyCapTokens(plan: PlanId, bucket: QuotaBucket): number | null {
  if (bucket === 'unlimited') return null
  if (bucket === 'addon') return PLANS[plan].addonTokensPerMonth
  return PLANS[plan].sotaTokensPerMonth
}

/** Como de cerca esta el consumo del tope. */
export type QuotaStatus = 'ok' | 'low' | 'exhausted'

/** El cubo de mayor consumo, o `undefined` sin ningun cubo con consumo. */
export interface LargestBucket {
  /** El cubo senalado. */
  readonly bucket: QuotaBucket
  /** Tokens consumidos en ese cubo. */
  readonly usedTokens: number
}

/**
 * Elige el cubo que la tarjeta senala: el de mayor consumo.
 *
 * Los empates se resuelven por el orden fijo de los cubos (`sota`, `addon`,
 * `unlimited`), no por el orden de las claves del objeto: dos rutas con las
 * mismas cifras deben pintar la misma tarjeta en cualquier motor.
 *
 * @param used - tokens consumidos por cubo; un valor ausente es cero.
 * @returns el cubo de mayor consumo, o `undefined` cuando no hay ninguno.
 */
export function largestBucket(
  used: Readonly<Record<QuotaBucket, number>>,
): LargestBucket | undefined {
  const order: readonly QuotaBucket[] = ['sota', 'addon', 'unlimited']
  let largest: LargestBucket | undefined
  for (const bucket of order) {
    const value = used[bucket]
    const tokens = Number.isFinite(value) && value > 0 ? value : 0
    if (tokens === 0 || (largest !== undefined && tokens <= largest.usedTokens)) continue
    largest = { bucket, usedTokens: tokens }
  }
  return largest
}

/** Estado de un cubo medido contra su tope. */
export interface QuotaState {
  /** El cubo medido. */
  readonly bucket: QuotaBucket
  /** Tokens consumidos en el periodo. */
  readonly usedTokens: number
  /** El tope del periodo, o `null` si no hay tope. */
  readonly capTokens: number | null
  /** Tokens que quedan, o `null` si no hay tope. */
  readonly remainingTokens: number | null
  /** Fraccion consumida de 0 a 1, o `null` si no hay tope. */
  readonly ratio: number | null
  /** Clasificacion del consumo. */
  readonly status: QuotaStatus
  /**
   * A que modelo conviene degradar cuando este cubo se agota. `undefined`
   * cuando no hay nada mejor a lo que bajar: bajar de un modelo ilimitado no
   * tiene sentido.
   */
  readonly degradationTarget: string | undefined
}

/** Fraccion consumida a partir de la cual se avisa antes de agotar el cubo. */
export const LOW_WATERMARK = 0.8

/** El modelo ilimitado al que se degrada por defecto. */
export const DEFAULT_DEGRADATION_TARGET = 'qwen3.6'

/**
 * Mide un cubo contra su tope y decide si hay que avisar, degradar o parar.
 * @param plan - el plan contratado.
 * @param bucket - el cubo medido.
 * @param usedTokens - tokens consumidos en el periodo; se ignora un valor negativo.
 * @returns el estado del cubo, con la degradacion sugerida cuando la hay.
 */
export function quotaState(plan: PlanId, bucket: QuotaBucket, usedTokens: number): QuotaState {
  const used = Number.isFinite(usedTokens) && usedTokens > 0 ? usedTokens : 0
  const cap = monthlyCapTokens(plan, bucket)
  if (cap === null) {
    return {
      bucket,
      usedTokens: used,
      capTokens: null,
      remainingTokens: null,
      ratio: null,
      status: 'ok',
      degradationTarget: undefined,
    }
  }
  const remaining = Math.max(0, cap - used)
  const ratio = cap === 0 ? 1 : used / cap
  const status: QuotaStatus = remaining === 0 ? 'exhausted' : ratio >= LOW_WATERMARK ? 'low' : 'ok'
  return {
    bucket,
    usedTokens: used,
    capTokens: cap,
    remainingTokens: remaining,
    ratio,
    status,
    // Solo se degrada desde un cubo con tope: el ilimitado ya es el suelo.
    degradationTarget: bucket === 'unlimited' ? undefined : DEFAULT_DEGRADATION_TARGET,
  }
}

/**
 * Decide si conviene cambiar de modelo antes de gastar la peticion, y a cual.
 *
 * Es la politica que el plan pide: cuando la cuota de un modelo con tope se
 * agota, degradar a un modelo ilimitado en vez de devolver un error. Un proceso
 * nocturno prefiere terminar con un modelo algo peor a caerse.
 *
 * @param plan - el plan contratado.
 * @param provider - la ruta que serviria la llamada.
 * @param model - el modelo pedido.
 * @param usedTokensInBucket - consumo del periodo en el cubo del modelo pedido.
 * @returns el modelo al que conviene cambiar, o `undefined` para seguir con el pedido.
 */
export function suggestDegradation(
  plan: PlanId,
  provider: string,
  model: string,
  usedTokensInBucket: number,
): string | undefined {
  const bucket = bucketOf(provider, model)
  if (bucket === undefined || bucket === 'unlimited') return undefined
  const state = quotaState(plan, bucket, usedTokensInBucket)
  if (state.status !== 'exhausted') return undefined
  // No se degrada al mismo modelo que ya se estaba pidiendo.
  return state.degradationTarget === model ? undefined : state.degradationTarget
}
