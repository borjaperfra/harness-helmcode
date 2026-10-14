/**
 * El medidor local de cuota de Helmcode: la proyeccion de sesion `quotaEstimate`.
 *
 * ES UN ESTIMADOR, NO LA VERDAD. El limite publicado es por KEY y por
 * ORGANIZACION, asi que el mismo cubo lo comparten el IDE del cliente, su
 * pipeline nocturno y cualquier otra cosa que use esa clave; lo que esta
 * proyeccion mide es solo lo que ESTA sesion y ESTA maquina han visto pasar por
 * la ruta `helmcode`. Sirve para avisar antes de agotar el cubo, nunca para
 * afirmar cuanto queda: eso solo lo sabe la consola de Helmcode.
 *
 * Solo imputa al plan las rutas Helmcode: `bucketOf` devuelve `undefined` para
 * cualquier otro proveedor, y las rutas que sirven los mismos modelos (en esta
 * maquina, la ruta NaN) NO se imputan al plan. Pero tampoco se pierden: el
 * medidor las cuenta en un cubo `nan` SEPARADO, que publica tokens sin tope
 * —NaN no tiene tabla de limites publicada— y no entra ni en el cubo senalado
 * ni en la tasa de rpm de la clave.
 *
 * La ventana de rpm se poda contra el tiempo del evento que se pliega, nunca
 * contra un reloj leido en el render: el plegado es una funcion pura de
 * (estado, evento) y la vista es una funcion pura del estado.
 *
 * @module @deepseek-ai/dsh-quota-helmcode/projection
 */

import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
// Reexport de tipos: mantiene la tabla de proyecciones (y su augmentacion) en
// el programa que compila este modulo.
export type {} from '@deepseek-ai/dsh-session-projection/types'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import {
  DEFAULT_PLAN, KEY_LIMITS, bucketOf, largestBucket, quotaState,
  type QuotaBucket,
} from './limits.ts'
import type { QuotaEstimateView } from './types.ts'

/**
 * Los cubos en el orden fijo en que la vista los publica.
 */
const BUCKETS: readonly QuotaBucket[] = ['sota', 'addon', 'unlimited']

/** La ventana deslizante de la tasa de peticiones, en milisegundos. */
export const RPM_WINDOW_MS = 60_000

/** El plan asumido: el perfil no declara plan, asi que la tabla usa su defecto. */
export const QUOTA_PLAN = DEFAULT_PLAN

/** Tokens y marcas de tiempo medidos en un cubo. */
interface BucketUsage {
  /** Tokens medidos en el cubo: Helmcode, o la ruta NaN cuando el cubo es `nan`. */
  usedTokens: number
  /** Tiempos de las peticiones del cubo, sin podar. */
  timestamps: number[]
}

/** Estado plegado de la sesion (JSON plano, por contrato de la unidad). */
export interface QuotaEstimateState {
  /** Consumo por cubo; `null` mientras no haya ninguna llamada Helmcode. */
  sota: BucketUsage | null
  /** Consumo del add-on por key. */
  addon: BucketUsage | null
  /** Consumo del cubo sin tope. */
  unlimited: BucketUsage | null
  /** La vista publicada; se pliega con el estado para que su referencia sea estable. */
  view: QuotaEstimateView
}

/**
 * Tokens que una llamada descuenta de su cubo.
 *
 * Se prefiere el total exacto del proveedor cuando lo trae. Si no, se suman los
 * contadores DISJUNTOS del contrato (`inputTokens` es entrada sin cache; las
 * lecturas y escrituras de cache van aparte) y se excluye `reasoningTokens`,
 * que ya esta dentro de `outputTokens` y contarlo otra vez inflaria la cuota.
 * Un valor ausente, negativo o no finito vale cero: el medidor no inventa
 * consumo que el proveedor no haya declarado.
 *
 * @param usage - el registro de uso del evento `assistant/message`.
 * @returns los tokens a descontar, nunca negativo.
 */
export function usageTokens(usage: TokenUsage | undefined): number {
  if (usage === undefined) return 0
  const exact = usage.totalTokens
  if (typeof exact === 'number' && Number.isFinite(exact) && exact > 0) return exact
  const part = (value: number | undefined): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
  return part(usage.inputTokens) + part(usage.outputTokens)
    + part(usage.cacheReadTokens) + part(usage.cacheWriteTokens)
}

/** Acumula tokens y una marca de tiempo en el cubo de un evento Helmcode. */
function accumulate(
  usage: BucketUsage | null,
  tokens: number,
  time: number,
): BucketUsage {
  if (usage === null) return { usedTokens: tokens, timestamps: [time] }
  return { usedTokens: usage.usedTokens + tokens, timestamps: [...usage.timestamps, time] }
}

/**
 * Proyecta el consumo medido a la vista que el cliente lee.
 *
 * El cubo senalado y su tope salen SOLO de los tres cubos de Helmcode: el
 * consumo de NaN no imputa nada a un plan que no es suyo, y por eso no puede
 * convertirse en el cubo que la tarjeta senala. Aparece, con sus tokens, en
 * `buckets[]`, que es donde el operador ve lo que NaN ha gastado.
 *
 * @param measured - consumo por cubo y sus marcas de tiempo.
 * @returns la estimacion actual, con el cubo de mayor consumo senalado.
 */
function projectView(
  measured: Pick<QuotaEstimateState, 'sota' | 'addon' | 'unlimited'>,
): QuotaEstimateView {
  const used: Record<QuotaBucket, number> = {
    sota: measured.sota?.usedTokens ?? 0,
    addon: measured.addon?.usedTokens ?? 0,
    unlimited: measured.unlimited?.usedTokens ?? 0,
  }
  const fresh = [
    ...(measured.sota?.timestamps ?? []),
    ...(measured.addon?.timestamps ?? []),
    ...(measured.unlimited?.timestamps ?? []),
  ]
  const largest = largestBucket(used)
  const state = largest === undefined ? null : quotaState(QUOTA_PLAN, largest.bucket, largest.usedTokens)
  return {
    bucket: largest?.bucket ?? null,
    usedTokens: state?.usedTokens ?? 0,
    capTokens: state?.capTokens ?? null,
    status: state?.status ?? 'ok',
    window: { rpm: fresh.length, limit: KEY_LIMITS.requestsPerMinute },
    buckets: BUCKETS.map(bucket => ({
      bucket,
      usedTokens: used[bucket],
    })),
  }
}

const bucketUsageSchema = z.object({
  bucket: z.enum(['sota', 'addon', 'unlimited', 'nan']),
  usedTokens: z.number().nonnegative(),
}).strict()

const quotaEstimateSchema = z.object({
  bucket: z.enum(['sota', 'addon', 'unlimited']).nullable(),
  usedTokens: z.number().nonnegative(),
  capTokens: z.number().nonnegative().nullable(),
  status: z.enum(['ok', 'low', 'exhausted']),
  window: z.object({ rpm: z.number().int().nonnegative(), limit: z.number().int().positive() }).strict(),
  buckets: z.array(bucketUsageSchema),
}).strict()

const bucketUsageStateSchema = z.object({
  usedTokens: z.number().nonnegative(),
  timestamps: z.array(z.number()),
}).strict()

const quotaEstimateStateSchema = z.object({
  sota: bucketUsageStateSchema.nullable(),
  addon: bucketUsageStateSchema.nullable(),
  unlimited: bucketUsageStateSchema.nullable(),
  view: quotaEstimateSchema,
}).strict()

/** La vista de una sesion sin ninguna llamada medida. */
function emptyView(): QuotaEstimateView {
  return projectView({ sota: null, addon: null, unlimited: null })
}

/**
 * Pliega un evento en el estado del medidor.
 *
 * `assistant/message` es el evento que se cuenta: lleva a la vez el `usage` del
 * proveedor y la fuente (`message.source`) con la RUTA y el modelo que la
 * sirvieron, que es lo que decide el cubo. Una llamada de Helmcode va a su cubo
 * de cuota; una de la ruta NaN va a `nan`, aparte, para que su consumo se vea
 * sin imputarse a un plan que no es suyo. Cualquier otro evento devuelve la
 * MISMA referencia, que es lo que mantiene el feed de cambios en silencio.
 *
 * @param state - estado que cubre todos los eventos anteriores.
 * @param event - el siguiente evento comprometido.
 * @returns el estado siguiente.
 */
export function foldQuotaEstimate(state: QuotaEstimateState, event: SessionEvent): QuotaEstimateState {
  if (event.type !== 'assistant/message') return state
  const source = event.data.message.source
  // La guarda es defensiva, no decorativa: el contrato tipa la fuente de un
  // mensaje de asistente como ruta de modelo, pero el log es duradero y una
  // entrada reparada o migrada puede traer otra cosa. Sin ella, `bucketOf`
  // recibiria `undefined` en lugar de un cubo.
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- log duradero, no solo el tipo en memoria
  if (source.kind !== 'model') return state
  const measured: QuotaBucket | undefined =
    bucketOf(source.provider, source.model)
  if (measured === undefined) return state
  const tokens = usageTokens(event.data.usage)
  const cutoff = event.time - RPM_WINDOW_MS
  const next: QuotaEstimateState = {
    ...state,
    [measured]: accumulate(state[measured], tokens, event.time),
  }
  for (const name of BUCKETS) {
    const current = next[name]
    if (current === null) continue
    // La ventana es deslizante y el plegado es puro: se poda contra el tiempo
    // del evento que acaba de llegar, no contra un reloj leido en el render.
    const timestamps = current.timestamps.filter(time => time > cutoff)
    next[name] = { usedTokens: current.usedTokens, timestamps }
  }
  next.view = projectView(next)
  return next
}

/** La unidad `quotaEstimate` registrada en `ctx.sessionProjections`. */
export const quotaEstimateProjectionDefinition = {
  key: 'quotaEstimate',
  stateVersion: 1,
  stateSchema: quotaEstimateStateSchema,
  init: () => ({ sota: null, addon: null, unlimited: null, view: emptyView() }),
  apply: foldQuotaEstimate,
  wire: {
    viewSchema: quotaEstimateSchema,
    view: (state: QuotaEstimateState) => state.view,
  },
} satisfies ProjectionDefinition<'quotaEstimate', QuotaEstimateState>

/** Los cubos publicados por la vista, en su orden fijo. */
export { BUCKETS }
