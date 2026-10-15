/**
 * Los valores por defecto de la guardia: la residencia de la ruta `helmcode` y
 * las herramientas que abren su propio trafico de red.
 *
 * La residencia por modelo NO se inventa: sale del catalogo del proyecto,
 * `helmcode-catalog/catalog.json`, campo `residency` de cada modelo. Los nombres
 * de herramienta tampoco se inventan: cada uno lleva citado el fichero y la linea
 * del checkout donde consta.
 *
 * Alcance deliberado de la tabla de residencia: contiene los cinco modelos que
 * el bundle declara hoy como ruta europea (el add-on `glm5.3` entro cuando la
 * prueba en vivo confirmo que la key del dueño lo sirve), las siete rutas
 * `nan-builders/*` que el dueño declaro europeas, mas los nueve frontera que
 * la misma clave sirve desde Estados Unidos. Todo lo demas —incluidos los
 * modelos que no son de conversacion (`qwen3-embedding`, `rerank`, `whisper`,
 * `kokoro`, que no pasan por `llm/stream`)— cae en el default-deny. Anadirlos
 * aqui seria conceder un permiso que nadie pidio.
 *
 * @module @deepseek-ai/dsh-guard-eu-routing/defaults
 */

import type { EgressToolTable, ResidencyEndpointTable, ResidencyTable } from './decisions.ts'

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
 *
 * Las siete rutas `nan-builders/*` son `eu` por decision del dueño, que confirmo
 * que NaN Builders es su suscripcion de Helmcode y que la residencia de esos
 * modelos es la Union Europea. Son los mismos modelos que la ruta `helmcode`
 * sirve, por la otra puerta de la misma suscripcion.
 */
export const DEFAULT_RESIDENCY_TABLE: ResidencyTable = Object.freeze({
  // Ruta europea declarada.
  'helmcode/deepseek-v4-flash': 'eu',
  'helmcode/glm5.3': 'eu',
  'helmcode/glm5.3-flash': 'eu',
  'helmcode/qwen3.6': 'eu',
  'helmcode/gemma4': 'eu',

  // La otra puerta de la suscripcion de Helmcode del dueño (NaN Builders), en la UE.
  'nan-builders/deepseek-v4-flash': 'eu',
  'nan-builders/glm5.3': 'eu',
  'nan-builders/glm5.3-flash': 'eu',
  'nan-builders/qwen3.6': 'eu',
  'nan-builders/qwen3.8-flash': 'eu',
  'nan-builders/gemma4': 'eu',
  'nan-builders/mimo-v2.6-flash': 'eu',

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
 * La URL base esperada de cada proveedor: el `expectedBaseURL` de la tabla.
 *
 * La residencia por `provider/model` dice donde corre la inferencia; esta tabla
 * dice por donde sale la peticion. Sin ella, cambiar el `baseURL` de la ruta
 * `helmcode` dejaba la guardia diciendo "UE" mientras el endpoint ya era otro:
 * una ruta europea lo es por el host al que llega, no por el nombre con el que se
 * la llama.
 *
 * La URL es la que declara el propio bundle:
 * `packages/bundle/helmcode/cordis.patch.yml:128` (`baseURL: https://api.helmcode.com/v1`
 * en el perfil `helmcode` de la fila `llm-pi-ai`). `nan-builders` NO se declara
 * aqui: su residencia es una decision del dueño sobre su suscripcion, y una
 * entrada solo se anade cuando su endpoint consta en el checkout.
 */
export const DEFAULT_RESIDENCY_ENDPOINTS: ResidencyEndpointTable = Object.freeze({
  [HELMCODE_PROVIDER]: 'https://api.helmcode.com/v1',
})

/**
 * Las herramientas que salen a la red por su cuenta, fuera del waterfall
 * `llm/stream`, y que por tanto no cubre la guardia de residencia por modelo.
 *
 * Cada entrada abre su PROPIO canal, y por eso ninguna queda cubierta por un
 * modelo europeo:
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
 * - `subagent` y `subagent_fork` — los dos subagentes genericos
 *   (`standard.patch.yml:94` y `:101`), registrados por el mismo generico con
 *   `name: toolName`. Un driver EN PROCESO hereda la ruta del padre y su trafico
 *   si pasa por `llm/stream`, pero la herramienta no promete eso: admite su
 *   propio proveedor y modelo para el hijo, de modo que la guardia por modelo no
 *   puede afirmar que el turno delegado salga por donde salio el padre. La tabla
 *   es una lista blanca de CANALES, no una promesa sobre el driver que hoy este
 *   montado: un perfil que quiera delegar en `eu-only` lo declara cambiando a
 *   `open`, que es la via para autorizar el egreso a sabiendas.
 * - `bash` y `pwsh` — ejecutan ordenes del sistema
 *   (`packages/shell/tool-bash/src/index.ts:374`, `name: 'bash'`;
 *   `packages/shell/tool-pwsh/src/index.ts:384`, `name: 'pwsh'`). Una orden puede
 *   abrir cualquier socket —`curl`, un cliente HTTP, un `git push`— sin pasar por
 *   ningun waterfall del harness: el canal es la propia shell.
 * - `terminal_*` — la familia del PTY
 *   (`packages/terminal/tool-terminal/src/index.ts`: `terminal_open:164`,
 *   `terminal_send:199`, `terminal_read:302`, `terminal_signal:335`,
 *   `terminal_close:360`, `terminal_list:391`). Es una shell interactiva con el
 *   mismo alcance que `bash`, y por eso la regla es de prefijo: no hay una
 *   herramienta llamada `terminal` que vetar.
 * - `plugin_manager` — instala y activa plugins
 *   (`packages/boot/plugin-manager/src/tools.ts:20`, `name: 'plugin_manager'`):
 *   sale a un registro npm, resuelve dependencias y muta la composicion, o sea que
 *   su egreso y su efecto no los ve la guardia por modelo.
 * - `index_workspace` e `index_url` — las dos herramientas de recuperacion que
 *   embeben texto (`packages/retrieval/helmcode/src/index.ts:674` y `:898`). Su
 *   egreso es la API de embeddings de Helmcode, que es UE: la residencia no es el
 *   problema, pero SI es egreso —el texto indexado sale del host— y esta guardia
 *   no presume de un canal que no controla. `knowledge_search` no entra aqui: su
 *   egreso lo decide el modo del perfil como cualquier otra lectura, y en un pack
 *   de salud es la herramienta con la que se trabaja.
 * - `web_fetch` — sale a una URL arbitraria. Registrada en
 *   `packages/web/tool-web/src/fetch.ts:457` (`name: 'web_fetch'`).
 * - `web_search` — sale al proveedor de busqueda. Registrada en
 *   `packages/web/tool-web/src/search.ts:326` (`name: 'web_search'`).
 * - `mcp__*` — cualquier herramienta de un servidor MCP. Sus nombres se construyen
 *   en tiempo de ejecucion como `mcp__<serverName>__<rawName>` (`const joined =
 *   \`mcp__${serverName}__${rawName}\``) en `packages/mcp/mcp-client/src/tools.ts:82`;
 *   por eso la entrada es una regla de prefijo y no un nombre exacto.
 *
 * La lista es la blanca completa: `decideTool` no veta nada que no este aqui, y
 * solo en `eu-only` (el seam de herramientas ya es fail-closed por si mismo). Un
 * perfil que necesite una de estas salidas lo declara pasando el modo a `open`, o
 * anade su propia regla; lo que no puede es dejarla pasar por no haberla
 * enumerado.
 */
export const DEFAULT_EGRESS_TOOLS: EgressToolTable = Object.freeze({
  tools: Object.freeze([
    'subagent_codex',
    'subagent_claude_code',
    'subagent',
    'subagent_fork',
    'bash',
    'pwsh',
    'terminal_*',
    'plugin_manager',
    'index_workspace',
    'index_url',
    'web_fetch',
    'web_search',
    'mcp__*',
  ]),
})
