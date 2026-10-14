/**
 * Vocabulario puro del estimador de cuota de Helmcode: el UNICO hogar de la
 * clave de proyeccion `quotaEstimate`, libre de los imports de valor del lado
 * host (zod, el registro de proyecciones). El merge de `SessionProjectionMap`
 * vive aqui para que el cliente pueda leer la vista sin depender del host.
 *
 * @module @deepseek-ai/dsh-quota-helmcode/types
 */

import type { QuotaBucket, QuotaStatus } from './limits.ts'

/** Tokens y peticiones medidos en un cubo. */
export interface QuotaBucketUsage {
  /** Cubo medido. */
  readonly bucket: QuotaBucket
  /** Tokens acumulados de las rutas Helmcode del cubo. */
  readonly usedTokens: number
}

/**
 * La estimacion local de una sesion. Es un ESTIMADOR, no la verdad: solo ve los
 * eventos de esta sesion y de esta maquina, mientras que el limite real es por
 * key y por organizacion, compartido con todo lo demas que use la misma clave.
 * La consola de Helmcode es la unica fuente autoritativa.
 */
export interface QuotaEstimateView {
  /** El cubo con mayor consumo de la sesion, o `null` sin consumo contabilizado. */
  readonly bucket: QuotaBucket | null
  /** Tokens estimados del cubo senalado; 0 sin consumo. */
  readonly usedTokens: number
  /** El tope mensual del plan; `null` cuando el plan es a medida o el cubo no tiene tope. */
  readonly capTokens: number | null
  /** Estado del cubo senalado. */
  readonly status: QuotaStatus
  /** Peticiones por minuto de la ventana deslizante; `rpm` es la estimacion local. */
  readonly window: {
    /** Peticiones de Helmcode contabilizadas. */
    readonly rpm: number
    /** El limite publicado por key. */
    readonly limit: number
  }
  /** Consumo por cubo, en el orden fijo de la tabla. */
  readonly buckets: readonly QuotaBucketUsage[]
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Estimacion local del consumo de cuota de Helmcode; la consola es la verdad. */
    quotaEstimate: QuotaEstimateView
  }
}
