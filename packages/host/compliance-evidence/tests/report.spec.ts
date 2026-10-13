/**
 * Pruebas puras del informe de evidencia, sobre el fixture sintético
 * `tests/fixtures/dump.fixture.yml` (documentado en su cabecera).
 *
 * Todo lo que se prueba aquí es puro: el volcado se parsea una vez con el mismo
 * parser que usa la CLI y las secciones se ejercitan sobre el objeto ya parseado.
 * Los caminos de modo (`open`, `eu-only`, fila ausente) se recorren mutando una
 * copia del volcado, no con fixtures distintos.
 *
 * @module @deepseek-ai/dsh-compliance-evidence/tests/report
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  decodeDumpBytes,
  parseArguments,
  parseConfigDump,
  redactionEvidence,
  residencyFromCatalog,
  telemetryEvidence,
} from '../src/cli.ts'
import { SECTION_TITLES, buildEvidenceReport, dumpRows, renderValue, residencyOf } from '../src/index.ts'
import type { DumpRecord, EvidenceInput, ResidencyTable } from '../src/index.ts'

const DUMP_TEXT = readFileSync(new URL('./fixtures/dump.fixture.yml', import.meta.url), 'utf8')
const DUMP = parseConfigDump(DUMP_TEXT)

/** El home con el que el test finge la máquina del generador. */
const RESOLVED_HOME = join('machine', 'home')

/**
 * La tabla de residencia del test. Se omite a propósito
 * `helmcode/glm5.3-flash`, que el fixture declara: así el camino `unknown`
 * (modelo declarado sin residencia conocida) queda ejercitado.
 */
const RESIDENCY: ResidencyTable = {
  'helmcode/deepseek-v4-flash': 'eu',
  'helmcode/qwen3.6': 'eu',
  'helmcode/gemma4': 'eu',
  'helmcode/claude-opus-5-5': 'us',
}

function baseInput(dump: unknown = DUMP): EvidenceInput {
  return {
    dump,
    residency: RESIDENCY,
    generatedAt: '2026-01-02T03:04:05.000Z',
    generatorVersion: '0.1.0-fixture',
    dumpSha256: 'faded'.repeat(16),
    telemetry: {
      mounted: false,
      checkedAt: '2026-01-02T03:04:05.000Z',
      method: 'barrido del fixture',
    },
    redaction: redactionEvidence(dumpRows(dump), RESOLVED_HOME),
  }
}

function cloneDump(): unknown {
  return structuredClone(DUMP)
}

function rowConfig(dump: unknown, id: string): DumpRecord {
  const row = dumpRows(dump).find(candidate => candidate.id === id)
  if (row === undefined) throw new Error(`el fixture debería traer la fila ${id}`)
  const config = row.config
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    throw new Error(`la fila ${id} debería traer un \`config\` de objeto`)
  }
  return config as DumpRecord
}

function guardConfig(dump: unknown): DumpRecord {
  return rowConfig(dump, 'guard-eu-routing')
}

function dumpWithMode(mode: string): unknown {
  const dump = cloneDump()
  guardConfig(dump)['mode'] = mode
  return dump
}

function dumpWithoutGuard(): unknown {
  const dump = cloneDump()
  return (dump as readonly unknown[]).filter(entry => (entry as DumpRecord)['id'] !== 'guard-eu-routing')
}

/** El volcado sin la fila del canal de redacción. */
function dumpWithoutRedaction(): unknown {
  const dump = cloneDump()
  return (dump as readonly unknown[]).filter(entry => (entry as DumpRecord)['id'] !== 'privacy-helmcode')
}

describe('buildEvidenceReport', () => {
  it('incluye las nueve secciones obligatorias, en orden', () => {
    const report = buildEvidenceReport(baseInput())
    let previous = -1
    SECTION_TITLES.forEach((title, index) => {
      const position = report.indexOf(`## ${index + 1}. ${title}`)
      expect(position).toBeGreaterThan(previous)
      previous = position
    })
    expect(SECTION_TITLES.length).toBe(9)
    // La sección del canal de redacción va justo detrás de la superficie local.
    expect(SECTION_TITLES[5]).toBe('Canal de redacción')
  })

  it('lleva las dos frases literales, tal cual', () => {
    const report = buildEvidenceReport(baseInput())
    expect(report).toContain(
      'Este documento NO constituye una prueba de que no existan rutas de salida fuera de la Unión Europea',
    )
    expect(report).toContain('Lo que el código no puede demostrar, no se firma')
  })

  it('imprime el hash de entrada y la versión del generador', () => {
    const input = baseInput()
    const report = buildEvidenceReport(input)
    expect(report).toContain(input.dumpSha256)
    expect(report).toContain('0.1.0-fixture')
  })

  it('en modo open destaca el banner literal y no veta nada', () => {
    const report = buildEvidenceReport(baseInput(dumpWithMode('open')))
    expect(report).toContain('SIN POLÍTICA DE RESIDENCIA ACTIVA: el harness no veta ninguna ruta')
    expect(report).toContain('no veta ni modelos ni herramientas')
  })

  it('en modo eu-only describe lo que veta y lo que no cubre', () => {
    const report = buildEvidenceReport(baseInput())
    expect(report).toContain('**Veta:**')
    expect(report).toContain('default-deny')
    expect(report).toContain('`subagent_codex`')
    expect(report).toContain('`mcp__*`')
    expect(report).toContain('**Lo que NO cubre:**')
    expect(report).toContain('el tráfico propio de un servidor MCP')
    expect(report).toContain('telemetría OTLP')
  })

  it('en modo ask dice que veta explicando el modo, sin preguntar en silencio', () => {
    const report = buildEvidenceReport(baseInput(dumpWithMode('ask')))
    expect(report).toContain('RESIDENCY_REFUSED')
    expect(report).toContain('no pregunta en silencio')
  })

  it('declara unknown el modelo sin residencia conocida', () => {
    const report = buildEvidenceReport(baseInput())
    expect(report).toContain('`glm5.3-flash` (GLM 5.3 Flash)')
    expect(report).toContain('residencia declarada: **unknown**')
    expect(report).toContain('sin residencia conocida')
    expect(residencyOf(RESIDENCY, 'helmcode', 'glm5.3-flash')).toBe('unknown')
    // El proveedor ausente de la tabla tampoco se aprueba por omisión.
    expect(report).toContain('`deepseek-v4-flash` (DeepSeek V4.1 Flash) — residencia declarada: **unknown**')
  })

  it('dice que falta la fila de la guardia en vez de callarse', () => {
    const report = buildEvidenceReport(baseInput(dumpWithoutGuard()))
    expect(report).toContain('NO aparece en el volcado compuesto')
    expect(report).toContain('Se dice aquí, en vez de callarse')
    expect(report).not.toContain('SIN POLÍTICA DE RESIDENCIA ACTIVA')
  })

  it('avisa de que el tráfico propio de un servidor MCP no pasa por el waterfall', () => {
    const report = buildEvidenceReport(baseInput())
    expect(report).toContain('no pasa por el waterfall del harness')
    expect(report).toContain('`github` — transporte `streamable-http`')
    expect(report).toContain('mcp-files-server --root .')
    expect(report).toContain('`mcp__<serverName>__<rawName>`')
  })

  it('inventaría la búsqueda web, web_fetch y los subagentes externos', () => {
    const report = buildEvidenceReport(baseInput())
    expect(report).toContain('`duckduckgo`')
    expect(report).toContain('`@deepseek-ai/dsh-web-fetch-http`')
    expect(report).toContain('`subagent_codex` (proveedor `codex`')
    expect(report).toContain('`subagent_claude_code` (proveedor `claude-code`')
    expect(report).toContain('deshabilitada (`disabled: true`)')
  })

  it('imprime el estado de la telemetría y su método, montada y no montada', () => {
    const off = buildEvidenceReport(baseInput())
    expect(off).toContain('no montada')
    expect(off).toContain('barrido del fixture')
    const on = buildEvidenceReport({
      ...baseInput(),
      telemetry: { mounted: true, checkedAt: '2026-01-02T03:04:05.000Z', method: 'barrido del fixture' },
    })
    expect(on).toContain('montada')
    expect(on).toContain('DSH_TELEMETRY_MODE=DISABLED')
  })

  it('inventaría los plugins con id, name y estado, incluidos los anidados en un preset', () => {
    const report = buildEvidenceReport(baseInput())
    expect(report).toContain('| `preset-standard` | `@deepseek-ai/dsh-agent-preset` |')
    expect(report).toContain('| `preset-standard › tool-subagent-claude-code` | `@deepseek-ai/dsh-tool-subagent` |')
    expect(report).toContain('condicional (`disabled: !!js')
  })

  it('dice que una herramienta cuya fila está deshabilitada no se monta', () => {
    const dump = cloneDump()
    const toolWeb = dumpRows(dump).find(row => row.id === 'tool-web')
    if (toolWeb === undefined) throw new Error('el fixture debería traer `tool-web`')
    toolWeb.value['disabled'] = true
    const report = buildEvidenceReport(baseInput(dump))
    expect(report).toContain('la fila está deshabilitada, así que la herramienta no se monta en esta composición')
  })

  it('imprime las rutas de inferencia declaradas con su baseURL', () => {
    const report = buildEvidenceReport(baseInput())
    expect(report).toContain('### `helmcode`')
    expect(report).toContain('`https://api.helmcode.com/v1`')
    expect(report).toContain('`https://api.nan.builders/v1`')
    expect(report).toContain('`HELMCODE_API_KEY`')
  })

  it('nombra la superficie de datos local y sus avisos', () => {
    const report = buildEvidenceReport(baseInput())
    expect(report).toContain('`session.v5.jsonl.zstd`')
    expect(report).toContain('copia del contenido previo de cada fichero editado')
    expect(report).toContain('en claro')
    expect(report).toContain('no puede aislar los secretos del agente')
    expect(report).toContain('completo y sin redacción')
  })

  it('declara el canal de redacción: montado, dónde vive el mapa y qué queda en claro', () => {
    const report = buildEvidenceReport(baseInput())
    expect(report).toContain('## 6. Canal de redacción')
    expect(report).toContain('Fila `privacy-helmcode` (plugin `@deepseek-ai/dsh-privacy-helmcode`)')
    expect(report).toContain('Canal montado: **sí**')
    expect(report).toContain('barrido del fixture')
    // El fixture no declara `mapPath`: rige el valor por defecto bajo el home
    // resuelto por la CLI, impreso como dato de la máquina generadora.
    expect(report).toContain('**no declara `mapPath`**')
    expect(report).toContain(join(RESOLVED_HOME, 'privacy', 'map.v1'))
    expect(report).toContain(RESOLVED_HOME)
    expect(report).toContain('no declara `mapKeyRef`')
    expect(report).toContain('`PRIVACY_MAP_KEY`')
    expect(report).toContain('`ttlDays: 30` días')
    expect(report).toContain('`anonymize`')
    expect(report).toContain('`workspace_read_anonymized`')
    // El compromiso del diseño, con nombre y apellidos.
    expect(report).toContain('LOG LOCAL DE LA SESIÓN guarda el original')
    expect(report).toContain('CAPACIDAD ES EXPLÍCITA')
    expect(report).toContain('Restauración: manual')
    expect(report).toContain('FALLAN y no devuelven el texto sin redactar')
  })

  it('imprime el `mapPath` y la referencia de clave declarados en la fila', () => {
    const dump = cloneDump()
    const config = rowConfig(dump, 'privacy-helmcode')
    config['mapPath'] = join('srv', 'privacy', 'map.v1')
    config['mapKeyRef'] = 'CLAVE_DEL_PERFIL'
    const report = buildEvidenceReport(baseInput(dump))

    expect(report).toContain(`Mapa sellado: \`${join('srv', 'privacy', 'map.v1')}\` (declarado en la fila)`)
    expect(report).toContain('`CLAVE_DEL_PERFIL` (declarada en la fila)')
    expect(report).not.toContain('**no declara `mapPath`**')
  })

  it('declara los valores por defecto cuando la fila no trae configuración legible', () => {
    const dump = cloneDump()
    // Una fila sin `config` es una fila que no declara nada: el informe imprime
    // los valores por defecto del plugin, no una suposición.
    delete dumpRows(dump).find(row => row.id === 'privacy-helmcode')!.value['config']
    const report = buildEvidenceReport(baseInput(dump))

    expect(report).toContain('**no declara `mapPath`**')
    expect(report).toContain('**no declara `mapKeyRef`**')
    expect(report).toContain('Caducidad de las entradas nuevas: no declarada — las entradas no caducan')
    expect(report).toContain('Canal montado: **sí**')
  })

  it('no declara montado el canal cuando su fila está deshabilitada o ausente', () => {
    const dump = cloneDump()
    dumpRows(dump).find(row => row.id === 'privacy-helmcode')!.value['disabled'] = true
    const disabled = buildEvidenceReport(baseInput(dump))
    expect(disabled).toContain('Canal montado: **no**')
    expect(disabled).toContain('las dos herramientas no se publican')

    const absent = buildEvidenceReport(baseInput(dumpWithoutRedaction()))
    expect(absent).toContain('NO aparece en el volcado compuesto')
    expect(absent).toContain('sale hacia el modelo tal cual')
    expect(absent).toContain('Se dice aquí, en vez de callarse')
    expect(absent).not.toContain('Canal montado: **sí**')
  })
})

describe('decodeDumpBytes', () => {
  it('decodifica UTF-16LE con BOM y descarta el preámbulo de PowerShell, diciéndolo', () => {
    const preamble = 'pnpm : $ node bin.ts "--dump-config"\nEn línea: 2 Carácter: 1\n'
    const text = `${preamble}# == capa\n- id: a\n  name: b\n`
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])
    const decoded = decodeDumpBytes(utf16)
    expect(decoded.text.startsWith('# == capa')).toBe(true)
    expect(decoded.warnings.length).toBe(2)
    expect(decoded.warnings.join(' | ')).toContain('UTF-16LE')
    expect(decoded.warnings.join(' | ')).toContain('preámbulo')
    expect(parseConfigDump(decoded.text)).toEqual([{ id: 'a', name: 'b' }])
  })

  it('no avisa cuando el volcado ya es UTF-8 y empieza en la primera línea', () => {
    const decoded = decodeDumpBytes(Buffer.from(DUMP_TEXT, 'utf8'))
    expect(decoded.warnings).toEqual([])
    expect(decoded.text).toBe(DUMP_TEXT)
  })
})

describe('parseConfigDump', () => {
  it('conserva las expresiones !!js como marcadores opacos, sin evaluarlas', () => {
    const rows = dumpRows(DUMP)
    const settings = rows.find(row => row.id === 'settings')
    expect(settings?.disabled).toEqual({ $js: "!ctx.get('profileContext')" })
    const persistence = rows.find(row => row.id === 'session-persistence-jsonl')
    expect(persistence?.config).toEqual({ root: { $js: "dshHomePath('sessions')" } })
  })

  it('ve las filas anidadas dentro del config de un preset y anota su ruta', () => {
    const rows = dumpRows(DUMP)
    const ids = rows.map(row => row.id)
    expect(ids).toContain('tool-subagent-codex')
    expect(ids).toContain('preset-standard')
    expect(ids.length).toBe(19)
    const nested = rows.find(row => row.id === 'tool-subagent-codex')
    expect(nested?.path).toEqual(['preset-standard', 'tool-subagent-codex'])
    expect(rows.find(row => row.id === 'web')?.path).toEqual(['web'])
  })
})

describe('residencyFromCatalog', () => {
  it('lee la forma con `models` y normaliza lo desconocido a unknown', () => {
    const table = residencyFromCatalog(
      {
        provider: 'helmcode',
        models: [
          { id: 'a', residency: 'eu' },
          { id: 'b', residency: 'us' },
          { id: 'c' },
          { id: 'd', residency: 'otra-cosa' },
        ],
      },
      {},
    )
    expect(table).toEqual({
      'helmcode/a': 'eu',
      'helmcode/b': 'us',
      'helmcode/c': 'unknown',
      'helmcode/d': 'unknown',
    })
  })

  it('lee la forma mapa con claves `proveedor/modelo`', () => {
    expect(residencyFromCatalog({ 'helmcode/a': 'eu', 'helmcode/b': 'raro' }, {})).toEqual({
      'helmcode/a': 'eu',
      'helmcode/b': 'unknown',
    })
  })

  it('acepta --provider cuando el catálogo no declara proveedor', () => {
    expect(residencyFromCatalog({ models: [{ id: 'a', residency: 'eu' }] }, { provider: 'otro' })).toEqual({
      'otro/a': 'eu',
    })
  })

  it('falla en vez de adivinar cuando no hay proveedor ni forma reconocible', () => {
    let message = ''
    try {
      residencyFromCatalog({ models: [{ id: 'a', residency: 'eu' }] }, {})
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toContain('--provider')
    let other = ''
    try {
      residencyFromCatalog({ retrievedAt: 'ayer' }, {})
    } catch (error) {
      other = error instanceof Error ? error.message : String(error)
    }
    expect(other).toContain('no reconocido')
  })
})

describe('telemetryEvidence', () => {
  it('no montada sin fila, montada con fila activa, y no montada si la fila está deshabilitada', () => {
    expect(telemetryEvidence(dumpRows(DUMP), 't0').mounted).toBe(false)
    const withRow = [
      ...(DUMP as readonly unknown[]),
      { id: 'session-telemetry-otel', name: '@deepseek-ai/dsh-session-telemetry-otel' },
    ]
    const on = telemetryEvidence(dumpRows(withRow), 't1')
    expect(on.mounted).toBe(true)
    expect(on.rows).toEqual(['session-telemetry-otel'])
    const disabled = [
      ...(DUMP as readonly unknown[]),
      { id: 'session-telemetry-otel', name: '@deepseek-ai/dsh-session-telemetry-otel', disabled: true },
    ]
    expect(telemetryEvidence(dumpRows(disabled), 't2').mounted).toBe(false)
  })
})

describe('renderValue', () => {
  it('nombra un valor sin forma JSON en vez de imprimir `[object Object]`', () => {
    // Un valor del volcado puede ser cualquier nodo YAML; lo que no tiene forma
    // JSON (una función, un símbolo) se imprime tal cual, no como un objeto vacío.
    expect(renderValue({ a: [1] })).toBe('{"a":[1]}')
    expect(renderValue(function conNombre() {})).toContain('conNombre')
    expect(renderValue(Symbol('marca'))).toBe('Symbol(marca)')
    expect(renderValue(undefined)).toBe('(sin declarar)')
  })
})

describe('redactionEvidence', () => {
  it('ve la fila del fixture y resuelve la ruta por defecto bajo el home que se le pasa', () => {
    const evidence = redactionEvidence(dumpRows(DUMP), RESOLVED_HOME)
    expect(evidence.mounted).toBe(true)
    expect(evidence.rows).toEqual(['privacy-helmcode'])
    expect(evidence.resolvedHome).toBe(RESOLVED_HOME)
    expect(evidence.defaultMapPath).toBe(join(RESOLVED_HOME, 'privacy', 'map.v1'))
    expect(evidence.method).toContain('privacy-helmcode')
    expect(evidence.method).toContain('1 fila(s), 1 sin `disabled: true`')
  })

  it('no montada sin fila, y no montada si la única fila está deshabilitada', () => {
    const without = (DUMP as readonly unknown[])
      .filter(entry => (entry as DumpRecord)['id'] !== 'privacy-helmcode')
    expect(redactionEvidence(dumpRows(without), RESOLVED_HOME).mounted).toBe(false)
    expect(redactionEvidence(dumpRows(without), RESOLVED_HOME).rows).toEqual([])

    const disabled = [
      ...without,
      { id: 'privacy-helmcode', name: '@deepseek-ai/dsh-privacy-helmcode', disabled: true },
    ]
    const evidence = redactionEvidence(dumpRows(disabled), RESOLVED_HOME)
    expect(evidence.mounted).toBe(false)
    expect(evidence.method).toContain('1 fila(s), 0 sin `disabled: true`')
  })

  it('sin home explícito resuelve el de esta máquina y coloca el mapa bajo `privacy/map.v1`', () => {
    expect(redactionEvidence(dumpRows(DUMP)).defaultMapPath.endsWith(join('privacy', 'map.v1'))).toBe(true)
  })
})

describe('parseArguments', () => {
  it('lee las dos rutas y el proveedor opcional', () => {
    expect(parseArguments(['d.yml', 'c.json'])).toEqual({ dumpPath: 'd.yml', catalogPath: 'c.json' })
    expect(parseArguments(['d.yml', 'c.json', '--provider', 'helmcode'])).toEqual({
      dumpPath: 'd.yml',
      catalogPath: 'c.json',
      provider: 'helmcode',
    })
  })

  it('falla si faltan rutas', () => {
    let message = ''
    try {
      parseArguments(['solo-una.yml'])
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toContain('faltan rutas')
  })
})
