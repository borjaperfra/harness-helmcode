import { describe, expect, it } from 'vitest'

import {
  decideModelRoute,
  decideRouteEndpoint,
  decideTool,
  declaredResidency,
  expectedBaseURL,
  routeKey,
  type EgressToolTable,
  type ResidencyEndpointTable,
  type ResidencyMode,
  type ResidencyTable,
} from '../src/decisions.ts'
import {
  DEFAULT_EGRESS_TOOLS,
  DEFAULT_RESIDENCY_ENDPOINTS,
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

  it('permite el add-on europeo: la prueba en vivo confirmo que la key lo sirve', () => {
    // `helmcode/glm5.3` estuvo fuera a proposito cuando se asumio que la key
    // del dueño no tenia el add-on activado; la llamada en vivo devolvio 200 y
    // el medidor de cuota ya contaba consumo en el cubo Add-on GLM. La tabla lo
    // declara `eu` y en eu-only pasa como los demas europeos.
    const verdict = decideModelRoute('eu-only', DEFAULT_RESIDENCY_TABLE, HELMCODE_PROVIDER, 'glm5.3')
    expect(verdict).toEqual({ kind: 'allow' })
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
    for (const model of ['modelo-desconocido', 'modelo-que-no-existe', 'qwen3-embedding']) {
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

  it('veta los subagentes genericos: la herramienta no promete heredar la ruta del padre', () => {
    // `subagent` y `subagent_fork` pueden montar un driver en proceso que hereda
    // la ruta del padre —y entonces su trafico si pasa por `llm/stream`—, pero la
    // herramienta admite proveedor y modelo propios para el hijo. La tabla es una
    // lista blanca de CANALES: lo que no puede afirmarse no se deja pasar.
    expect(decideTool('eu-only', DEFAULT_EGRESS_TOOLS, 'subagent')).toMatchObject({ kind: 'deny', code: 'EGRESS_TOOL_DENIED' })
    expect(decideTool('eu-only', DEFAULT_EGRESS_TOOLS, 'subagent_fork')).toMatchObject({ kind: 'deny', code: 'EGRESS_TOOL_DENIED' })
  })

  it('veta las herramientas con egreso propio de los defaults, cada una con su razon', () => {
    for (const tool of [
      'subagent_codex', 'subagent_claude_code', 'web_fetch', 'web_search',
      'bash', 'pwsh', 'plugin_manager', 'index_workspace', 'index_url',
    ]) {
      const verdict = decideTool('eu-only', DEFAULT_EGRESS_TOOLS, tool)
      expect(verdict.kind, tool).toBe('deny')
      if (verdict.kind !== 'deny') continue
      expect(verdict.code, tool).toBe('EGRESS_TOOL_DENIED')
      expect(verdict.reason, tool).toContain(tool)
    }
  })

  it('veta la familia del PTY por prefijo, porque no hay una herramienta llamada `terminal`', () => {
    for (const tool of ['terminal_open', 'terminal_send', 'terminal_read', 'terminal_signal', 'terminal_close', 'terminal_list']) {
      expect(decideTool('eu-only', DEFAULT_EGRESS_TOOLS, tool).kind, tool).toBe('deny')
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

  it('no veta una herramienta que no abre canal propio, ni en eu-only', () => {
    expect(decideTool('eu-only', DEFAULT_EGRESS_TOOLS, 'knowledge_search')).toEqual({ kind: 'allow' })
    expect(decideTool('eu-only', DEFAULT_EGRESS_TOOLS, 'todo_write')).toEqual({ kind: 'allow' })
  })
})

describe('decideRouteEndpoint: la residencia se comprueba en la URL resuelta', () => {
  /** La expectativa del test: el proveedor europeo del bundle. */
  const ENDPOINTS: ResidencyEndpointTable = DEFAULT_RESIDENCY_ENDPOINTS

  it('declara el endpoint europeo del proveedor del bundle', () => {
    expect(expectedBaseURL(ENDPOINTS, HELMCODE_PROVIDER)).toBe('https://api.helmcode.com/v1')
    expect(expectedBaseURL(ENDPOINTS, 'ajeno')).toBeUndefined()
    expect(expectedBaseURL({ helmcode: '' }, HELMCODE_PROVIDER)).toBeUndefined()
  })

  it('deja pasar la ruta cuya URL resuelta es la esperada, con o sin barra final', () => {
    for (const baseURL of ['https://api.helmcode.com/v1', 'https://api.helmcode.com/v1/', ' HTTPS://API.HELMCODE.COM/v1 ']) {
      expect(decideRouteEndpoint('eu-only', ENDPOINTS, HELMCODE_PROVIDER, 'qwen3.6', baseURL), baseURL).toEqual({ kind: 'allow' })
    }
  })

  it('veta con RESIDENCY_REFUSED y nombra el host real cuando el baseURL cambia', () => {
    const verdict = decideRouteEndpoint('eu-only', ENDPOINTS, HELMCODE_PROVIDER, 'qwen3.6', 'https://gateway.acme.example/v1')

    expect(verdict.kind).toBe('deny')
    if (verdict.kind !== 'deny') return
    expect(verdict.code).toBe('RESIDENCY_REFUSED')
    // La razon dice A DONDE iba la peticion, no solo que se nego.
    expect(verdict.reason).toContain('gateway.acme.example')
    expect(verdict.reason).toContain('helmcode/qwen3.6')
  })

  it('veta tambien cuando solo cambia la ruta del mismo host', () => {
    const verdict = decideRouteEndpoint('eu-only', ENDPOINTS, HELMCODE_PROVIDER, 'gemma4', 'https://api.helmcode.com/otra')
    expect(verdict.kind).toBe('deny')
  })

  it('veta en `ask` igual que en `eu-only`, y no en `open`', () => {
    expect(decideRouteEndpoint('ask', ENDPOINTS, HELMCODE_PROVIDER, 'qwen3.6', 'https://otro.example/v1').kind).toBe('deny')
    expect(decideRouteEndpoint('open', ENDPOINTS, HELMCODE_PROVIDER, 'qwen3.6', 'https://otro.example/v1')).toEqual({ kind: 'allow' })
  })

  it('sin URL observable no veta: la guardia no se inventa un host', () => {
    expect(decideRouteEndpoint('eu-only', ENDPOINTS, HELMCODE_PROVIDER, 'qwen3.6', undefined)).toEqual({ kind: 'allow' })
    expect(decideRouteEndpoint('eu-only', ENDPOINTS, HELMCODE_PROVIDER, 'qwen3.6', '')).toEqual({ kind: 'allow' })
  })

  it('sin expectativa declarada para el proveedor no hay nada que exigir', () => {
    expect(decideRouteEndpoint('eu-only', ENDPOINTS, 'ajeno', 'modelo', 'https://otro.example/v1')).toEqual({ kind: 'allow' })
  })

  it('compara tambien una URL que no parsea, sin inventarse un host', () => {
    const verdict = decideRouteEndpoint('eu-only', { ajeno: 'no-es-una-url' }, 'ajeno', 'modelo', 'tampoco')
    expect(verdict.kind).toBe('deny')
    if (verdict.kind !== 'deny') return
    expect(verdict.reason).toContain('tampoco')
    expect(decideRouteEndpoint('eu-only', { ajeno: 'no-es-una-url' }, 'ajeno', 'modelo', 'no-es-una-url')).toEqual({ kind: 'allow' })
  })
})

describe('routeKey', () => {
  it('construye la clave de la tabla como provider/model', () => {
    expect(routeKey('helmcode', 'qwen3.6')).toBe('helmcode/qwen3.6')
    expect(DEFAULT_RESIDENCY_TABLE[routeKey('helmcode', 'qwen3.6')]).toBe('eu')
  })
})

describe('declaredResidency: la unica consulta a la tabla', () => {
  it('devuelve la residencia declarada de la ruta', () => {
    expect(declaredResidency(TABLE, 'helmcode', 'modelo-eu')).toBe('eu')
    expect(declaredResidency(TABLE, 'helmcode', 'modelo-us')).toBe('us')
    expect(declaredResidency(TABLE, 'helmcode', 'modelo-desconocido')).toBe('unknown')
  })

  it('lee unknown lo que la tabla no declara, tambien en otro proveedor', () => {
    expect(declaredResidency(TABLE, 'helmcode', 'no-existe')).toBe('unknown')
    expect(declaredResidency(TABLE, 'openai', 'gpt-6-astra')).toBe('unknown')
    expect(declaredResidency({}, 'helmcode', 'qwen3.6')).toBe('unknown')
  })

  it('lee unknown un valor que la tabla declare fuera de la union', () => {
    // Un fichero de perfil es texto: puede escribir cualquier cosa. Ningun valor
    // que no sea exactamente 'eu' o 'us' puede leerse como permiso.
    const perfil = Object.fromEntries<string>([['helmcode/raro', 'eu ']]) as ResidencyTable
    expect(declaredResidency(perfil, 'helmcode', 'raro')).toBe('unknown')
  })

  it('es la misma consulta que decide el veto', () => {
    // La etiqueta de la interfaz y el veredicto no pueden divergir: los dos
    // pasan por esta funcion.
    for (const model of [...EU_MODELS, ...US_MODELS]) {
      const declared = declaredResidency(DEFAULT_RESIDENCY_TABLE, HELMCODE_PROVIDER, model)
      expect(declared, model).not.toBe('unknown')
      const verdict = decideModelRoute('eu-only', DEFAULT_RESIDENCY_TABLE, HELMCODE_PROVIDER, model)
      expect(verdict.kind === 'allow', model).toBe(declared === 'eu')
    }
  })
})
