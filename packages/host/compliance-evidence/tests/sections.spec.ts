/**
 * Cobertura de las ramas que el fixture principal no recorre: las formas límite
 * del volcado (filas de grupo, nodos repetidos, `config` no legible), las filas
 * que el fixture declara pero con campos ausentes, y la ausencia declarada de
 * cada canal cuando el roster viene vacío.
 *
 * Sigue la regla del módulo: cada caso aquí es una forma que un volcado real
 * puede traer, y lo que se comprueba es que el informe la declara en vez de
 * suponerla.
 *
 * @module @deepseek-ai/dsh-compliance-evidence/tests/sections
 */

import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  declaredExternalSubagents,
  declaredMcpServers,
  declaredProviders,
  dumpRows,
  renderValue,
  rowLabel,
  sectionDeploymentRequirement,
  sectionEgressChannels,
  sectionInferenceRoutes,
  sectionLocalDataSurface,
  sectionPluginInventory,
  sectionResidencyMode,
} from '../src/index.ts'
import type { DumpRecord, EvidenceInput } from '../src/index.ts'

/** Un home fingido para la máquina del generador. */
const RESOLVED_HOME = join('machine', 'home')

/** Entrada mínima del informe para las secciones puras. */
function evidenceInput(dump: unknown): EvidenceInput {
  return {
    dump,
    residency: {},
    generatedAt: '2026-01-02T03:04:05.000Z',
    generatorVersion: '0.1.0-fixture',
    dumpSha256: 'faded'.repeat(16),
    telemetry: { mounted: false, checkedAt: '2026-01-02T03:04:05.000Z' },
    redaction: {
      mounted: false,
      method: 'barrido del test',
      resolvedHome: RESOLVED_HOME,
      defaultMapPath: join(RESOLVED_HOME, 'privacy', 'map.v1'),
    },
  }
}

describe('dumpRows: formas límite del volcado', () => {
  it('desciende por una fila de grupo cuyo `config` es una secuencia', () => {
    const rows = dumpRows([
      { id: 'capa', name: 'cordis:group', config: [{ id: 'hijo', name: 'plugin-hijo' }] },
    ])
    expect(rows.map(row => row.id)).toEqual(['capa', 'hijo'])
    expect(rows[1]?.path).toEqual(['capa', 'hijo'])
    expect(rowLabel(rows[1]!)).toBe('capa › hijo')
  })

  it('no vuelve a recorrer un nodo ya visto y no desciende por un escalar', () => {
    // La misma secuencia como `config` de dos filas: el descenso sólo ocurre una
    // vez, y la segunda fila no duplica las suyas.
    const shared = [{ id: 'repetido', name: 'plugin-repetido' }]
    const rows = dumpRows([
      { id: 'a', name: 'plugin-a', config: shared },
      { id: 'b', name: 'plugin-b', config: shared },
      { id: 'c', name: 'plugin-c', config: ['escalar', {}, { id: 'd', name: 'plugin-d' }] },
    ])
    expect(rows.map(row => row.id)).toEqual(['a', 'repetido', 'b', 'c', 'd'])
  })

  it('no cuenta dos veces la misma fila repetida en el roster', () => {
    const duplicada: DumpRecord = { id: 'dup', name: 'plugin-dup' }
    expect(dumpRows([duplicada, duplicada]).map(row => row.id)).toEqual(['dup'])
  })
})

describe('clasificación de filas: formas que el fixture no trae', () => {
  it('imprime `null` para el marcador vacío de `!!js`', () => {
    // Un `!!js` sin texto llega como nodo nulo, no como cadena: se imprime su
    // nombre en vez de `[object Object]`.
    expect(renderValue(null)).toBe('null')
  })

  it('declara `activa` una fila con `disabled: false`', () => {
    const report = sectionPluginInventory(evidenceInput([
      { id: 'activa', name: 'plugin-activa', disabled: false },
    ]))
    expect(report).toContain('activa (`disabled: false`)')
  })

  it('tolera una fila de proveedor sin `config` y con modelos malformados', () => {
    const providers = declaredProviders(dumpRows([
      { id: 'sin-config', name: '@deepseek-ai/dsh-llm-pi-ai' },
      {
        id: 'malformado',
        name: '@deepseek-ai/dsh-llm-pi-ai',
        config: {
          providers: {
            'no-objeto': 'no-es-un-proveedor',
            parcial: { models: ['no-es-un-modelo', { name: 'sin-id' }, { id: 'ok' }] },
          },
        },
      },
    ]))
    expect(providers.map(provider => provider.provider)).toEqual(['parcial'])
    expect(providers[0]?.models).toEqual([{ id: 'ok', name: undefined }])
  })

  it('tolera un servidor MCP sin `config` y sin `serverName`', () => {
    const servers = declaredMcpServers(dumpRows([
      { id: 'mcp-sin-config', name: '@deepseek-ai/dsh-mcp-client' },
      { id: 'mcp-sin-server-name', name: '@deepseek-ai/dsh-mcp-client', config: { command: 'mcp-files-server' } },
    ]))
    expect(servers[0]).toMatchObject({ transport: 'unknown', endpoint: 'unknown' })
    expect(servers[0]?.serverName).toContain('sin serverName')
    expect(servers[1]?.endpoint).toBe('mcp-files-server')
    expect(servers[1]?.serverName).toContain('sin serverName')
  })

  it('sólo inventaría como externos los proveedores fuera de proceso', () => {
    const externals = declaredExternalSubagents(dumpRows([
      { id: 'sub-sin-config', name: '@deepseek-ai/dsh-tool-subagent' },
      { id: 'sub-interno', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'interno' } },
      { id: 'sub-sin-tool-name', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'codex' } },
      { id: 'sub-codex', name: '@deepseek-ai/dsh-subagent-codex' },
      { id: 'sub-acp', name: '@deepseek-ai/dsh-subagent-acp' },
    ]))
    expect(externals.map(subagent => subagent.provider)).toEqual(['codex', 'codex'])
    expect(externals.map(subagent => subagent.toolName)).toEqual([
      '(sin `toolName`)',
      '(fila del proveedor; sin herramienta propia)',
    ])
  })
})

describe('secciones: lo que un volcado sin canales declara', () => {
  it('declara la ausencia de cada canal sobre un roster vacío', () => {
    const report = sectionEgressChannels(evidenceInput([]))
    expect(report).toContain('Ninguna ruta de inferencia declarada.')
    expect(report).toContain('Ninguno declarado.')
    expect(report).toContain('Ningún proveedor de `web_fetch` declarado.')
    expect(report).toContain('Ninguno declarado en esta composición.')
    expect(report).toContain('la fila de la herramienta no está declarada en el volcado')
    expect(report).not.toContain('Fila `web`')
  })

  it('declara la ausencia de cada pieza de la superficie local', () => {
    const report = sectionLocalDataSurface(evidenceInput([]))
    expect(report.match(/No declarado en el volcado\./g)?.length).toBe(5)
  })

  it('declara un volcado sin ninguna fila de plugin', () => {
    const report = sectionPluginInventory(evidenceInput([]))
    expect(report).toContain('Filas de plugin encontradas en el volcado compuesto: 0.')
    expect(report).toContain('El volcado no contiene ninguna fila con `id` y `name`.')
  })

  it('declara la ausencia de proveedores de inferencia', () => {
    expect(sectionInferenceRoutes(evidenceInput([]))).toContain(
      'El volcado no declara ningún proveedor de inferencia (`config.providers`) en ninguna fila.',
    )
  })

  it('imprime el estado de la telemetría sin método y con filas relacionadas', () => {
    const sinMetodo = sectionEgressChannels(evidenceInput([]))
    expect(sinMetodo).toContain('Método de comprobación: no declarado por la CLI')
    expect(sinMetodo).not.toContain('Filas relacionadas')

    const conFilas = sectionEgressChannels({
      ...evidenceInput([]),
      telemetry: { mounted: true, checkedAt: 't0', method: 'barrido del test', rows: ['fila-1', 'fila-2'] },
    })
    expect(conFilas).toContain('Filas relacionadas: `fila-1`, `fila-2`')
  })
})

describe('secciones: filas presentes con campos ausentes', () => {
  it('declara los campos no declarados de un proveedor y su falta de modelos', () => {
    const dump = [
      {
        id: 'llm',
        name: '@deepseek-ai/dsh-llm-pi-ai',
        config: {
          providers: {
            pelado: { models: [{ id: 'm' }] },
            vacio: { displayName: 'Vacío' },
          },
        },
      },
    ]
    const inference = sectionInferenceRoutes(evidenceInput(dump))
    expect(inference).toContain('`baseURL`: no declarado')
    expect(inference).toContain('`api`: no declarada')
    expect(inference).toContain('`apiKeyEnv`: no declarada')
    expect(inference).toContain('`displayName`: no declarado')
    expect(inference).toContain('Modelos declarados: ninguno.')
    expect(inference).toContain('`m` — residencia declarada: **unknown**')
    // La sección de canales imprime la misma ausencia de `baseURL` en su lista.
    expect(sectionEgressChannels(evidenceInput(dump))).toContain('sin `baseURL` declarado')
  })

  it('declara que el modo no es legible, y que no lo interpreta si es desconocido', () => {
    const sinModo = sectionResidencyMode(evidenceInput([
      {
        id: 'guard-eu-routing',
        name: '@deepseek-ai/dsh-guard-eu-routing',
        config: { residency: { 'helmcode/x': 'eu' } },
      },
    ]))
    expect(sinModo).toContain('Modo declarado: **no legible**')
    expect(sinModo).toContain('Tabla de residencia de la fila: declarada en la fila')
    expect(sinModo).toContain('no puede afirmar qué veta')

    const desconocido = sectionResidencyMode(evidenceInput([
      { id: 'guard-eu-routing', name: '@deepseek-ai/dsh-guard-eu-routing', config: { mode: 'raro' } },
    ]))
    expect(desconocido).toContain('no es ninguno de los conocidos')
    expect(desconocido).not.toContain('Modo declarado: **no legible**')
  })

  it('tolera una fila de guardia con `config` no legible', () => {
    const report = sectionResidencyMode(evidenceInput([
      { id: 'guard-eu-routing', name: '@deepseek-ai/dsh-guard-eu-routing', config: 'no-es-objeto' },
    ]))
    expect(report).toContain('Modo declarado: **no legible**')
    expect(report).toContain('Tabla de residencia de la fila: no declarada en la fila')
  })

  it('tolera un `config` no legible en el log de sesión y la ruta declarada en credenciales', () => {
    const report = sectionLocalDataSurface(evidenceInput([
      { id: 'session-persistence-jsonl', name: '@deepseek-ai/dsh-session-persistence-jsonl', config: 'no-es-objeto' },
      { id: 'credentials', name: '@deepseek-ai/dsh-credentials-local', config: { path: '/srv/credenciales.yaml' } },
    ]))
    expect(report).toContain('Raíz: (sin declarar)')
    expect(report).toContain('Ruta: /srv/credenciales.yaml')
  })

  it('reconoce la fila del proxy cuando el volcado la declara', () => {
    const report = sectionDeploymentRequirement(evidenceInput([
      { id: 'http-proxy', name: '@deepseek-ai/dsh-http-proxy' },
    ]))
    expect(report).toContain('Este volcado declara la fila del proxy explícitamente.')
  })
})
