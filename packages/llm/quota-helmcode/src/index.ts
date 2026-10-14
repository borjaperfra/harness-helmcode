/**
 * Cuotas del plan de Helmcode para el DeepSeek Harness.
 *
 * El paquete tiene tres piezas y ninguna sobra: la tabla de limites publicados
 * (`limits.ts`), su politica de atribucion y degradacion, y el medidor local
 * (`projection.ts`) que la contrasta con lo que de verdad pasa por la ruta
 * `helmcode`. El medidor es un ESTIMADOR: el limite real es por key y por
 * organizacion, y quien lo conoce es la consola de Helmcode.
 *
 * @module @deepseek-ai/dsh-quota-helmcode
 */

import type { Context } from '@deepseek-ai/cordis'
import { quotaEstimateProjectionDefinition } from './projection.ts'

export * from './limits.ts'
export * from './projection.ts'
export * from './types.ts'

/** Servicios que este plugin necesita: el registro de proyecciones de sesion. */
export const inject = ['sessionProjections']

/**
 * Monta el medidor local de cuota sobre la sesion.
 * @param ctx - contexto del plugin host.
 */
export function apply(ctx: Context): void {
  ctx.sessionProjections.register(quotaEstimateProjectionDefinition)
}
