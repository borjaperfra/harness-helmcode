/**
 * CLI del generador de evidencia: lee dos rutas por argumento (el volcado YAML y
 * el catálogo JSON de residencia), parsea ambas, llama a la función pura
 * `buildEvidenceReport` y escribe el informe en stdout.
 *
 * El parseo del volcado es deliberadamente literal: el esquema YAML añade el tag
 * `!!js` como marcador opaco (`{ $js: … }`) en vez de evaluarlo, porque el volcado
 * real trae expresiones (`!!js dshHomePath('sessions')`,
 * `!!js process.platform === 'win32'`) que este generador no debe ejecutar y que
 * el informe cita tal cual.
 *
 * La lectura tolera lo que el volcado real trae de hecho —BOM de UTF-16LE/BE (una
 * redirección de PowerShell 5.1 escribe UTF-16) y el preámbulo de error que `*>`
 * deja delante del YAML— y lo dice por stderr en cada aviso, en vez de aplicar la
 * tolerancia en silencio.
 *
 * Uso: `dsh-compliance-evidence <volcado.yml> <catalogo.json> [--provider <nombre>]`
 *
 * @module @deepseek-ai/dsh-compliance-evidence/cli
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as yaml from 'js-yaml'
import { buildEvidenceReport, GENERATOR_NAME } from './report.ts'
import { dumpRows, TELEMETRY_PLUGIN_NAME } from './sections.ts'
import type { DumpRecord, DumpRow, EvidenceInput, Residency, ResidencyTable, TelemetryEvidence } from './sections.ts'

/** Texto de uso que acompaña a cualquier error de argumentos. */
export const USAGE =
  'uso: dsh-compliance-evidence <volcado.yml> <catalogo.json> [--provider <nombre>]\n' +
  '  <volcado.yml>    volcado compuesto (`dsh --profile <nombre> --dump-config`)\n' +
  '  <catalogo.json>  catálogo de residencia: `{ "provider": …, "models": [ { "id": …, "residency": … } ] }`\n' +
  '                   o un mapa `{ "proveedor/modelo": "eu" | "us" | "unknown" }`\n' +
  '  --provider       nombre del proveedor que describe el catálogo, cuando el JSON no lo declara'

/** El tag con el que el volcado marca las expresiones que no se evalúan. */
const VERBATIM_JS_TAG = 'tag:yaml.org,2002:js'

/** Esquema del volcado: JSON con `!!js` conservado como marcador opaco. */
const DUMP_SCHEMA = yaml.JSON_SCHEMA.extend([
  new yaml.Type(VERBATIM_JS_TAG, {
    kind: 'scalar',
    construct: (data: unknown): DumpRecord => ({ $js: typeof data === 'string' ? data : String(data) }),
  }),
])

/** El id que el roster de Desktop usa para inyectar la fila de telemetría. */
const TELEMETRY_ROW_ID = 'session-telemetry-otel'

function isRecord(value: unknown): value is DumpRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** El texto del volcado ya decodificado, con lo que hubo que tolerar para leerlo. */
export interface DecodedDump {
  readonly text: string
  /** Avisos que la CLI escribe en stderr; el informe no los lleva. */
  readonly warnings: readonly string[]
}

/** Primera línea que puede empezar un volcado: un comentario (`#`) o una fila (`- `). */
function firstYamlLineIndex(text: string): number {
  return /^(?:#|-\s)/m.exec(text)?.index ?? 0
}

/**
 * Decodifica los bytes del volcado antes de parsearlo.
 *
 * Dos tolerancias, ambas medidas sobre volcados reales de esta máquina y dichas
 * en los avisos en vez de aplicarse en silencio:
 * - el BOM de UTF-16LE/BE o UTF-8 (redirigir la salida con PowerShell 5.1 produce
 *   UTF-16LE, no UTF-8);
 * - el preámbulo de error de PowerShell que `*>` escribe antes del YAML.
 * @param bytes - el fichero del volcado tal cual se leyó.
 * @returns el texto y los avisos de lo tolerado.
 */
export function decodeDumpBytes(bytes: Uint8Array): DecodedDump {
  const warnings: string[] = []
  let text: string
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    text = new TextDecoder('utf-16le').decode(bytes.subarray(2))
    warnings.push('el volcado venía en UTF-16LE (BOM FF FE): se decodificó antes de parsearlo')
  } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    text = new TextDecoder('utf-16be').decode(bytes.subarray(2))
    warnings.push('el volcado venía en UTF-16BE (BOM FE FF): se decodificó antes de parsearlo')
  } else if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    text = new TextDecoder('utf-8').decode(bytes.subarray(3))
    warnings.push('el volcado venía con BOM UTF-8: se descartó antes de parsearlo')
  } else {
    text = new TextDecoder('utf-8').decode(bytes)
  }
  const start = firstYamlLineIndex(text)
  if (start > 0) {
    warnings.push(
      `se ignoraron ${start} caracteres de preámbulo antes de la primera línea de YAML (habitual al redirigir la salida de PowerShell)`,
    )
    text = text.slice(start)
  }
  return { text, warnings }
}

/**
 * Parsea el volcado compuesto sin evaluar `!!js`.
 * @param text - el YAML del volcado tal como se leyó.
 * @returns el volcado parseado; la forma la interpretan las secciones.
 */
export function parseConfigDump(text: string): unknown {
  return yaml.load(text, { schema: DUMP_SCHEMA })
}

function normalizeResidency(value: unknown): Residency {
  return value === 'eu' || value === 'us' ? value : 'unknown'
}

/** Opciones de lectura del catálogo de residencia. */
export interface CatalogOptions {
  /** Proveedor que describe el catálogo, cuando el JSON no trae `provider`. */
  readonly provider?: string
}

/**
 * Construye la tabla `proveedor/modelo → residencia` desde el catálogo JSON.
 *
 * Dos formas admitidas, ambas documentadas en `USAGE`: un objeto con `models`
 * (cada modelo con su `residency`) y un mapa cuyas claves ya son
 * `proveedor/modelo`. Cualquier residencia que no sea `eu` ni `us` se lee como
 * `unknown`, nunca como aprobada.
 * @param document - el JSON del catálogo ya parseado.
 * @param options - proveedor de respaldo cuando el catálogo no lo declara.
 * @returns la tabla de residencia.
 */
export function residencyFromCatalog(document: unknown, options: CatalogOptions = {}): ResidencyTable {
  if (!isRecord(document)) throw new Error('el catálogo debe ser un objeto JSON')
  const models = document['models']
  if (Array.isArray(models)) {
    const declared = typeof document['provider'] === 'string' ? document['provider'] : options.provider
    if (declared === undefined) {
      throw new Error('el catálogo no declara `provider` y no se pasó --provider: no se puede formar la clave `proveedor/modelo`')
    }
    const table: ResidencyTable = {}
    for (const entry of models) {
      if (!isRecord(entry)) continue
      const id = entry['id']
      if (typeof id !== 'string') continue
      table[`${declared}/${id}`] = normalizeResidency(entry['residency'])
    }
    return table
  }
  const table: ResidencyTable = {}
  for (const [key, value] of Object.entries(document)) {
    if (!key.includes('/')) {
      throw new Error(
        `catálogo no reconocido: no declara \`models\` y la clave \`${key}\` no es \`proveedor/modelo\``,
      )
    }
    table[key] = normalizeResidency(value)
  }
  return table
}

/**
 * Determina el estado de la telemetría a partir del volcado.
 *
 * El método es un barrido de las filas buscando el exportador OTLP. Lo que este
 * barrido no puede ver queda dicho en el propio método: las variables de entorno
 * que gobiernan la entrega y las expresiones `!!js` que no se evalúan.
 * @param rows - filas del volcado.
 * @param checkedAt - marca de tiempo ISO de la comprobación.
 * @returns la evidencia de telemetría que imprime la sección 4.
 */
export function telemetryEvidence(rows: readonly DumpRow[], checkedAt: string): TelemetryEvidence {
  const matches = rows.filter(row => row.name === TELEMETRY_PLUGIN_NAME || row.id === TELEMETRY_ROW_ID)
  const active = matches.filter(row => row.disabled !== true)
  const unevaluated = matches.filter(
    row => row.disabled !== undefined && row.disabled !== true && row.disabled !== false,
  )
  const notes = [
    `barrido del volcado buscando la fila del exportador OTLP (\`${TELEMETRY_PLUGIN_NAME}\`, id \`${TELEMETRY_ROW_ID}\`): ${matches.length} fila(s), ${active.length} sin \`disabled: true\``,
    'las variables de entorno que gobiernan la entrega (`DSH_TELEMETRY_MODE`, `DSH_TELEMETRY_DISABLED`, `DSH_TELEMETRY_OTLP_URL`) no son legibles desde un volcado de configuración',
  ]
  if (unevaluated.length > 0) {
    notes.push(
      `${unevaluated.length} fila(s) traen un \`disabled\` que es una expresión \`!!js\` y este generador no la evalúa`,
    )
  }
  return {
    mounted: active.length > 0,
    checkedAt,
    method: `${notes.join('; ')}.`,
    rows: matches.map(row => row.id),
  }
}

/** Versión del generador, leída del `package.json` del paquete. */
export function generatorVersion(): string {
  const document: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  if (isRecord(document) && typeof document['version'] === 'string') return document['version']
  throw new Error('no se pudo leer la versión del generador desde package.json')
}

/** Argumentos ya validados de la CLI. */
export interface CliArguments {
  readonly dumpPath: string
  readonly catalogPath: string
  readonly provider?: string
}

/**
 * Lee los argumentos posicionales y `--provider`.
 * @param argv - argumentos sin el prefijo de `node` ni la ruta del script.
 * @returns las rutas y el proveedor opcional.
 */
export function parseArguments(argv: readonly string[]): CliArguments {
  const positional: string[] = []
  let provider: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--provider') {
      const value = argv[index + 1]
      if (value === undefined) throw new Error('--provider necesita un valor')
      provider = value
      index += 1
      continue
    }
    if (argument !== undefined && argument.startsWith('--')) throw new Error(`argumento no reconocido: ${argument}`)
    if (argument !== undefined) positional.push(argument)
  }
  const [dumpPath, catalogPath] = positional
  if (dumpPath === undefined || catalogPath === undefined) throw new Error('faltan rutas')
  if (positional.length > 2) throw new Error(`sobran argumentos: ${positional.slice(2).join(' ')}`)
  return provider === undefined
    ? { dumpPath, catalogPath }
    : { dumpPath, catalogPath, provider }
}

/**
 * Ejecuta la CLI: parsea, construye el informe y lo escribe en stdout.
 * @param argv - argumentos sin el prefijo de `node` ni la ruta del script.
 * @returns el código de salida (0 correcto, 1 error de entrada).
 */
export function main(argv: readonly string[] = process.argv.slice(2)): number {
  try {
    const parsed = parseArguments(argv)
    const dumpBytes = readFileSync(parsed.dumpPath)
    const decoded = decodeDumpBytes(dumpBytes)
    for (const warning of decoded.warnings) process.stderr.write(`${GENERATOR_NAME}: aviso: ${warning}\n`)
    const dump = parseConfigDump(decoded.text)
    const catalog: unknown = JSON.parse(readFileSync(parsed.catalogPath, 'utf8'))
    const residency = residencyFromCatalog(
      catalog,
      parsed.provider === undefined ? {} : { provider: parsed.provider },
    )
    const now = new Date().toISOString()
    const input: EvidenceInput = {
      dump,
      residency,
      generatedAt: now,
      generatorVersion: generatorVersion(),
      dumpSha256: createHash('sha256').update(dumpBytes).digest('hex'),
      telemetry: telemetryEvidence(dumpRows(dump), now),
    }
    process.stdout.write(buildEvidenceReport(input))
    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${GENERATOR_NAME}: ${message}\n${USAGE}\n`)
    return 1
  }
}

/** `true` cuando este módulo es el script que arrancó el proceso. */
function isDirectInvocation(): boolean {
  const entry = process.argv[1]
  if (entry === undefined) return false
  return resolve(entry) === fileURLToPath(import.meta.url)
}

if (isDirectInvocation()) process.exitCode = main()
