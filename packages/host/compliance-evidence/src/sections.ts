/**
 * Las diez secciones del informe de evidencia: funciones puras, sin imports del
 * harness, sin red y sin disco, para que cada una se pueda probar por separado
 * sobre un volcado ya parseado.
 *
 * El volcado que consumen es el de `dsh --profile <nombre> --dump-config`
 * (`apps/cli/src/dump-config.ts`): una secuencia YAML de filas con `id`, `name`,
 * `config` y, a veces, `disabled`, con las capas marcadas por comentarios `# ==`
 * y expresiones `!!js` que aquí llegan ya convertidas en marcadores opacos
 * (`{ $js: … }`), porque este módulo no evalúa código.
 *
 * Regla de honestidad de todo el módulo: lo que el volcado no declara se imprime
 * como ausencia declarada o como `unknown`. Nunca se rellena con suposiciones, y
 * una declaración jamás se presenta como atestación.
 *
 * @module @deepseek-ai/dsh-compliance-evidence/sections
 */

/* ------------------------------------------------------------------ */
/* Contrato de entrada                                                */
/* ------------------------------------------------------------------ */

/** Residencia de una ruta `proveedor/modelo`. */
export type Residency = 'eu' | 'us' | 'unknown'

/** Tabla de residencia con clave `proveedor/modelo`. */
export type ResidencyTable = Record<string, Residency>

/**
 * El estado de la telemetría, que la CLI determina y la función pura sólo imprime.
 *
 * El volcado no basta para attestar la telemetría: la composición declara o no la
 * fila del exportador OTLP, pero la entrega se decide además con variables de
 * entorno de ejecución que un volcado de configuración no puede ver.
 */
export interface TelemetryEvidence {
  /** Si el volcado declara la fila del exportador OTLP y ésta no está deshabilitada. */
  readonly mounted: boolean
  /** Marca de tiempo ISO de la comprobación que produjo `mounted`. */
  readonly checkedAt: string
  /** Cómo se comprobó, en texto libre; se imprime literal en el informe. */
  readonly method?: string
  /** Filas del volcado relacionadas con la telemetría, si la CLI encontró alguna. */
  readonly rows?: readonly string[]
}

/**
 * Los datos del canal de redacción que la CLI aporta porque el volcado no los
 * puede traer: la composición declara dónde vive el mapa sellado —o no lo
 * declara, y entonces rige el valor por defecto del plugin—, pero ese valor por
 * defecto es relativo al home del harness, y un volcado de configuración no
 * declara el home del proceso ni variables de entorno.
 */
export interface RedactionEvidence {
  /** Si el volcado declara la fila del canal de redacción y ésta no está deshabilitada. */
  readonly mounted: boolean
  /** Cómo se comprobó, en texto libre; se imprime literal en el informe. */
  readonly method: string
  /** Home del harness resuelto en la máquina que generó el informe, no en el despliegue. */
  readonly resolvedHome: string
  /** Ruta por defecto del mapa sellado bajo ese home (`privacy/map.v1`). */
  readonly defaultMapPath: string
  /** Filas del volcado relacionadas con el canal, si la CLI encontró alguna. */
  readonly rows?: readonly string[]
}

/** La entrada completa del informe. */
export interface EvidenceInput {
  /** El volcado compuesto ya parseado; lo parsea la CLI, no este módulo. */
  readonly dump: unknown
  /** Residencia por `proveedor/modelo`, del catálogo del proyecto o de la guardia. */
  readonly residency: ResidencyTable
  /** Fecha ISO de generación. */
  readonly generatedAt: string
  /** Versión del generador. */
  readonly generatorVersion: string
  /** SHA-256 del volcado de entrada, tal como se leyó. */
  readonly dumpSha256: string
  /** Estado de la telemetría. */
  readonly telemetry: TelemetryEvidence
  /** Estado del canal de redacción y las rutas que la CLI puede resolver. */
  readonly redaction: RedactionEvidence
}

/* ------------------------------------------------------------------ */
/* Modelo de lectura del volcado                                      */
/* ------------------------------------------------------------------ */

/** Una expresión `!!js` del volcado, conservada como texto y nunca evaluada. */
export interface VerbatimJs {
  readonly $js: string
}

/** Un objeto YAML arbitrario del volcado. */
export type DumpRecord = Record<string, unknown>

/** Una fila de plugin del volcado compuesto. */
export interface DumpRow {
  readonly id: string
  readonly name: string
  /** `undefined` cuando la fila no trae la clave; puede ser `true`, `false` o `!!js`. */
  readonly disabled: unknown
  readonly config: unknown
  /** Cadena de filas ancestro más esta fila; `['tool-subagent-codex']` en la raíz. */
  readonly path: readonly string[]
  /** El objeto original del volcado, para inspección y para las pruebas. */
  readonly value: DumpRecord
}

/** Títulos de las diez secciones, en el orden obligatorio del informe. */
export const SECTION_TITLES = [
  'Qué es este documento',
  'Rutas de inferencia declaradas',
  'Modo de residencia configurado',
  'Inventario de canales de salida',
  'Superficie de datos local',
  'Canal de redacción',
  'Atribución',
  'Requisito de despliegue',
  'Inventario de plugins',
  'Huella',
] as const

const LLM_PI_AI = '@deepseek-ai/dsh-llm-pi-ai'
const GUARD_ID = 'guard-eu-routing'
const GUARD_NAME = '@deepseek-ai/dsh-guard-eu-routing'
const PRIVACY_ID = 'privacy-helmcode'
const PRIVACY_NAME = '@deepseek-ai/dsh-privacy-helmcode'
const IDENTITY_ID = 'identity-local'
const IDENTITY_NAME = '@deepseek-ai/dsh-identity-local'
/** La referencia de credencial por defecto de la clave del mapa sellado. */
const PRIVACY_DEFAULT_KEY_REF = 'PRIVACY_MAP_KEY'
const MCP_CLIENT = '@deepseek-ai/dsh-mcp-client'
const WEB_PLUGIN = '@deepseek-ai/dsh-web'
const WEB_SEARCH_PREFIX = '@deepseek-ai/dsh-web-search-'
const WEB_FETCH_PREFIX = '@deepseek-ai/dsh-web-fetch-'
const TOOL_WEB = '@deepseek-ai/dsh-tool-web'
const TOOL_SUBAGENT = '@deepseek-ai/dsh-tool-subagent'
const SUBAGENT_PROVIDER_PREFIX = '@deepseek-ai/dsh-subagent-'
const SESSION_LOG_JSONL = '@deepseek-ai/dsh-session-persistence-jsonl'
const SESSION_LOG = '@deepseek-ai/dsh-session-persistence'
const FS_CHECKPOINTS = '@deepseek-ai/dsh-fs-checkpoints'
const SPILL_LOCAL = '@deepseek-ai/dsh-spill-local'
const CREDENTIALS_LOCAL = '@deepseek-ai/dsh-credentials-local'
const LOG_EXPORT = '@deepseek-ai/dsh-session-log-export'
const TELEMETRY_OTEL = '@deepseek-ai/dsh-session-telemetry-otel'

/** Los proveedores de subagente que son CLIs fuera de proceso con egreso propio. */
const EXTERNAL_SUBAGENT_PROVIDERS: readonly string[] = ['codex', 'claude-code']

/* ------------------------------------------------------------------ */
/* Utilidades puras                                                   */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is DumpRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/**
 * `true` si el valor es un marcador de expresión `!!js` conservada.
 * @param value - el valor leído del volcado.
 * @returns `true` cuando el valor es un marcador `{ $js }` con texto.
 */
export function isVerbatimJs(value: unknown): value is VerbatimJs {
  return isRecord(value) && typeof value['$js'] === 'string'
}

/**
 * Imprime un valor del volcado sin evaluarlo: `!!js` vuelve a su forma original.
 * @param value - el valor leído del volcado.
 * @returns su representación textual, literal para un marcador `!!js`.
 */
export function renderValue(value: unknown): string {
  if (value === undefined) return '(sin declarar)'
  if (isVerbatimJs(value)) return `!!js ${value.$js}`
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  // `JSON.stringify` devuelve `undefined` para un valor sin forma JSON (una
  // función, un símbolo) y su tipo declarado no lo dice: ese caso se nombra aquí
  // en vez de dejar que una conversión genérica imprima `[object Object]`.
  if (typeof value === 'function' || typeof value === 'symbol') return String(value)
  return JSON.stringify(value)
}

/**
 * Recorre el volcado y devuelve sus filas de plugin en orden de documento.
 *
 * Una fila es un objeto con `id` y `name` de tipo cadena que forma parte del
 * roster. El descenso está restringido a las dos formas de anidamiento que el
 * volcado real usa —la fila de grupo (`config:` como secuencia, con
 * `name: cordis:group`) y el preset (`config.plugins`)— y NO entra en el resto
 * del `config`: los modelos declarados también llevan `id` y `name`
 * (`config.providers.<proveedor>.models[]`) y no son plugins, así que un barrido
 * indiscriminado los contaría como filas. Cada fila conserva su `path`, porque un
 * mismo id se repite dentro de varios presets.
 * @param dump - el volcado compuesto ya parseado.
 * @returns las filas encontradas, en el orden en que aparecen.
 */
export function dumpRows(dump: unknown): readonly DumpRow[] {
  const rows: DumpRow[] = []
  const seen = new Set<unknown>()
  const visitRoster = (node: unknown, ancestors: readonly string[]): void => {
    if (Array.isArray(node)) {
      if (seen.has(node)) return
      seen.add(node)
      for (const child of node) visitRoster(child, ancestors)
      return
    }
    if (!isRecord(node)) return
    if (seen.has(node)) return
    seen.add(node)
    const id = asString(node['id'])
    const name = asString(node['name'])
    if (id === undefined || name === undefined) return
    const path = [...ancestors, id]
    rows.push({ id, name, disabled: node['disabled'], config: node['config'], path, value: node })
    const config = node['config']
    if (Array.isArray(config)) {
      visitRoster(config, path)
      return
    }
    if (isRecord(config)) {
      const plugins = config['plugins']
      if (Array.isArray(plugins)) visitRoster(plugins, path)
    }
  }
  visitRoster(dump, [])
  return rows
}

/**
 * Etiqueta de una fila: su `id`, con los ancestros delante cuando está anidada.
 * @param row - la fila del volcado.
 * @returns la etiqueta de la fila, con sus ancestros unidos por ` › `.
 */
export function rowLabel(row: DumpRow): string {
  return row.path.join(' › ')
}

/**
 * Residencia declarada de `proveedor/modelo`; sin entrada, `unknown`.
 * @param table - la tabla de residencia que acompaña al volcado.
 * @param provider - el proveedor de la ruta.
 * @param model - el modelo de la ruta.
 * @returns la residencia declarada, o `unknown` cuando no hay entrada.
 */
export function residencyOf(table: ResidencyTable, provider: string, model: string): Residency {
  const value = table[`${provider}/${model}`]
  return value === 'eu' || value === 'us' ? value : 'unknown'
}

/** Estado legible de una fila para el inventario, a partir de su clave `disabled`. */
function rowState(disabled: unknown): string {
  if (disabled === undefined) return 'activa (sin `disabled`)'
  if (disabled === true) return 'deshabilitada (`disabled: true`)'
  if (disabled === false) return 'activa (`disabled: false`)'
  return `condicional (\`disabled: ${renderValue(disabled)}\`)`
}

function list(lines: readonly string[]): string {
  return lines.map(line => `- ${line}`).join('\n')
}

/* ------------------------------------------------------------------ */
/* Vistas tipadas de las filas que lee el informe                     */
/* ------------------------------------------------------------------ */

/** Un modelo declarado en la fila de un proveedor. */
export interface DeclaredModel {
  readonly id: string
  readonly name: string | undefined
}

/** Un proveedor de inferencia declarado en el volcado. */
export interface DeclaredProvider {
  readonly provider: string
  readonly rowId: string
  /** `id` de la fila con sus ancestros cuando está anidada. */
  readonly rowPath: string
  readonly pluginName: string
  readonly disabled: unknown
  readonly displayName: string | undefined
  readonly api: string | undefined
  readonly baseURL: string | undefined
  readonly apiKeyEnv: string | undefined
  readonly models: readonly DeclaredModel[]
}

/**
 * Proveedores de inferencia que el volcado declara: toda fila del plugin de
 * proveedores con un mapa `config.providers`.
 * @param rows - filas del volcado.
 * @returns los proveedores declarados, en orden de documento.
 */
export function declaredProviders(rows: readonly DumpRow[]): readonly DeclaredProvider[] {
  const out: DeclaredProvider[] = []
  for (const row of rows) {
    if (row.name !== LLM_PI_AI) continue
    const config = isRecord(row.config) ? row.config : {}
    const providers = isRecord(config['providers']) ? config['providers'] : {}
    for (const [provider, value] of Object.entries(providers)) {
      if (!isRecord(value)) continue
      const models: DeclaredModel[] = []
      for (const entry of asArray(value['models'])) {
        if (!isRecord(entry)) continue
        const id = asString(entry['id'])
        if (id === undefined) continue
        models.push({ id, name: asString(entry['name']) })
      }
      out.push({
        provider,
        rowId: row.id,
        rowPath: rowLabel(row),
        pluginName: row.name,
        disabled: row.disabled,
        displayName: asString(value['displayName']),
        api: asString(value['api']),
        baseURL: asString(value['baseURL']),
        apiKeyEnv: asString(value['apiKeyEnv']),
        models,
      })
    }
  }
  return out
}

/** Un servidor MCP declarado en el volcado. */
export interface DeclaredMcpServer {
  readonly rowId: string
  /** `id` de la fila con sus ancestros cuando está anidada. */
  readonly rowPath: string
  readonly serverName: string
  readonly transport: string
  /** URL para `streamable-http`, o `comando + argumentos` para `stdio`. */
  readonly endpoint: string
  readonly disabled: unknown
}

/**
 * Servidores MCP declarados. El cliente MCP monta un servidor por instancia
 * (`packages/mcp/mcp-client/src/index.ts`), así que cada fila es un servidor.
 * @param rows - filas del volcado.
 * @returns los servidores declarados, en orden de documento.
 */
export function declaredMcpServers(rows: readonly DumpRow[]): readonly DeclaredMcpServer[] {
  const out: DeclaredMcpServer[] = []
  for (const row of rows) {
    if (row.name !== MCP_CLIENT) continue
    const config = isRecord(row.config) ? row.config : {}
    const transport = asString(config['transport']) ?? 'unknown'
    const url = asString(config['url'])
    const command = asString(config['command'])
    const args = asArray(config['args']).map(argument => renderValue(argument))
    const endpoint = url ?? (command === undefined ? 'unknown' : [command, ...args].join(' '))
    out.push({
      rowId: row.id,
      rowPath: rowLabel(row),
      serverName: asString(config['serverName']) ?? `(sin serverName; fila ${row.id})`,
      transport,
      endpoint,
      disabled: row.disabled,
    })
  }
  return out
}

/** Un subagente externo declarado (CLI fuera de proceso con egreso propio). */
export interface DeclaredExternalSubagent {
  readonly rowId: string
  /** `id` de la fila con sus ancestros cuando está anidada. */
  readonly rowPath: string
  readonly provider: string
  readonly toolName: string
  readonly disabled: unknown
}

/**
 * Subagentes externos: filas de la herramienta genérica de subagente cuyo
 * `config.provider` es un CLI fuera de proceso, más las filas del paquete del
 * proveedor cuando la composición las monta directamente.
 * @param rows - filas del volcado.
 * @returns los subagentes externos declarados, en orden de documento.
 */
export function declaredExternalSubagents(rows: readonly DumpRow[]): readonly DeclaredExternalSubagent[] {
  const out: DeclaredExternalSubagent[] = []
  for (const row of rows) {
    if (row.name === TOOL_SUBAGENT) {
      const config = isRecord(row.config) ? row.config : {}
      const provider = asString(config['provider'])
      if (provider === undefined || !EXTERNAL_SUBAGENT_PROVIDERS.includes(provider)) continue
      out.push({
        rowId: row.id,
        rowPath: rowLabel(row),
        provider,
        toolName: asString(config['toolName']) ?? '(sin `toolName`)',
        disabled: row.disabled,
      })
      continue
    }
    if (!row.name.startsWith(SUBAGENT_PROVIDER_PREFIX)) continue
    const provider = row.name.slice(SUBAGENT_PROVIDER_PREFIX.length)
    if (!EXTERNAL_SUBAGENT_PROVIDERS.includes(provider)) continue
    out.push({
      rowId: row.id,
      rowPath: rowLabel(row),
      provider,
      toolName: '(fila del proveedor; sin herramienta propia)',
      disabled: row.disabled,
    })
  }
  return out
}

/** Un proveedor de búsqueda web declarado. */
export interface DeclaredWebSearch {
  readonly rowId: string
  /** `id` de la fila con sus ancestros cuando está anidada. */
  readonly rowPath: string
  readonly pluginName: string
  readonly provider: string
  readonly disabled: unknown
}

/**
 * Proveedores de búsqueda web declarados (una fila por plugin `dsh-web-search-*`).
 * @param rows - filas del volcado.
 * @returns los proveedores declarados, en orden de documento.
 */
export function declaredWebSearch(rows: readonly DumpRow[]): readonly DeclaredWebSearch[] {
  const out: DeclaredWebSearch[] = []
  for (const row of rows) {
    if (!row.name.startsWith(WEB_SEARCH_PREFIX)) continue
    out.push({
      rowId: row.id,
      rowPath: rowLabel(row),
      pluginName: row.name,
      provider: row.name.slice(WEB_SEARCH_PREFIX.length),
      disabled: row.disabled,
    })
  }
  return out
}

/* ------------------------------------------------------------------ */
/* 1. Qué es este documento                                           */
/* ------------------------------------------------------------------ */

/**
 * Sección 1: identidad del documento, fecha, versión, hash de entrada y la
 * advertencia literal que impide leer el inventario como prueba de egreso.
 * @param input - la entrada completa del informe.
 * @returns el cuerpo de la sección 1.
 */
export function sectionWhatThisIs(input: EvidenceInput): string {
  return [
    `**Generado:** \`${input.generatedAt}\``,
    `**Versión del generador:** \`${input.generatorVersion}\``,
    `**SHA-256 del volcado de entrada:** \`${input.dumpSha256}\``,
    '',
    'Este documento NO constituye una prueba de que no existan rutas de salida fuera de la Unión Europea',
    '',
    'Es un inventario técnico generado a partir del volcado de configuración compuesta. Recoge lo que esa',
    'composición **declara**: las rutas de inferencia, el modo de residencia, los canales de salida, la',
    'superficie de datos local, el censo de plugins y lo que un despliegue tendría que aportar para poder',
    'attestar egreso.',
    '',
    'Nada de lo que sigue se ha medido sobre la red: se lee del volcado y de la tabla de residencia que la',
    'CLI recibe aparte. Los puntos de intercepción del harness (`tools/pre-execute`, `llm/stream`) no cubren',
    'todos los canales de salida, y no existe ningún seam de red que permita attestarlos desde dentro del',
    'proceso. Por eso este documento inventaría y delimita; no certifica.',
    '',
    'Lo que el volcado no declara aparece aquí como ausencia declarada o como `unknown`. No se rellena con',
    'suposiciones.',
  ].join('\n')
}

/* ------------------------------------------------------------------ */
/* 2. Rutas de inferencia declaradas                                  */
/* ------------------------------------------------------------------ */

/**
 * Sección 2: por proveedor declarado, `baseURL`, modelos y residencia declarada.
 * Los modelos sin residencia conocida se imprimen como `unknown`.
 * @param input - la entrada completa del informe.
 * @returns el cuerpo de la sección 2.
 */
export function sectionInferenceRoutes(input: EvidenceInput): string {
  const providers = declaredProviders(dumpRows(input.dump))
  const lines: string[] = [
    'Rutas de inferencia que el volcado declara. La residencia que aparece aquí es la **declaración** de la',
    'tabla de residencia que acompaña al volcado (catálogo del proyecto o tabla de la guardia): no es una',
    'atestación de dónde corre el modelo ni de por dónde sale el tráfico.',
    '',
  ]
  if (providers.length === 0) {
    lines.push('El volcado no declara ningún proveedor de inferencia (`config.providers`) en ninguna fila.')
    return lines.join('\n')
  }
  for (const provider of providers) {
    lines.push(`### \`${provider.provider}\``)
    lines.push('')
    lines.push(
      `Fila \`${provider.rowPath}\` (plugin \`${provider.pluginName}\`), estado: ${rowState(provider.disabled)}.`,
    )
    lines.push('')
    lines.push(
      list([
        `\`baseURL\`: ${provider.baseURL === undefined ? 'no declarado' : `\`${provider.baseURL}\``}`,
        `\`api\`: ${provider.api === undefined ? 'no declarada' : `\`${provider.api}\``}`,
        `\`apiKeyEnv\`: ${provider.apiKeyEnv === undefined ? 'no declarada' : `\`${provider.apiKeyEnv}\``}`,
        `\`displayName\`: ${provider.displayName === undefined ? 'no declarado' : `\`${provider.displayName}\``}`,
      ]),
    )
    lines.push('')
    if (provider.models.length === 0) {
      lines.push('Modelos declarados: ninguno.')
      continue
    }
    lines.push(`Modelos declarados: ${provider.models.length}.`)
    lines.push('')
    lines.push(
      list(
        provider.models.map((model) => {
          const residency = residencyOf(input.residency, provider.provider, model.id)
          const label = model.name === undefined ? '' : ` (${model.name})`
          const note =
            residency === 'unknown'
              ? 'residencia declarada: **unknown** — sin entrada en la tabla de residencia, es decir, sin residencia conocida'
              : `residencia declarada: **${residency}** (\`${provider.provider}/${model.id}\`)`
          return `\`${model.id}\`${label} — ${note}`
        }),
      ),
    )
    lines.push('')
  }
  lines.push(
    'Un modelo sin residencia conocida se imprime como `unknown`, y `unknown` no es `eu`: en una guardia',
    'default-deny es motivo de veto, no un aprobado por omisión.',
  )
  return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/* 3. Modo de residencia configurado                                  */
/* ------------------------------------------------------------------ */

/**
 * Sección 3: lee la fila `guard-eu-routing` del volcado. `open` produce el banner
 * literal; `eu-only` enumera lo que veta y lo que no cubre; la ausencia de la fila
 * se declara en vez de callarse.
 * @param input - la entrada completa del informe.
 * @returns el cuerpo de la sección 3.
 */
export function sectionResidencyMode(input: EvidenceInput): string {
  const rows = dumpRows(input.dump)
  const guard = rows.find(row => row.id === GUARD_ID || row.name === GUARD_NAME)
  const lines: string[] = []
  if (guard === undefined) {
    lines.push(
      `**La fila \`${GUARD_ID}\` NO aparece en el volcado compuesto.** Esta composición no declara política de`,
    )
    lines.push(
      'residencia: no hay ninguna fila que vete rutas por residencia ni herramientas por egreso propio, y no',
    )
    lines.push('se puede afirmar que exista una política activa. Se dice aquí, en vez de callarse.')
    return lines.join('\n')
  }
  const config = isRecord(guard.config) ? guard.config : {}
  const mode = asString(config['mode'])
  const table = isRecord(config['residency']) ? 'declarada en la fila' : 'no declarada en la fila (se usa la que acompaña al volcado)'
  lines.push(`Fila \`${guard.id}\` (plugin \`${guard.name}\`), estado: ${rowState(guard.disabled)}.`)
  lines.push('')
  lines.push(`- Modo declarado: ${mode === undefined ? '**no legible** (la fila no trae `config.mode` como cadena)' : `**${mode}**`}`)
  lines.push(`- Tabla de residencia de la fila: ${table}`)
  lines.push('')
  if (mode === 'open') {
    lines.push('> **SIN POLÍTICA DE RESIDENCIA ACTIVA: el harness no veta ninguna ruta**')
    lines.push('')
    lines.push(
      'En `open` la guardia no veta ni modelos ni herramientas: cualquier modelo declarado, con residencia',
    )
    lines.push('`eu`, `us` o `unknown`, y cualquiera de las herramientas con egreso propio, pasan.')
  } else if (mode === 'eu-only') {
    lines.push('En `eu-only` la guardia es una lista blanca cerrada con veto por defecto. **Veta:**')
    lines.push('')
    lines.push(
      list([
        'cualquier modelo cuya residencia no sea exactamente `eu`, incluidos los modelos y proveedores que no aparezcan en la tabla (default-deny, no lista negra);',
        'las herramientas con egreso propio: `subagent_codex`, `subagent_claude_code`, `web_fetch`, `web_search` y `mcp__*`.',
      ]),
    )
    lines.push('')
    lines.push('**Lo que NO cubre:**')
    lines.push('')
    lines.push(
      list([
        'el tráfico propio de un servidor MCP: lo abre el servidor o el cliente MCP (HTTP o proceso hijo), y no pasa por el waterfall `llm/stream` ni por `tools/pre-execute`;',
        'el proceso de un subagente externo una vez lanzado: vetar `subagent_codex` o `subagent_claude_code` impide arrancarlo, pero si arranca habla con su proveedor por su cuenta;',
        '`web_fetch` a una URL arbitraria: vetar la herramienta cierra esa vía, pero el canal sigue existiendo en la composición;',
        'el canal de actualizaciones de Desktop y la telemetría OTLP: ninguno de los dos pasa por los seams de intercepción del harness;',
        'lo que ocurre fuera del proceso del harness (los ficheros locales de claves y secretos, por ejemplo).',
      ]),
    )
  } else if (mode === 'ask') {
    lines.push(
      'En `ask` la guardia **veta** con el código `RESIDENCY_REFUSED` y explica en el motivo cómo cambiar de',
    )
    lines.push(
      'modo; no pregunta en silencio ni degrada la llamada, porque el seam de aprobación es por herramienta y',
    )
    lines.push('fail-closed, no un canal de consentimiento por llamada de modelo.')
  } else if (mode === undefined) {
    lines.push(
      'La fila existe pero no declara un modo legible, así que este informe **no puede afirmar qué veta**: el',
    )
    lines.push('modo se imprime como no legible en vez de suponerse.')
  } else {
    lines.push(
      `El modo declarado (\`${mode}\`) no es ninguno de los conocidos (\`eu-only\`, \`ask\`, \`open\`): este informe`,
    )
    lines.push('no puede afirmar qué veta y no lo interpreta.')
  }
  lines.push('')
  lines.push(
    '_Alcance: esto es lo que el volcado declara. El informe no comprueba que el plugin esté cargado y activo',
  )
  lines.push('en tiempo de ejecución, ni que su tabla de residencia coincida con la del catálogo._')
  return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/* 4. Inventario de canales de salida                                 */
/* ------------------------------------------------------------------ */

/**
 * Sección 4: rutas LLM, servidores MCP, búsqueda web, `web_fetch`, subagentes
 * externos, canal de actualizaciones y telemetría (estado y método de comprobación).
 * @param input - la entrada completa del informe.
 * @returns el cuerpo de la sección 4.
 */
export function sectionEgressChannels(input: EvidenceInput): string {
  const rows = dumpRows(input.dump)
  const lines: string[] = []
  const providers = declaredProviders(rows)
  const mcp = declaredMcpServers(rows)
  const searches = declaredWebSearch(rows)
  const fetches = rows.filter(row => row.name.startsWith(WEB_FETCH_PREFIX))
  const web = rows.find(row => row.name === WEB_PLUGIN)
  const webConfig = web !== undefined && isRecord(web.config) ? web.config : {}
  const toolWeb = rows.find(row => row.name === TOOL_WEB)
  const toolWebConfig = toolWeb !== undefined && isRecord(toolWeb.config) ? toolWeb.config : {}
  const externals = declaredExternalSubagents(rows)

  lines.push('### Rutas LLM')
  lines.push('')
  if (providers.length === 0) {
    lines.push('Ninguna ruta de inferencia declarada.')
  } else {
    lines.push(
      list(
        providers.map(
          provider =>
            `\`${provider.provider}\` → ${provider.baseURL === undefined ? 'sin `baseURL` declarado' : `\`${provider.baseURL}\``} (${provider.models.length} modelo(s), fila \`${provider.rowPath}\`)`,
        ),
      ),
    )
  }
  lines.push('')
  lines.push(
    'Las llamadas de modelo declaradas pasan por `llm/stream`, que es donde la guardia de residencia puede',
  )
  lines.push('vetar; ese seam cubre la llamada, no la red del proceso.')
  lines.push('')
  lines.push('### Servidores MCP')
  lines.push('')
  if (mcp.length === 0) {
    lines.push('Ninguno declarado.')
  } else {
    lines.push(
      list(
        mcp.map(
          server =>
            `\`${server.serverName}\` — transporte \`${server.transport}\`, destino: ${server.endpoint}; fila \`${server.rowPath}\`, estado: ${rowState(server.disabled)}`,
        ),
      ),
    )
    lines.push('')
    lines.push(
      '**El tráfico propio de cada servidor MCP no pasa por el waterfall del harness**: el cliente MCP abre',
    )
    lines.push(
      'su conexión (HTTP o un proceso hijo) y esa salida no la ve `llm/stream`. Los nombres de herramienta que',
    )
    lines.push('expone se construyen como `mcp__<serverName>__<rawName>`.')
  }
  lines.push('')
  lines.push('### Proveedores de búsqueda web')
  lines.push('')
  if (searches.length === 0) {
    lines.push('Ninguno declarado.')
  } else {
    lines.push(
      list(
        searches.map(
          search =>
            `\`${search.provider}\` (plugin \`${search.pluginName}\`, fila \`${search.rowPath}\`), estado: ${rowState(search.disabled)}`,
        ),
      ),
    )
  }
  if (web !== undefined) {
    lines.push('')
    lines.push(
      `Fila \`${web.id}\` (\`${WEB_PLUGIN}\`): \`fetchProvider\`: ${renderValue(webConfig['fetchProvider'])}, \`searchProvider\`: ${renderValue(webConfig['searchProvider'])}.`,
    )
  }
  lines.push('')
  lines.push('### `web_fetch`')
  lines.push('')
  if (fetches.length === 0) {
    lines.push('Ningún proveedor de `web_fetch` declarado.')
  } else {
    lines.push(
      list(
        fetches.map(
          row =>
            `\`${row.name}\` (fila \`${rowLabel(row)}\`), estado: ${rowState(row.disabled)}`,
        ),
      ),
    )
  }
  lines.push('')
  const webFetchState =
    toolWeb === undefined
      ? 'la fila de la herramienta no está declarada en el volcado'
      : `fila \`${rowLabel(toolWeb)}\`, \`fetch\`: ${renderValue(toolWebConfig['fetch'])}, estado: ${rowState(toolWeb.disabled)}${toolWeb.disabled === true ? ' — la fila está deshabilitada, así que la herramienta no se monta en esta composición' : ''}`
  lines.push(`La herramienta \`web_fetch\` sale a la URL que pida el modelo: ${webFetchState}.`)
  lines.push('')
  lines.push('### Subagentes externos')
  lines.push('')
  if (externals.length === 0) {
    lines.push('Ninguno declarado en esta composición.')
  } else {
    lines.push(
      list(
        externals.map(
          subagent =>
            `\`${subagent.toolName}\` (proveedor \`${subagent.provider}\`, fila \`${subagent.rowPath}\`), estado: ${rowState(subagent.disabled)}`,
        ),
      ),
    )
    lines.push('')
    lines.push(
      'Los subagentes externos son CLIs fuera de proceso que hablan con su proveedor por su cuenta: una vez',
    )
    lines.push('arrancados, su egreso no pasa por los seams del harness.')
  }
  lines.push('')
  lines.push('### Canal de actualizaciones')
  lines.push('')
  lines.push(
    'Sólo aplica a Desktop. El volcado de un perfil no declara ninguna fila de actualización, y el canal vive',
  )
  lines.push(
    'en la aplicación de escritorio (actualizador propio y política de actualización obligatoria servida por',
  )
  lines.push(
    'un origen remoto), fuera del roster de plugins: **este volcado no puede attestar qué feed usa una',
  )
  lines.push('instalación de escritorio ni si hay actualizaciones habilitadas**.')
  lines.push('')
  lines.push('### Telemetría')
  lines.push('')
  lines.push(
    `- Estado: **${input.telemetry.mounted ? 'montada (el volcado declara la fila del exportador OTLP y no está deshabilitada)' : 'no montada (el volcado no declara ninguna fila de exportador OTLP activa)'}**`,
  )
  lines.push(`- Comprobado en: \`${input.telemetry.checkedAt}\``)
  lines.push(
    `- Método de comprobación: ${input.telemetry.method === undefined ? 'no declarado por la CLI' : input.telemetry.method}`,
  )
  if (input.telemetry.rows !== undefined && input.telemetry.rows.length > 0) {
    lines.push(`- Filas relacionadas: ${input.telemetry.rows.map(row => `\`${row}\``).join(', ')}`)
  }
  lines.push('')
  lines.push(
    'Lo que un volcado **no** puede attestar: la entrega OTLP se decide además con variables de entorno de',
  )
  lines.push(
    'ejecución (`DSH_TELEMETRY_MODE=DISABLED` deshabilita la entrega; `DSH_TELEMETRY_DISABLED` no vacío',
  )
  lines.push(
    'deshabilita su fila; `DSH_TELEMETRY_OTLP_URL` elige el colector), y el exportador OTLP sale directo, sin',
  )
  lines.push('pasar por el proxy del proceso.')
  lines.push('')
  lines.push(
    '_Fuentes: `apps/cli/reference/README.md` (los interruptores `DSH_TELEMETRY_*`) y `packages/util/http-proxy/README.md` (la telemetría sale directa por diseño)._',
  )
  return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/* 5. Superficie de datos local                                       */
/* ------------------------------------------------------------------ */

/**
 * Sección 5: log de sesión, copias de checkpoint, spill, credenciales en claro y
 * exportación del log sin redacción.
 * @param input - la entrada completa del informe.
 * @returns el cuerpo de la sección 5.
 */
export function sectionLocalDataSurface(input: EvidenceInput): string {
  const rows = dumpRows(input.dump)
  const lines: string[] = []
  const sessionLog = rows.find(row => row.name === SESSION_LOG_JSONL || row.name === SESSION_LOG)
  const checkpoints = rows.find(row => row.name === FS_CHECKPOINTS)
  const spill = rows.find(row => row.name === SPILL_LOCAL)
  const credentials = rows.find(row => row.name === CREDENTIALS_LOCAL)
  const logExport = rows.find(row => row.name === LOG_EXPORT)

  lines.push('### Log de sesión')
  lines.push('')
  if (sessionLog === undefined) {
    lines.push('No declarado en el volcado.')
  } else {
    const config = isRecord(sessionLog.config) ? sessionLog.config : {}
    lines.push(
      `Declarado: fila \`${sessionLog.id}\` (\`${sessionLog.name}\`), estado: ${rowState(sessionLog.disabled)}. Raíz: ${renderValue(config['root'])}.`,
    )
    lines.push('')
    lines.push(
      'El log de sesión es append-only y, con la persistencia JSONL, se escribe comprimido como',
    )
    lines.push(
      '`session.v5.jsonl.zstd` por defecto (la generación activa del formato). Contiene la conversación',
    )
    lines.push('completa: mensajes, argumentos y resultados de herramientas y rutas del espacio de trabajo.')
  }
  lines.push('')
  lines.push('### `fs-checkpoints`')
  lines.push('')
  if (checkpoints === undefined) {
    lines.push('No declarado en el volcado.')
  } else {
    lines.push(
      `Declarado: fila \`${checkpoints.id}\` (\`${checkpoints.name}\`), estado: ${rowState(checkpoints.disabled)}.`,
    )
    lines.push('')
    lines.push('Guarda una copia del contenido previo de cada fichero editado, para poder deshacer cambios.')
  }
  lines.push('')
  lines.push('### `spill-local`')
  lines.push('')
  if (spill === undefined) {
    lines.push('No declarado en el volcado.')
  } else {
    lines.push(`Declarado: fila \`${spill.id}\` (\`${spill.name}\`), estado: ${rowState(spill.disabled)}.`)
    lines.push('')
    lines.push(
      'Escribe en disco local la salida voluminosa de herramientas que no cabe en línea, de modo que ese',
    )
    lines.push('contenido también queda en el equipo.')
  }
  lines.push('')
  lines.push('### Credenciales locales')
  lines.push('')
  if (credentials === undefined) {
    lines.push('No declarado en el volcado.')
  } else {
    const config = isRecord(credentials.config) ? credentials.config : {}
    lines.push(
      `Declarado: fila \`${credentials.id}\` (\`${credentials.name}\`), estado: ${rowState(credentials.disabled)}. Ruta: ${renderValue(config['path'])}.`,
    )
    lines.push('')
    lines.push(
      'El almacén local guarda las claves de API y el secreto de cookie **en claro** en un fichero YAML',
    )
    lines.push(
      '(`.credentials.yaml` en el home del harness cuando no se declara otra ruta). El propio paquete declara',
    )
    lines.push(
      'que **no puede aislar los secretos del agente**: sólo el usuario del sistema operativo puede leer el',
    )
    lines.push('fichero, pero los procesos de herramientas corren como ese mismo usuario.')
  }
  lines.push('')
  lines.push('### Exportación del log')
  lines.push('')
  if (logExport === undefined) {
    lines.push('No declarado en el volcado.')
  } else {
    lines.push(`Declarado: fila \`${logExport.id}\` (\`${logExport.name}\`), estado: ${rowState(logExport.disabled)}.`)
    lines.push('')
    lines.push(
      'La exportación entrega el log de sesión **completo y sin redacción**: no hay paso de censura que quite',
    )
    lines.push('texto de mensajes, argumentos de herramientas, resultados ni rutas del espacio de trabajo.')
  }
  lines.push('')
  lines.push(
    '_Fuentes: `packages/credentials/credentials-local/README.md` (el almacén no puede aislar secretos del agente) y `packages/session/session-persistence-jsonl/src/format.ts` (sufijo `.jsonl.zstd`)._',
  )
  return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/* 6. Canal de redaccion                                              */
/* ------------------------------------------------------------------ */

/**
 * Sección 6: lee la fila `privacy-helmcode` del volcado y declara el compromiso
 * que ese canal acepta —lo que sale hacia el modelo lleva marcadores y el
 * ORIGINAL se queda en el log local—, dónde vive el mapa sellado, que la
 * restauración es manual y qué hace el canal cuando el mapa no se puede abrir.
 * @param input - la entrada completa del informe.
 * @returns el cuerpo de la sección 6.
 */
export function sectionRedactionChannel(input: EvidenceInput): string {
  const rows = dumpRows(input.dump)
  const channel = rows.find(row => row.id === PRIVACY_ID || row.name === PRIVACY_NAME)
  const lines: string[] = []
  if (channel === undefined) {
    lines.push(
      `**La fila \`${PRIVACY_ID}\` NO aparece en el volcado compuesto.** Esta composición no monta el canal de`,
    )
    lines.push(
      'redacción: no hay ninguna herramienta con la que el agente sustituya datos personales, así que lo que el',
    )
    lines.push('agente escriba o lea sale hacia el modelo tal cual. Se dice aquí, en vez de callarse.')
    lines.push('')
    lines.push(
      `_Si el canal se montara sin declarar \`mapPath\`, el mapa sellado viviría en \`${input.redaction.defaultMapPath}\`: el home del harness resuelto en la máquina que generó este informe._`,
    )
    return lines.join('\n')
  }
  const config = isRecord(channel.config) ? channel.config : {}
  const declaredMapPath = asString(config['mapPath'])
  const declaredKeyRef = asString(config['mapKeyRef'])
  const ttlDays = typeof config['ttlDays'] === 'number' ? config['ttlDays'] : undefined
  const mounted = channel.disabled !== true

  lines.push(`Fila \`${channel.id}\` (plugin \`${channel.name}\`), estado: ${rowState(channel.disabled)}.`)
  lines.push('')
  lines.push(
    list([
      `Canal montado: ${mounted ? '**sí**' : '**no** — la fila está deshabilitada, así que las dos herramientas no se publican'}; comprobado en: \`${input.redaction.method}\``,
      declaredMapPath === undefined
        ? `Mapa sellado: la fila **no declara \`mapPath\`**, así que rige el valor por defecto del plugin bajo el home del harness: \`${input.redaction.defaultMapPath}\``
        : `Mapa sellado: \`${declaredMapPath}\` (declarado en la fila)`,
      declaredKeyRef === undefined
        ? `Clave del mapa: la fila **no declara \`mapKeyRef\`**, así que la referencia es \`${PRIVACY_DEFAULT_KEY_REF}\`; su valor no está en el volcado ni en el patch del bundle, sino en el almacén de credenciales local (sección 5)`
        : `Clave del mapa: \`${declaredKeyRef}\` (declarada en la fila); su valor no está en el volcado ni en el patch del bundle, sino en el almacén de credenciales local (sección 5)`,
      `Caducidad de las entradas nuevas: ${ttlDays === undefined ? 'no declarada — las entradas no caducan' : `\`ttlDays: ${String(ttlDays)}\` días`}`,
      'Herramientas del canal: `anonymize` (texto que pasa el agente) y `workspace_read_anonymized` (fichero de texto leído a través del seam de ficheros de la composición).',
    ]),
  )
  lines.push('')
  lines.push(
    `El home del harness se resolvió en la **máquina que generó este informe**: \`${input.redaction.resolvedHome}\`.`,
  )
  lines.push(
    'Un volcado de configuración no declara el home del proceso ni variables de entorno, así que si el volcado se',
  )
  lines.push('capturó en otra máquina esa ruta describe al generador, no al despliegue.')
  lines.push('')
  lines.push('**Qué queda en claro, y dónde**')
  lines.push('')
  lines.push(
    list([
      'la CAPACIDAD ES EXPLÍCITA: no hay interceptor de contenido. El agente redacta cuando usa una de las dos herramientas, y todo lo que no pase por ellas —lo que escriba, lo que lea con otras herramientas, lo que decida no pasar— sale hacia el modelo sin sustitución;',
      'el LOG LOCAL DE LA SESIÓN guarda el original: los argumentos de `anonymize` llevan el texto sin redactar, y `workspace_read_anonymized` no modifica el fichero, que sigue en disco tal cual. Lo que se despacha al modelo lleva marcadores (`[DNI_1]`, `[IBAN_2]`, …), no valores;',
      'la exportación del log (sección 5) entrega ese mismo contenido completo y sin redacción;',
      'el mapa es reversible por diseño —guarda valor → marcador, sellado con AES-256-GCM— y su CLAVE vive en el almacén de credenciales local que la sección 5 declara **en claro**: la confidencialidad del mapa descansa en ese fichero, no en el volcado;',
      'las entradas caducadas dejan de restaurarse (el mapa lo niega), pero su marcador sigue en el historial: no hay reescritura del pasado;',
      'el mismo valor produce siempre el mismo marcador mientras viva el mapa, también entre sesiones, porque el mapa persiste en el fichero sellado.',
    ]),
  )
  lines.push('')
  lines.push('**Restauración: manual**')
  lines.push('')
  lines.push(
    'No hay ninguna herramienta que devuelva los valores. Restaurar exige la clave y el mapa sellado, y lo hace un',
  )
  lines.push(
    'operador fuera del canal del modelo (el propio paquete expone `open` y `restoreText` para ese trabajo). El',
  )
  lines.push('informe no puede comprobar que ese trabajo se haga ni quién lo hace.')
  lines.push('')
  lines.push('**Fallo cerrado**')
  lines.push('')
  lines.push(
    'Si la clave no está en el almacén, si el sobre no descifra o si el mapa no se puede leer, las dos herramientas',
  )
  lines.push(
    'FALLAN y no devuelven el texto sin redactar. Un fallo al persistir el mapa también hace fallar la llamada: un',
  )
  lines.push('marcador sin mapa guardado no tendría vuelta.')
  lines.push('')
  lines.push(
    '**Lo que este canal NO cubre:** lo que el agente no pase por las herramientas; los datos que sus detectores no',
  )
  lines.push(
    'reconozcan (son conservadores: prefieren perder una coincidencia antes que sustituir algo que no validaron); el',
  )
  lines.push(
    'contenido que otras herramientas envíen al modelo; y el log local con su exportación, que quedan como se declara',
  )
  lines.push('arriba.')
  lines.push('')
  lines.push(
    '_Alcance: esto es lo que el volcado declara y lo que la CLI pudo resolver en la máquina del generador. El informe no comprueba que el plugin esté cargado en tiempo de ejecución, ni que la clave exista, ni que el mapa se pueda abrir._',
  )
  return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/* 7. Atribución                                                      */
/* ------------------------------------------------------------------ */

/**
 * Sección 7: atribución de sesiones a un operador local. Declara si el volcado
 * monta la fila `identity-local` y, si la trae, el `defaultOperator` que su fila
 * declara —o la ausencia declarada de esa clave, sin rellenarla—, más la frase
 * que importa: **esto es atribución, no autenticación**, y la atribución por
 * sesión vive en el log de la sesión (el evento solo-log `identity/operator`),
 * que un volcado de configuración no contiene.
 * @param input - la entrada completa del informe.
 * @returns el cuerpo de la sección 7.
 */
export function sectionAttribution(input: EvidenceInput): string {
  const rows = dumpRows(input.dump)
  const identity = rows.find(row => row.id === IDENTITY_ID || row.name === IDENTITY_NAME)
  const lines: string[] = []
  if (identity === undefined) {
    lines.push(
      `**La fila \`${IDENTITY_ID}\` NO aparece en el volcado compuesto.** Esta composición no atribuye sesiones a`,
    )
    lines.push(
      'ningún operador: no hay ninguna fila que registre quién pilotó cada sesión. Se dice aquí, en vez de callarse.',
    )
    lines.push('')
    lines.push(
      'Impacto: sin atribución, el log de una sesión no permite responder «¿quién hizo esto?» más allá del usuario del',
    )
    lines.push('sistema operativo que arrancó el harness.')
    return lines.join('\n')
  }
  const config = isRecord(identity.config) ? identity.config : {}
  const declared = config['defaultOperator']
  lines.push(`Fila \`${identity.id}\` (plugin \`${identity.name}\`), estado: ${rowState(identity.disabled)}.`)
  lines.push('')
  lines.push(
    list([
      declared === undefined
        ? 'Operador por defecto: la fila **no declara `defaultOperator`**, así que las sesiones nacen sin atribuir y sólo el comando `/operator <nombre>` las atribuye'
        : typeof declared === 'string'
          ? `Operador por defecto: \`${declared}\` (declarado en la fila)`
          : `Operador por defecto: la fila declara un valor que este informe no evalúa ni interpreta: \`${renderValue(declared)}\``,
      'Atribución por sesión: vive en el **log de la sesión**, en el evento durable y solo-log `identity/operator` (fuera del transcript del modelo), y la lee la proyección de sesión `operator`. Este volcado no contiene logs de sesión, así que no puede decir a qué operador quedó atribuida ninguna sesión.',
    ]),
  )
  lines.push('')
  lines.push('**Esto es atribución, no autenticación**')
  lines.push('')
  lines.push(
    list([
      'el plugin no añade credencial, ni pregunta, ni puerta: quien tiene la URL de arranque sigue siendo el dueño del harness;',
      'un operador puede atribuir una sesión a cualquier nombre, incluido el de otra persona: el log registra lo que se declaró, no quién lo declaró;',
      'la atribución no separa usuarios en un mismo nodo ni limita lo que cada uno ve.',
    ]),
  )
  lines.push('')
  lines.push(
    '_Alcance: esto es lo que el volcado declara. El informe no lee ningún log de sesión ni comprueba que la fila estuviera cargada en tiempo de ejecución._',
  )
  return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/* 8. Requisito de despliegue                                         */
/* ------------------------------------------------------------------ */

/**
 * Sección 7: para attestar egreso hace falta control de salida del despliegue.
 * @param input - la entrada completa del informe.
 * @returns el cuerpo de la sección 7.
 */
export function sectionDeploymentRequirement(input: EvidenceInput): string {
  const rows = dumpRows(input.dump)
  const hasProxyPlugin = rows.some(row => row.name === '@deepseek-ai/dsh-http-proxy')
  return [
    'Attestar egreso no sale del harness. Sus puntos de intercepción (`tools/pre-execute`, `llm/stream`) no',
    'cubren MCP, subagentes externos, `web-fetch`, actualizaciones ni telemetría, y el proceso no ofrece',
    'ningún seam de red que permita observar todas sus salidas. Para attestar egreso hace falta un **proxy o',
    'un cortafuegos de salida en el despliegue del cliente**.',
    '',
    'Lo que el harness sí aporta: `@deepseek-ai/dsh-http-proxy` resuelve una política de proxy por proceso',
    'desde el entorno (`http_proxy`, `https_proxy`, `no_proxy`, `all_proxy`) antes de cargar el primer plugin,',
    'y cubre las peticiones que usan el `fetch` global: LLM, búsqueda web y MCP por HTTP.',
    '',
    hasProxyPlugin
      ? 'Este volcado declara la fila del proxy explícitamente.'
      : 'Este volcado no declara una fila del plugin de proxy: la política se resuelve igualmente en el arranque, pero nada en el volcado confirma que un proxy esté configurado en el despliegue.',
    '',
    'Lo que queda del lado del despliegue, porque el harness no lo cubre:',
    '',
    list([
      'la telemetría OTLP sale directa por diseño y no pasa por el proxy del proceso;',
      'los procesos hijos sólo honran la política de proxy en runtimes suficientemente nuevos y cuando todos los valores heredados son aceptables para Node;',
      'los programas escritos por el modelo (ptc-runtime, workers de workflow) no heredan un proxy con credenciales;',
      'los CLIs de subagentes externos y los servidores MCP de tipo stdio son procesos que la red del despliegue debe contener.',
    ]),
    '',
    'Lo que el código no puede demostrar, no se firma',
    '',
    '_Fuentes: `packages/util/http-proxy/README.md` (qué cubre el proxy y qué no) y `apps/desktop/README.md` (canal de actualizaciones, sólo Desktop)._',
    '',
    '_Este informe enumera lo que hay que exigirle al despliegue; no comprueba que exista._',
  ].join('\n')
}

/* ------------------------------------------------------------------ */
/* 9. Inventario de plugins                                           */
/* ------------------------------------------------------------------ */

/**
 * Sección 9: todas las filas del volcado con `id`, `name` y estado.
 * @param input - la entrada completa del informe.
 * @returns el cuerpo de la sección 9.
 */
export function sectionPluginInventory(input: EvidenceInput): string {
  const rows = dumpRows(input.dump)
  const lines: string[] = []
  lines.push(`Filas de plugin encontradas en el volcado compuesto: ${rows.length}.`)
  lines.push('')
  if (rows.length === 0) {
    lines.push('El volcado no contiene ninguna fila con `id` y `name`.')
    return lines.join('\n')
  }
  lines.push(
    'En la columna `id`, una fila anidada se imprime con su ruta (`preset › id`): el mismo id aparece en',
  )
  lines.push('varios presets y sin la ruta no se distinguirían sus entradas.')
  lines.push('')
  lines.push('| id | name | estado |')
  lines.push('| --- | --- | --- |')
  for (const row of rows) {
    lines.push(`| \`${rowLabel(row)}\` | \`${row.name}\` | ${rowState(row.disabled)} |`)
  }
  return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/* 10. Huella                                                         */
/* ------------------------------------------------------------------ */

/**
 * Sección 10: fecha, versión y hash de entrada para reproducibilidad.
 * @param input - la entrada completa del informe.
 * @returns el cuerpo de la sección 10.
 */
export function sectionFingerprint(input: EvidenceInput): string {
  return [
    list([
      `Fecha de generación: \`${input.generatedAt}\``,
      `Versión del generador: \`${input.generatorVersion}\``,
      `SHA-256 del volcado de entrada: \`${input.dumpSha256}\``,
    ]),
    '',
    'Para reproducir el informe: vuelve a componer el mismo perfil y ejecuta el generador sobre ese volcado.',
    'El SHA-256 debe coincidir. Un hash distinto significa otra entrada, no otro informe; y un informe sin el',
    'mismo hash no es comparable con éste.',
  ].join('\n')
}

/* ------------------------------------------------------------------ */
/* Composición                                                        */
/* ------------------------------------------------------------------ */

/**
 * Las diez secciones en el orden obligatorio, cada una con su título numerado.
 * @param input - la entrada completa del informe.
 * @returns los diez cuerpos, ya titulados con su número.
 */
export function buildSections(input: EvidenceInput): readonly string[] {
  const bodies = [
    sectionWhatThisIs(input),
    sectionInferenceRoutes(input),
    sectionResidencyMode(input),
    sectionEgressChannels(input),
    sectionLocalDataSurface(input),
    sectionRedactionChannel(input),
    sectionAttribution(input),
    sectionDeploymentRequirement(input),
    sectionPluginInventory(input),
    sectionFingerprint(input),
  ]
  return bodies.map((body, index) => `## ${index + 1}. ${SECTION_TITLES[index]}\n\n${body}`)
}

/** El nombre del plugin de telemetría OTLP que la CLI busca en el volcado. */
export const TELEMETRY_PLUGIN_NAME = TELEMETRY_OTEL
