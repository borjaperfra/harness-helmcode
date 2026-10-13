/**
 * Cableado real de la guardia contra un `Context` de verdad: los dos waterfalls
 * (`llm/stream` y `tools/pre-execute`), el esquema de configuracion que valida el
 * loader y las dos tablas por defecto.
 *
 * El nucleo puro tiene su propia suite (`decisions.spec.ts`); esta comprueba que
 * el `apply()` corta donde el nucleo dice `deny` y delega donde dice `allow`, y
 * que el modo por defecto es `open`.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { LlmError, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import * as guard from '../src/index.ts'

/** Una cancelacion de juguete para las llamadas de herramienta del test. */
const testSignal = new AbortController().signal

/** Los dos servicios que la guardia inyecta, montados de verdad. */
async function services(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(LlmRuntime)
  return ctx
}

/** Una peticion de modelo minima: la guardia solo lee `provider` y `model`. */
function request(provider: string, model: string): GenerateOptions {
  return { provider, model, messages: [] }
}

/** Un stream vacio: la sonda corta la cadena antes del adaptador. */
function emptyStream(): AsyncIterable<StreamChunk> {
  return (async function* (): AsyncGenerator<StreamChunk> { /* vacio a proposito */ })()
}

/**
 * Registra una sonda DESPUES de la guardia y devuelve si el waterfall llego
 * hasta ella: un `next()` de la guardia la alcanza, un veto no.
 */
function probe(ctx: Context): () => boolean {
  let reached = false
  ctx.on('llm/stream', () => {
    reached = true
    return emptyStream()
  })
  return () => reached
}

/** Registra una herramienta que solo deja constancia de si su cuerpo corrio. */
function registerProbeTool(ctx: Context, toolName: string): () => boolean {
  let executed = false
  ctx.tools.register(defineContentToolFixture({
    name: toolName,
    description: 'sonda',
    parameters: {},
    async execute(): Promise<ContentBlock[]> {
      executed = true
      return [{ type: 'text' as const, text: 'ok' }]
    },
  }))
  return () => executed
}

/** Ejecuta una herramienta por el pipeline real de `ctx.tools`. */
function executeTool(ctx: Context, toolName: string): Promise<ToolExecutionResult> {
  return ctx.tools.execute({ callId: ToolCallId('c1'), name: toolName, arguments: {}, signal: testSignal })
}

/** El texto model-facing de un resultado de herramienta. */
function textOf(result: ToolExecutionResult): string {
  return result.content.map(block => 'text' in block ? block.text : '').join('')
}

/** Drena un stream para que el waterfall corra entero. */
async function drain(stream: AsyncIterable<StreamChunk>): Promise<void> {
  for await (const _chunk of stream) { /* drenado */ }
}

describe('la guardia como plugin', () => {
  it('declara el nombre y los dos seams que el bundle monta', () => {
    expect(guard.name).toBe('guard-eu-routing')
    expect(guard.inject).toEqual(['llm', 'tools'])
  })

  it('valida su configuracion con el esquema del loader: un modo inventado no monta', async () => {
    const ctx = await services()
    // `resolveConfig` valida contra `Config` antes de llamar a `apply`. El modo
    // inventado se cuela con `as never` porque el tipo ya lo prohibe: lo que se
    // prueba aqui es que el ESQUEMA tambien lo rechaza en tiempo de ejecucion.
    await expect(ctx.plugin(guard, { mode: 'no-existe' } as never)).rejects.toThrow()
  })

  it('respeta el modo declarado en la configuracion', async () => {
    const ctx = await services()
    await ctx.plugin(guard, { mode: 'eu-only' })
    const reached = probe(ctx)
    expect(() => ctx.llm.stream(request('helmcode', 'gpt-6-astra'))).toThrow(LlmError)
    expect(reached()).toBe(false)
  })
})

describe('llm/stream: veto por residencia', () => {
  it('en eu-only lanza LlmError con el codigo de la decision y no alcanza el adaptador', async () => {
    const ctx = await services()
    await ctx.plugin(guard, { mode: 'eu-only' })
    const reached = probe(ctx)

    let caught: unknown
    try {
      ctx.llm.stream(request('helmcode', 'claude-opus-5-5'))
    } catch (error: unknown) {
      caught = error
    }

    expect(caught).toBeInstanceOf(LlmError)
    expect((caught as LlmError).code).toBe('RESIDENCY_REFUSED')
    expect((caught as LlmError).message).toContain('helmcode/claude-opus-5-5')
    expect(reached()).toBe(false)
  })

  it('en eu-only deja pasar la ruta europea hasta el siguiente listener', async () => {
    const ctx = await services()
    await ctx.plugin(guard, { mode: 'eu-only' })
    const reached = probe(ctx)

    await drain(ctx.llm.stream(request('helmcode', 'qwen3.6')))

    expect(reached()).toBe(true)
  })

  it('en open deja pasar los nueve frontera', async () => {
    const ctx = await services()
    await ctx.plugin(guard, { mode: 'open' })
    const reached = probe(ctx)

    for (const model of ['gpt-6-astra', 'gemini-3.8-flash', 'claude-haiku-4-5']) {
      await drain(ctx.llm.stream(request('helmcode', model)))
    }

    expect(reached()).toBe(true)
  })
})

describe('tools/pre-execute: veto por egreso propio', () => {
  it('en eu-only devuelve deny con el nombre de la herramienta, el codigo y su info', async () => {
    const ctx = await services()
    await ctx.plugin(guard, { mode: 'eu-only' })
    const executed = registerProbeTool(ctx, 'web_fetch')

    const result = await executeTool(ctx, 'web_fetch')

    expect(executed()).toBe(false)
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('[EGRESS_TOOL_DENIED]')
    expect(textOf(result)).toContain('web_fetch')
    // La razon dice POR QUE: el egreso de esa herramienta no pasa por el waterfall.
    expect(textOf(result)).toContain('llm/stream')
    expect(result.error?.info).toEqual({ name: 'EgressToolDeniedError', code: 'EGRESS_TOOL_DENIED' })
  })

  it('compara el nombre tal cual llega al evento, con el prefijo mcp__ que define decideTool', async () => {
    const ctx = await services()
    await ctx.plugin(guard, { mode: 'eu-only' })
    const executed = registerProbeTool(ctx, 'mcp__github__create_issue')

    const result = await executeTool(ctx, 'mcp__github__create_issue')

    expect(executed()).toBe(false)
    expect(result.error?.info).toEqual({ name: 'EgressToolDeniedError', code: 'EGRESS_TOOL_DENIED' })
  })

  it('en open deja ejecutar la herramienta y su cuerpo corre', async () => {
    const ctx = await services()
    await ctx.plugin(guard, { mode: 'open' })
    const executed = registerProbeTool(ctx, 'web_fetch')

    const result = await executeTool(ctx, 'web_fetch')

    expect(executed()).toBe(true)
    expect(result.isError).toBe(false)
  })

  it('no veta una herramienta que no abre trafico propio, ni en eu-only', async () => {
    const ctx = await services()
    await ctx.plugin(guard, { mode: 'eu-only' })
    const executed = registerProbeTool(ctx, 'read_file')

    const result = await executeTool(ctx, 'read_file')

    expect(executed()).toBe(true)
    expect(result.isError).toBe(false)
  })
})

describe('apply(): modo por defecto y tablas del perfil', () => {
  it('sin configuracion el modo por defecto es open, no eu-only', async () => {
    const ctx = await services()
    guard.apply(ctx)
    const reached = probe(ctx)
    const executed = registerProbeTool(ctx, 'web_fetch')

    // La ruta NaN del usuario —fuera de la tabla de residencia— no se veta: el
    // modo por defecto es una decision del perfil del cliente, no de la maquina
    // de desarrollo.
    await drain(ctx.llm.stream(request('nan-builders', 'glm5.3')))
    const result = await executeTool(ctx, 'web_fetch')

    expect(reached()).toBe(true)
    expect(executed()).toBe(true)
    expect(result.isError).toBe(false)
  })

  it('las dos tablas del perfil se SUMAN a las de por defecto', async () => {
    const ctx = await services()
    guard.apply(ctx, {
      mode: 'eu-only',
      residency: { 'nan-builders/glm5.3': 'eu' },
      egressTools: { tools: ['custom_egress'] },
    })
    const reached = probe(ctx)
    const custom = registerProbeTool(ctx, 'custom_egress')
    const defaultEgress = registerProbeTool(ctx, 'web_search')

    // La entrada anadida al perfil pasa...
    await drain(ctx.llm.stream(request('nan-builders', 'glm5.3')))
    // ...la regla de egreso anadida veta...
    const customResult = await executeTool(ctx, 'custom_egress')
    // ...y las reglas de por defecto siguen vetando.
    const defaultResult = await executeTool(ctx, 'web_search')

    expect(reached()).toBe(true)
    expect(custom()).toBe(false)
    expect(customResult.error?.info?.code).toBe('EGRESS_TOOL_DENIED')
    expect(defaultEgress()).toBe(false)
    expect(defaultResult.error?.info?.code).toBe('EGRESS_TOOL_DENIED')
  })
})
