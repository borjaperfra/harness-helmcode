import { describe, expect, it } from 'vitest'

import {
  decideModelRoute,
  decideTool,
  routeKey,
  type EgressToolTable,
  type ResidencyMode,
  type ResidencyTable,
} from '../src/decisions.ts'
import {
  DEFAULT_EGRESS_TOOLS,
  DEFAULT_RESIDENCY_TABLE,
  HELMCODE_PROVIDER,
} from '../src/defaults.ts'

/** Los cuatro modelos que la ruta europea declara hoy (catalogo `residency: "eu"`). */
const EU_MODELS = ['deepseek-v4-flash', 'glm5.3-flash', 'qwen3.6', 'gemma4'] as const

/** Los nueve modelos frontera que la misma clave sirve fuera de la UE. */
const US_MODELS = [
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-sonnet-5-5',
  'claude-haiku-4-5',
  'gpt-6-astra',
  'gpt-6.1-sol',
  'gpt-6-luna',
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
] as const

/** Una tabla minima para probar la decision sin arrastrar los defaults. */
const TABLE: ResidencyTable = {
  'helmcode/modelo-eu': 'eu',
  'helmcode/modelo-us': 'us',
  'helmcode/modelo-desconocido': 'unknown',
}

const TOOLS: EgressToolTable = { tools: ['subagent_codex', 'web_fetch'] }

describe('decideModelRoute en modo eu-only', () => {
  it('permite un modelo europeo de la tabla', () => {
    expect(decideModelRoute('eu-only', TABLE, 'helmcode', 'modelo-eu')).toEqual({ kind: 'allow' })
  })

  it('veta un modelo estadounidense de la tabla', () => {
    const verdict = decideModelRoute('eu-only', TABLE, 'helmcode', 'modelo-us')
    expect(verdict.kind).toBe('deny')
    if (verdict.kind !== 'deny') return
    expect(verdict.code).toBe('RESIDENCY_REFUSED')
    expect(verdict.reason).toContain('helmcode/modelo-us')
  })

  it('veta un modelo que NO esta en la tabla (default-deny, el fail-open de la auditoria)', () => {
    // El caso que la auditoria señalo: el esqueleto anterior era
    // `residency === 'us'`, de modo que un modelo ausente de la tabla —uno que
    // descubra `registerModelDiscovery`, o uno que Helmcode anada manana— pasaba
    // sin que nadie le hubiera dado permiso. Aqui se veta.
    const verdict = decideModelRoute('eu-only', TABLE, 'helmcode', 'modelo-que-no-existe-todavia')
    expect(verdict.kind).toBe('deny')
    if (verdict.kind !== 'deny') return
    expect(verdict.code).toBe('RESIDENCY_REFUSED')
  })

  it('veta un modelo clasificado explicitamente como desconocido', () => {
    const verdict = decideModelRoute('eu-only', TABLE, 'helmcode', 'modelo-desconocido')
    expect(verdict.kind).toBe('deny')
    if (verdict.kind !== 'deny') return
    expect(verdict.code).toBe('RESIDENCY_REFUSED')
  })

  it('veta un proveedor distinto de helmcode aunque no haya entrada suya (la tabla es la lista blanca completa)', () => {
    // Sin esto, el default-deny solo cubriria a Helmcode: bastaria con que el
    // egreso saliera por otra ruta para que la guardia no dijera nada.
    const verdict = decideModelRoute('eu-only', TABLE, 'openai', 'gpt-6-astra')
    expect(verdict.kind).toBe('deny')
    if (verdict.kind !== 'deny') return
    expect(verdict.code).toBe('RESIDENCY_REFUSED')
  })

  it('permite los cuatro modelos europeos por defecto y veta los nueve frontera', () => {
    for (const model of EU_MODELS) {
      expect(decideModelRoute('eu-only', DEFAULT_RESIDENCY_TABLE, HELMCODE_PROVIDER, model), model)
        .toEqual({ kind: 'allow' })
    }
    for (const model of US_MODELS) {
      const verdict = decideModelRoute('eu-only', DEFAULT_RESIDENCY_TABLE, HELMCODE_PROVIDER, model)
      expect(verdict.kind, model).toBe('deny')
      if (verdict.kind !== 'deny') continue
      expect(verdict.code, model).toBe('RESIDENCY_REFUSED')
    }
  })

  it('veta el add-on europeo que el bundle no declara, porque la tabla no es un catalogo', () => {
    // `helmcode/glm5.3` es `eu` en el catalogo pero es un add-on de 150 EUR por
    // key que el bundle deja fuera a proposito. No declararlo aqui es lo correcto:
    // en eu-only se veta, que es el lado seguro del default-deny.
    const verdict = decideModelRoute('eu-only', DEFAULT_RESIDENCY_TABLE, HELMCODE_PROVIDER, 'glm5.3')
    expect(verdict.kind).toBe('deny')
  })
})

describe('decideModelRoute en modo open', () => {
  it('permite incluso un modelo estadounidense de la tabla', () => {
    expect(decideModelRoute('open', TABLE, 'helmcode', 'modelo-us')).toEqual({ kind: 'allow' })
  })

  it('permite lo que no esta en la tabla y lo que viene de otro proveedor', () => {
    expect(decideModelRoute('open', TABLE, 'helmcode', 'otro')).toEqual({ kind: 'allow' })
    expect(decideModelRoute('open', TABLE, 'nan-builders', 'glm5.3')).toEqual({ kind: 'allow' })
  })

  it('permite los nueve frontera: es el modo de uso interno y benchmarks', () => {
    for (const model of US_MODELS) {
      expect(decideModelRoute('open', DEFAULT_RESIDENCY_TABLE, HELMCODE_PROVIDER, model), model)
        .toEqual({ kind: 'allow' })
    }
  })
})

describe('decideModelRoute en modo ask', () => {
  // Ajuste de diseno del orquestador: `ask` ya NO es un veto incondicional. Deja
  // pasar la residencia exactamente `'eu'` y veta `'us'` y `'unknown'`, porque el
  // consentimiento interactivo por llamada de modelo no existe todavia (el seam de
  // aprobacion es por herramienta y fail-closed) y `open` es la via para autorizar.
  it('permite una ruta con residencia exactamente eu', () => {
    expect(decideModelRoute('ask', TABLE, 'helmcode', 'modelo-eu')).toEqual({ kind: 'allow' })
    expect(decideModelRoute('ask', DEFAULT_RESIDENCY_TABLE, HELMCODE_PROVIDER, 'gemma4'))
      .toEqual({ kind: 'allow' })
  })

  it('veta con RESIDENCY_REFUSED una ruta us y una razon que nombra el modo', () => {
    const verdict = decideModelRoute('ask', TABLE, 'helmcode', 'modelo-us')
    expect(verdict.kind).toBe('deny')
    if (verdict.kind !== 'deny') return
    expect(verdict.code).toBe('RESIDENCY_REFUSED')
    expect(verdict.reason).toContain("'ask'")
    expect(verdict.reason).toContain('helmcode/modelo-us')
  })

  it('veta unknown y lo que no esta en la tabla: el default-deny sigue en pie', () => {
    for (const model of ['modelo-desconocido', 'modelo-que-no-existe', 'glm5.3']) {
      const verdict = decideModelRoute('ask', DEFAULT_RESIDENCY_TABLE, HELMCODE_PROVIDER, model)
      expect(verdict.kind, model).toBe('deny')
      if (verdict.kind !== 'deny') continue
      expect(verdict.code, model).toBe('RESIDENCY_REFUSED')
    }
  })

  it('explica que no hay consentimiento por llamada de modelo y que open es la via', () => {
    // El seam de aprobacion del harness es por herramienta y fail-closed: no hay
    // canal de consentimiento por llamada de modelo, y el plan prohibe decidir en
    // silencio (§17.3). Por eso `ask` veta lo que no es `eu` y dice por donde se
    // autoriza, en vez de prometer una pregunta que el codigo no puede hacer.
    const verdict = decideModelRoute('ask', TABLE, 'helmcode', 'modelo-us')
    expect(verdict.kind).toBe('deny')
    if (verdict.kind !== 'deny') return
    expect(verdict.reason).toContain('consentimiento interactivo por llamada de modelo')
    expect(verdict.reason).toContain('por herramienta y fail-closed')
    expect(verdict.reason).toContain("'open'")
    expect(verdict.reason).toContain("'eu-only'")
  })

  it('permite los cuatro modelos europeos y veta los nueve frontera', () => {
    for (const model of EU_MODELS) {
      expect(decideModelRoute('ask', DEFAULT_RESIDENCY_TABLE, HELMCODE_PROVIDER, model), model)
        .toEqual({ kind: 'allow' })
    }
    for (const model of US_MODELS) {
      const verdict = decideModelRoute('ask', DEFAULT_RESIDENCY_TABLE, HELMCODE_PROVIDER, model)
      expect(verdict.kind, model).toBe('deny')
      if (verdict.kind !== 'deny') continue
      expect(verdict.code, model).toBe('RESIDENCY_REFUSED')
    }
  })
})

describe('decideTool', () => {
  it('veta en eu-only una herramienta de la tabla', () => {
    const verdict = decideTool('eu-only', TOOLS, 'subagent_codex')
    expect(verdict.kind).toBe('deny')
    if (verdict.kind !== 'deny') return
    expect(verdict.code).toBe('EGRESS_TOOL_DENIED')
    expect(verdict.reason).toContain('subagent_codex')
    // La razon tiene que decir POR QUE: su egreso no pasa por el waterfall.
    expect(verdict.reason).toContain('llm/stream')
  })

  it('permite en open una herramienta de la tabla', () => {
    expect(decideTool('open', TOOLS, 'subagent_codex')).toEqual({ kind: 'allow' })
    expect(decideTool('open', TOOLS, 'web_fetch')).toEqual({ kind: 'allow' })
  })

  it('permite en cualquier modo una herramienta ajena a la tabla', () => {
    for (const mode of ['eu-only', 'ask', 'open'] satisfies ResidencyMode[]) {
      expect(decideTool(mode, TOOLS, 'read_file'), mode).toEqual({ kind: 'allow' })
      expect(decideTool(mode, TOOLS, 'todo_write'), mode).toEqual({ kind: 'allow' })
    }
  })

  it('no veta la delegacion en proceso, que si pasa por el waterfall', () => {
    // `subagent` y `subagent_fork` usan drivers en proceso que heredan la ruta
    // del padre: su trafico de modelo lo cubre decideModelRoute, no esta tabla.
    expect(decideTool('eu-only', DEFAULT_EGRESS_TOOLS, 'subagent')).toEqual({ kind: 'allow' })
    expect(decideTool('eu-only', DEFAULT_EGRESS_TOOLS, 'subagent_fork')).toEqual({ kind: 'allow' })
  })

  it('veta las cuatro herramientas con egreso propio de los defaults', () => {
    for (const tool of ['subagent_codex', 'subagent_claude_code', 'web_fetch', 'web_search']) {
      const verdict = decideTool('eu-only', DEFAULT_EGRESS_TOOLS, tool)
      expect(verdict.kind, tool).toBe('deny')
      if (verdict.kind !== 'deny') continue
      expect(verdict.code, tool).toBe('EGRESS_TOOL_DENIED')
      expect(verdict.reason, tool).toContain(tool)
    }
  })

  it('veta por prefijo cualquier herramienta de un servidor MCP', () => {
    // Los nombres de MCP se construyen en tiempo de ejecucion
    // (`mcp__<serverName>__<rawName>`), asi que no se pueden enumerar.
    for (const tool of ['mcp__github__create_issue', 'mcp__web__search', 'mcp__x__y']) {
      const verdict = decideTool('eu-only', DEFAULT_EGRESS_TOOLS, tool)
      expect(verdict.kind, tool).toBe('deny')
      if (verdict.kind !== 'deny') continue
      expect(verdict.code, tool).toBe('EGRESS_TOOL_DENIED')
    }
  })

  it('no confunde el prefijo mcp__ con un nombre que solo lo contiene', () => {
    expect(decideTool('eu-only', DEFAULT_EGRESS_TOOLS, 'read_mcp__file')).toEqual({ kind: 'allow' })
    expect(decideTool('eu-only', DEFAULT_EGRESS_TOOLS, 'mcp')).toEqual({ kind: 'allow' })
  })
})

describe('routeKey', () => {
  it('construye la clave de la tabla como provider/model', () => {
    expect(routeKey('helmcode', 'qwen3.6')).toBe('helmcode/qwen3.6')
    expect(DEFAULT_RESIDENCY_TABLE[routeKey('helmcode', 'qwen3.6')]).toBe('eu')
  })
})
