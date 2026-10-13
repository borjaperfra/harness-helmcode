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
import { describe, expect, it } from 'vitest'
import { decodeDumpBytes, parseArguments, parseConfigDump, residencyFromCatalog, telemetryEvidence } from '../src/cli.ts'
import { SECTION_TITLES, buildEvidenceReport, dumpRows, residencyOf } from '../src/index.ts'
import type { DumpRecord, EvidenceInput, ResidencyTable } from '../src/index.ts'

const DUMP_TEXT = readFileSync(new URL('./fixtures/dump.fixture.yml', import.meta.url), 'utf8')
const DUMP = parseConfigDump(DUMP_TEXT)

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
  }
}

function cloneDump(): unknown {
  return structuredClone(DUMP)
}

function guardConfig(dump: unknown): DumpRecord {
  const row = dumpRows(dump).find(candidate => candidate.id === 'guard-eu-routing')
  if (row === undefined) throw new Error('el fixture debería traer la fila de la guardia')
  const config = row.config
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    throw new Error('la fila de la guardia debería traer un `config` de objeto')
  }
  return config as DumpRecord
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

describe('buildEvidenceReport', () => {
  it('incluye las ocho secciones obligatorias, en orden', () => {
    const report = buildEvidenceReport(baseInput())
    let previous = -1
    SECTION_TITLES.forEach((title, index) => {
      const position = report.indexOf(`## ${index + 1}. ${title}`)
      expect(position).toBeGreaterThan(previous)
      previous = position
    })
    expect(SECTION_TITLES.length).toBe(8)
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
    expect(ids.length).toBe(18)
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
