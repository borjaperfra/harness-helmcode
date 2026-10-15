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
 * obedece. Publica ademas la cara de LECTURA de la tabla
 * (`ctx.guardEuRouting`, ver `residency.ts`), de la que el host sirve la
 * residencia de cada modelo del catalogo; esa cara no veta nada.
 *
 * @module @deepseek-ai/dsh-guard-eu-routing
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { PreToolDecision, ToolErrorInfo } from '@deepseek-ai/dsh-tools'
import { decideModelRoute, decideRouteEndpoint, decideTool } from './decisions.ts'
import type { EgressToolTable, ResidencyEndpointTable, ResidencyMode, ResidencyTable } from './decisions.ts'
import { DEFAULT_EGRESS_TOOLS, DEFAULT_RESIDENCY_ENDPOINTS, DEFAULT_RESIDENCY_TABLE } from './defaults.ts'
import { residencyReader } from './residency.ts'
import type { GuardEuRouting } from './residency.ts'

export * from './decisions.ts'
export * from './defaults.ts'
export * from './residency.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /**
     * Lectura de residencia de la guardia. Es OPCIONAL porque la guardia no
     * tiene por que estar montada: sin entrada en el roster, `ctx.get` contesta
     * `undefined` y la interfaz no pinta etiqueta (fail-soft). Quien necesite
     * saber si hay guardia pregunta por `ctx.get('guardEuRouting')`.
     */
    guardEuRouting?: GuardEuRouting
  }
}

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
   * URL base esperada por proveedor, que se SUMA a
   * {@link DEFAULT_RESIDENCY_ENDPOINTS} (misma clave: gana la del perfil). Sirve
   * para un despliegue cuya ruta europea no es la del bundle; declarar aqui el
   * endpoint real es lo que hace que la residencia declarada siga siendo cierta.
   */
  endpoints?: Record<string, string>
  /**
   * Reglas de egreso que se SUMAN a las de por defecto. `tools` se declara
   * mutable porque es la ENTRADA de configuracion, que es como la valida
   * Schemastery; al leerla satisface {@link EgressToolTable}.
   */
  egressTools?: {
    /**
     * Nombres de herramienta que abren su propio trafico y que la guardia debe
     * vetar cuando el modo no autoriza el egreso. Se SUMAN a
     * {@link DEFAULT_EGRESS_TOOLS}, que es la lista blanca cerrada del paquete:
     * declarar un nombre aqui amplia lo conocido, y nunca retira una entrada por
     * defecto. Un nombre con el prefijo `mcp__` cubre las herramientas de ese
     * servidor MCP (ver {@link decideTool}).
     */
    tools: string[]
  }
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
  endpoints: z.dict(z.string()).default({}),
  egressTools: z.object({
    tools: z.array(z.string()).default([...DEFAULT_EGRESS_TOOLS.tools]),
  }).default({}),
})

/**
 * La URL base RESUELTA de una ruta, leida del seam de ajustes cuando la
 * composicion lo monta.
 *
 * El `baseURL` de una ruta no viaja en `GenerateOptions` —el waterfall
 * `llm/stream` recibe proveedor, modelo y mensajes— ni lo publica el seam de
 * LLM: vive en la configuracion de la fila `llm-pi-ai`, que
 * `ctx.settings.describe()` proyecta como el valor VIVO de cada entrada. Esta
 * funcion la busca por el id del proveedor dentro de `providers`, que es la forma
 * que ese perfil declara (`packages/bundle/helmcode/cordis.patch.yml:128`).
 *
 * El seam es OPCIONAL y se lee en cada llamada: sin el, esta funcion devuelve
 * `undefined` y la guardia no puede contradecir lo que la tabla afirma (no se
 * inventa un host). Leerlo es una pregunta a un servicio, no un fallo.
 *
 * @param ctx - contexto del plugin.
 * @param provider - el id del proveedor de la ruta.
 * @returns la URL base declarada para ese proveedor, si se puede observar.
 */
function observedBaseURL(ctx: Context, provider: string): string | undefined {
  const settings: unknown = ctx.get('settings')
  const describe = (settings as { describe?: unknown } | undefined)?.describe
  if (typeof describe !== 'function') return undefined
  let rows: unknown
  try {
    rows = (describe as () => unknown).call(settings)
  } catch {
    // Un seam que se niega a describirse no es un permiso ni una prueba de
    // egreso: la guardia sigue con lo que si puede comprobar.
    return undefined
  }
  if (!Array.isArray(rows)) return undefined
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue
    const value = (row as { value?: unknown }).value
    if (typeof value !== 'object' || value === null) continue
    const providers = (value as { providers?: unknown }).providers
    if (typeof providers !== 'object' || providers === null) continue
    const route = (providers as Record<string, unknown>)[provider]
    if (typeof route !== 'object' || route === null) continue
    const baseURL = (route as { baseURL?: unknown }).baseURL
    if (typeof baseURL === 'string' && baseURL.length > 0) return baseURL
  }
  return undefined
}

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
  const endpoints: ResidencyEndpointTable = { ...DEFAULT_RESIDENCY_ENDPOINTS, ...config.endpoints }
  const egressTools: EgressToolTable = {
    tools: [...DEFAULT_EGRESS_TOOLS.tools, ...config.egressTools?.tools ?? []],
  }

  // 0. La cara de LECTURA. Se publica sobre la tabla EFECTIVA —los valores por
  //    defecto mas lo que sume la configuracion del perfil—, que es la misma
  //    que decide el veto de abajo. El host la pregunta al servir el catalogo de
  //    modelos y viaja con cada modelo hasta la interfaz, de modo que la
  //    etiqueta que pinta el selector y el veredicto no pueden divergir. No
  //    decide nada; el veto sigue en los dos waterfalls.
  ctx.provide('guardEuRouting', residencyReader(residency, mode))

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
    // 1b. La residencia no es solo el nombre de la ruta: se comprueba tambien el
    //     ENDPOINT al que llega. Si el perfil cambio el `baseURL` de una ruta
    //     declarada europea, la declaracion ya no la cubre y el veto lo dice
    //     nombrando el host real. Sin URL observable no hay comparacion posible
    //     (ver `observedBaseURL`), y en `open` no hay politica que aplicar.
    const endpoint = decideRouteEndpoint(mode, endpoints, options.provider, options.model,
      observedBaseURL(ctx, options.provider))
    if (endpoint.kind === 'deny') {
      throw new LlmError(`[${endpoint.code}] ${endpoint.reason}`, endpoint.code)
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
