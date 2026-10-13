/**
 * Los valores por defecto de la guardia: la residencia de la ruta `helmcode` y
 * las herramientas que abren su propio trafico de red.
 *
 * La residencia por modelo NO se inventa: sale del catalogo del proyecto,
 * `helmcode-catalog/catalog.json`, campo `residency` de cada modelo. Los nombres
 * de herramienta tampoco se inventan: cada uno lleva citado el fichero y la linea
 * del checkout donde consta.
 *
 * Alcance deliberado de la tabla de residencia: contiene exactamente los cuatro
 * modelos que el bundle declara hoy como ruta europea, mas los nueve frontera que
 * la misma clave sirve desde Estados Unidos. Todo lo demas —incluidos
 * `helmcode/glm5.3`, que el catalogo marca `eu` pero el bundle deja fuera a
 * proposito por ser add-on por key, y los modelos que no son de conversacion
 * (`qwen3-embedding`, `rerank`, `whisper`, `kokoro`, que no pasan por `llm/stream`)
 * — cae en el default-deny. Anadirlos aqui seria conceder un permiso que nadie
 * pidio.
 *
 * @module @deepseek-ai/dsh-guard-eu-routing/defaults
 */

import type { EgressToolTable, ResidencyTable } from './decisions.ts'

/** La ruta de proveedor cuyos modelos sirve Helmcode. */
export const HELMCODE_PROVIDER = 'helmcode'

/**
 * Residencia por ruta `helmcode/modelo`.
 *
 * Los cuatro `eu` son los que `packages/bundle/helmcode/cordis.patch.yml` declara
 * (una sola ruta europea, con la clave en `HELMCODE_API_KEY`):
 * - `deepseek-v4-flash` — catalogo `residency: "eu"` en `catalog.json:108`; bundle en `cordis.patch.yml:50`.
 * - `glm5.3-flash` — catalogo `residency: "eu"` en `catalog.json:89`; bundle en `cordis.patch.yml:64`.
 * - `qwen3.6` — catalogo `residency: "eu"` en `catalog.json:128`; bundle en `cordis.patch.yml:75`.
 * - `gemma4` — catalogo `residency: "eu"` en `catalog.json:150`; bundle en `cordis.patch.yml:87`.
 *
 * Los nueve `us` son los modelos frontera que la misma clave sirve corriendo en
 * la infraestructura de su proveedor, fuera de la UE; el bundle no los declara
 * precisamente hasta que exista esta guardia (`cordis.patch.yml:21-25`):
 * - `claude-fable-5-1` `catalog.json:225`, `claude-opus-5-5` `catalog.json:236`,
 *   `claude-sonnet-5-5` `catalog.json:237`, `claude-haiku-4-5` `catalog.json:238`
 *   (`coverage: "credit"`, `provider: "Anthropic"`).
 * - `gpt-6-astra` `catalog.json:239`, `gpt-6.1-sol` `catalog.json:240`,
 *   `gpt-6-luna` `catalog.json:241` (`provider: "OpenAI"`).
 * - `gemini-3.8-flash` `catalog.json:242`, `gemini-3.5-flash-lite` `catalog.json:243`
 *   (`provider: "Google"`).
 *
 * Cualquier otro proveedor no aparece aqui y por tanto se lee como `'unknown'`,
 * que en `eu-only` es veto: la tabla es la lista blanca completa, no una lista
 * negra de proveedores conocidos.
 */
export const DEFAULT_RESIDENCY_TABLE: ResidencyTable = Object.freeze({
  // Ruta europea declarada.
  'helmcode/deepseek-v4-flash': 'eu',
  'helmcode/glm5.3-flash': 'eu',
  'helmcode/qwen3.6': 'eu',
  'helmcode/gemma4': 'eu',

  // Frontera fuera de la UE, servida por la misma clave.
  'helmcode/claude-fable-5-1': 'us',
  'helmcode/claude-opus-5-5': 'us',
  'helmcode/claude-sonnet-5-5': 'us',
  'helmcode/claude-haiku-4-5': 'us',
  'helmcode/gpt-6-astra': 'us',
  'helmcode/gpt-6.1-sol': 'us',
  'helmcode/gpt-6-luna': 'us',
  'helmcode/gemini-3.8-flash': 'us',
  'helmcode/gemini-3.5-flash-lite': 'us',
})

/**
 * Las herramientas que salen a la red por su cuenta, fuera del waterfall
 * `llm/stream`, y que por tanto no cubre la guardia de residencia por modelo.
 *
 * - `subagent_codex` — subagente externo, CLI fuera de proceso que habla con
 *   OpenAI por su cuenta. El nombre lo fija el preset del bundle,
 *   `packages/bundle/web-app/presets/standard.patch.yml:108` (`toolName: subagent_codex`;
 *   identico en `ptc.patch.yml:108` y en `cordis.patch.yml:107`), y lo registra el
 *   generico `packages/subagent/tool-subagent/src/index.ts:380` con `name: toolName`.
 *   El paquete del proveedor que ese preset monta es
 *   `packages/subagent/subagent-codex/`, que no registra herramienta sino el
 *   provider `codex` en `ctx.subagents` (`subagent-codex/src/index.ts:135`); su
 *   fila de roster `tool-subagent-codex` se documenta en
 *   `packages/subagent/subagent-codex/README.md:69`.
 * - `subagent_claude_code` — igual, CLI fuera de proceso que habla con Anthropic
 *   por su cuenta: `toolName: subagent_claude_code` en
 *   `packages/bundle/web-app/presets/standard.patch.yml:116`
 *   (identico en `ptc.patch.yml:116` y en `cordis.patch.yml:115`), registrado por
 *   el mismo generico en `tool-subagent/src/index.ts:380`. El provider
 *   `claude-code` vive en `packages/subagent/subagent-claude-code/src/index.ts:151`
 *   (`ctx.subagents.registerProvider`).
 * - `web_fetch` — sale a una URL arbitraria. Registrada en
 *   `packages/web/tool-web/src/fetch.ts:457` (`name: 'web_fetch'`).
 * - `web_search` — sale al proveedor de busqueda. Registrada en
 *   `packages/web/tool-web/src/search.ts:326` (`name: 'web_search'`).
 * - `mcp__*` — cualquier herramienta de un servidor MCP. Sus nombres se construyen
 *   en tiempo de ejecucion como `mcp__<serverName>__<rawName>` (`const joined =
 *   \`mcp__${serverName}__${rawName}\``) en `packages/mcp/mcp-client/src/tools.ts:82`;
 *   por eso la entrada es una regla de prefijo y no un nombre exacto.
 *
 * NO estan en esta tabla `subagent` (`standard.patch.yml:94`) ni `subagent_fork`
 * (`standard.patch.yml:101`): sus proveedores son los drivers en proceso que
 * heredan la ruta del padre, de modo que su trafico de modelo si pasa por
 * `llm/stream` y lo cubre `decideModelRoute`. Marcarlos aqui vetaria una
 * delegacion que no sale de la UE. La distincion es justamente el punto 2 del
 * hallazgo de la auditoria (§17.1 del plan).
 */
export const DEFAULT_EGRESS_TOOLS: EgressToolTable = Object.freeze({
  tools: Object.freeze([
    'subagent_codex',
    'subagent_claude_code',
    'web_fetch',
    'web_search',
    'mcp__*',
  ]),
})
