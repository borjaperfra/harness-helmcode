/**
 * Guardia de residencia y de egreso para la ruta europea de Helmcode.
 *
 * Este paquete decide dos cosas y solo dos: si una ruta de modelo puede salir
 * fuera de la UE, y si una herramienta que abre su propio trafico puede
 * ejecutarse. El criterio es default-deny: la tabla es una lista blanca cerrada.
 *
 * El nucleo puro vive en `decisions.ts` (sin imports, probado sin montar el
 * harness) y las tablas por defecto en `defaults.ts`; este fichero es el cableado
 * a los dos seams reales, y no decide nada por su cuenta: pregunta al nucleo y
 * obedece.
 *
 * @module @deepseek-ai/dsh-guard-eu-routing
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { PreToolDecision, ToolErrorInfo } from '@deepseek-ai/dsh-tools'
import { decideModelRoute, decideTool } from './decisions.ts'
import type { EgressToolTable, ResidencyMode, ResidencyTable } from './decisions.ts'
import { DEFAULT_EGRESS_TOOLS, DEFAULT_RESIDENCY_TABLE } from './defaults.ts'

export * from './decisions.ts'
export * from './defaults.ts'

/** Nombre del plugin para los diagnosticos del loader. */
export const name = 'guard-eu-routing'

/**
 * Los dos seams que hay que inyectar: `llm` (el waterfall por el que pasa toda
 * llamada de modelo) y `tools` (el pipeline por el que pasa toda llamada de
 * herramienta). Un `inject` con un nombre que no exista no monta el plugin, asi
 * que los dos estan confirmados contra el checkout.
 */
export const inject = ['llm', 'tools']

/** La configuracion del plugin, tal como la declara el perfil. */
export interface Config {
  /**
   * Modo de la guardia. Por defecto `'open'`: el modo es una decision del perfil
   * del cliente —es su despliegue, y su tratamiento del dato—, no de la maquina
   * de desarrollo, que no es un despliegue regulado; y un `eu-only` por defecto
   * romperia rutas legitimas que no estan en la tabla de residencia. Ver
   * {@link ResidencyMode}.
   */
  mode?: ResidencyMode
  /** Entradas de residencia que se SUMAN a las de por defecto (misma clave: gana la del perfil). */
  residency?: ResidencyTable
  /**
   * Reglas de egreso que se SUMAN a las de por defecto. `tools` se declara
   * mutable porque es la ENTRADA de configuracion, que es como la valida
   * Schemastery; al leerla satisface {@link EgressToolTable}.
   */
  egressTools?: { tools: string[] }
}

/**
 * Esquema de configuracion (Schemastery, el esquema nativo que el loader valida y
 * que `dsh --dump-config-schema` puede proyectar). Las dos tablas son opcionales y
 * vacias por defecto: quien compone la tabla efectiva es {@link apply}, sumando
 * las de {@link DEFAULT_RESIDENCY_TABLE} y {@link DEFAULT_EGRESS_TOOLS}. El
 * resolutor de `dict` de Schemastery reescribe las claves SOBRE el objeto que
 * recibe, asi que el valor por defecto no puede ser una tabla congelada.
 */
export const Config: z<Config> = z.object({
  mode: z.union(['eu-only', 'ask', 'open'] as const).default('open'),
  residency: z.dict(z.union(['eu', 'us', 'unknown'] as const)).default({}),
  egressTools: z.object({
    tools: z.array(z.string()).default([...DEFAULT_EGRESS_TOOLS.tools]),
  }).default({}),
})

/** La identidad estructurada del veto por herramienta, junto a su codigo. */
const EGRESS_TOOL_DENIED_ERROR_NAME = 'EgressToolDeniedError'

/**
 * Cablea la guardia a los dos waterfalls del runtime.
 *
 * El modo sale de la config y su valor por defecto es `'open'`: la maquina de
 * desarrollo no es un despliegue regulado y el modo pertenece al perfil del
 * cliente. Las tablas del perfil se suman a las de por defecto (`DEFAULT_*`):
 * declarar una entrada nueva amplia la lista de lo conocido, y nunca borra una
 * regla de egreso que el despliegue ya tenia.
 *
 * @param ctx - contexto del plugin; los listeners se disponen con el.
 * @param config - configuracion ya validada por {@link Config}.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const mode = config.mode ?? 'open'
  const residency: ResidencyTable = { ...DEFAULT_RESIDENCY_TABLE, ...config.residency }
  const egressTools: EgressToolTable = {
    tools: [...DEFAULT_EGRESS_TOOLS.tools, ...config.egressTools?.tools ?? []],
  }

  // 1. Egreso por modelo: el waterfall `llm/stream` envuelve TODA llamada de
  //    streaming (`packages/llm/llm/src/index.ts:75`). Su docblock autoriza el
  //    cortocircuito — "call `next()` to reach the resolved adapter's stream, or
  //    yield your own chunks to short-circuit" (`:66`, con `@mode waterfall` en
  //    `:73`)— y el waterfall de cordis compone a los listeners de modo que el
  //    que no llama a `next()` veta el resto de la cadena, incluido el adaptador
  //    (`vendor/cordis/src/events.ts:224-233`). Aqui no se emiten chunks propios:
  //    se lanza antes de abrir nada, que es el lado fail-closed.
  ctx.on('llm/stream', (options, next) => {
    const verdict = decideModelRoute(mode, residency, options.provider, options.model)
    if (verdict.kind === 'deny') {
      // Fail-closed: se corta la llamada ANTES de tocar el adaptador. Nunca se
      // degrada el modelo ni se deja pasar "solo esta vez": eso es decidir en
      // silencio (§17.3). El `code` de la decision viaja como `code` del
      // `LlmError` —y en el mensaje— para que el consumidor enrute por el y no
      // por el texto de la razon.
      throw new LlmError(`[${verdict.code}] ${verdict.reason}`, verdict.code)
    }
    // Camino permitido: se delega sin consumir el stream.
    return next()
  })

  // 2. Egreso por herramienta: hay salidas que el waterfall de modelo no ve.
  //    Los subagentes externos (`subagent_codex`, `subagent_claude_code`) son
  //    CLIs fuera de proceso que hablan con su proveedor por su cuenta, un
  //    servidor MCP abre su propio trafico, y `web_fetch`/`web_search` salen a
  //    una URL arbitraria. Ninguna de esas llamadas pasa por `llm/stream`.
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    // El nombre se compara tal cual llega al evento: `decideTool` ya soporta el
    // prefijo `mcp__*` con el que se construyen los nombres de un servidor MCP.
    const verdict = decideTool(mode, egressTools, exec.name)
    if (verdict.kind === 'deny') {
      // La variante `deny` de `PreToolDecision`
      // (`packages/core/tools/src/index.ts:607-609`): `reason` es el texto que
      // ve el modelo —y lleva el nombre de la herramienta y el codigo de la
      // decision—, e `info` es la identidad estructurada del fallo
      // (`ToolErrorInfo`, `:489-494`). El runtime materializa `Error: <reason>`
      // mas `error.info` (`:1519-1530`). No hay mas campos que rellenar.
      const info: ToolErrorInfo = { name: EGRESS_TOOL_DENIED_ERROR_NAME, code: verdict.code }
      return {
        kind: 'deny',
        reason: `[${verdict.code}] ${verdict.reason}`,
        info,
      }
    }
    return next()
  })
}
