/**
 * Guardia de residencia, cara de NAVEGADOR: publica la misma cara de lectura que
 * la mitad host (`ctx.guardEuRouting`, ver `../residency.ts`) sobre la tabla de
 * residencia POR DEFECTO, para que el selector de modelos pueda decir donde
 * corre cada ruta sin editar el componente que lo pinta.
 *
 * **Por que el navegador no tiene la tabla efectiva.** La tabla del host es
 * `DEFAULT_RESIDENCY_TABLE` mas la `residency` que sume la configuracion del
 * perfil; el Loader del navegador crea cada entrada con `{ name }` y sin
 * configuracion (`packages/client/modules/src/client/entries.ts:168`), asi que
 * lo que un perfil anade a la tabla NO llega al navegador y aqui se lee
 * `'unknown'`. Es una limitacion declarada, no una politica: el VETO no depende
 * de esta mitad —lo decide el host con la tabla efectiva en `llm/stream` y en
 * `tools/pre-execute`—, y `'unknown'` es la lectura default-deny de la tabla,
 * nunca un permiso.
 *
 * **Fail-soft.** Esta mitad existe solo mientras la guardia esta montada; sin
 * su entrada en el roster no hay `ctx.guardEuRouting`, y la interfaz que lo lee
 * con `ctx.get` no pinta etiqueta.
 *
 * @module @deepseek-ai/dsh-guard-eu-routing/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { DEFAULT_RESIDENCY_TABLE } from '../defaults.ts'
import { residencyReader } from '../residency.ts'
import type { GuardEuRouting } from '../residency.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /**
     * Lectura de residencia de la guardia en el navegador. OPCIONAL: sin la
     * guardia montada no existe, y quien la lee pregunta por `ctx.get`.
     */
    guardEuRouting?: GuardEuRouting
  }
}

/**
 * Esta mitad no depende de ningun servicio del navegador: publica una tabla
 * constante, asi que se monta en cuanto su entrada del roster esta lista.
 */
export const inject: string[] = []

/**
 * Publica la cara de lectura del navegador.
 * @param ctx - contexto del plugin de navegador.
 */
export function apply(ctx: ClientContext): void {
  ctx.provide('guardEuRouting', residencyReader(DEFAULT_RESIDENCY_TABLE))
}
