/**
 * El medidor local de cuota: la atribucion por RUTA, el descuento de tokens, la
 * ventana de rpm y la unidad de proyeccion registrada.
 *
 * La prueba central es la primera: la ruta NaN sirve los mismos modelos que
 * Helmcode y su consumo NO se imputa al plan. La segunda es la rotulacion: el
 * medidor solo ve esta sesion, y la vista lo dice.
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createMessage } from '@deepseek-ai/dsh-llm'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition, SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import * as QuotaPlugin from '../src/index.ts'
import {
  BUCKETS, QUOTA_PLAN, RPM_WINDOW_MS, foldQuotaEstimate, quotaEstimateProjectionDefinition, usageTokens,
  type QuotaEstimateState,
} from '../src/projection.ts'
import { KEY_LIMITS, PLANS, bucketOf } from '../src/limits.ts'

/** La unidad tal y como el registro la consume: anota el `init` de dos argumentos. */
const unit: ProjectionDefinition<'quotaEstimate', QuotaEstimateState> = quotaEstimateProjectionDefinition

/** Una sesion vacia se pliega desde su estado inicial declarado. */
function init(): QuotaEstimateState {
  return unit.init({} as never, 0 as never)
}

/**
 * Un evento `assistant/message` de una ruta y modelo concretos.
 * @param time - tiempo del evento, ms.
 * @param provider - ruta de proveedor que sirvio la llamada.
 * @param model - modelo exacto.
 * @param usage - uso declarado por el proveedor, si lo hay.
 * @returns el evento listo para plegar.
 */
function assistantMessage(
  time: number,
  provider: string,
  model: string,
  usage?: TokenUsage,
): SessionEvent {
  // El evento se compone a mano porque una sesion real necesitaria su log
  // entero; el plegado solo lee el tiempo y `data`, y la comprobacion de forma
  // la hace el registro, no esta prueba.
  const event: {
    time: number
    type: 'assistant/message'
    data: {
      turn: number
      step: number
      stream: readonly never[]
      message: ReturnType<typeof createMessage>
      usage?: TokenUsage
    }
  } = {
    time,
    type: 'assistant/message',
    data: {
      turn: 1,
      step: 1,
      stream: [],
      message: createMessage({ role: 'assistant', content: [], source: { kind: 'model', provider, model } }),
      ...usage === undefined ? {} : { usage },
    },
  }
  return event as unknown as SessionEvent
}

/** Pliega una lista de eventos desde el estado inicial. */
function foldAll(events: readonly SessionEvent[]): QuotaEstimateState {
  return events.reduce<QuotaEstimateState>(foldQuotaEstimate, init())
}

describe('atribucion por ruta', () => {
  it('solo cuenta las rutas de Helmcode: el consumo de NaN no toca la cuota', () => {
    const state = foldAll([
      assistantMessage(1_000, 'nan-builders', 'deepseek-v4-flash', { inputTokens: 5_000, outputTokens: 500 }),
      assistantMessage(2_000, 'openai', 'gpt-6-astra', { inputTokens: 9_000, outputTokens: 900 }),
    ])
    expect(state.sota).toBeNull()
    expect(state.view.bucket).toBeNull()
    expect(state.view.usedTokens).toBe(0)
    expect(state.view.window.rpm).toBe(0)
    // Y la tabla dice lo mismo que el medidor, que es la razon de la coincidencia.
    expect(bucketOf('nan-builders', 'deepseek-v4-flash')).toBeUndefined()
  })

  it('imputa cada modelo de Helmcode a su cubo', () => {
    const state = foldAll([
      assistantMessage(1_000, 'helmcode', 'deepseek-v4-flash', { inputTokens: 0, outputTokens: 0, totalTokens: 1_000 }),
      assistantMessage(2_000, 'helmcode', 'glm5.3', { inputTokens: 0, outputTokens: 0, totalTokens: 2_000 }),
      assistantMessage(3_000, 'helmcode', 'qwen3.6', { inputTokens: 0, outputTokens: 0, totalTokens: 500 }),
    ])
    expect(state.sota?.usedTokens).toBe(1_000)
    expect(state.addon?.usedTokens).toBe(2_000)
    expect(state.unlimited?.usedTokens).toBe(500)
    // El cubo senalado es el de mayor consumo, con su tope del plan por defecto.
    expect(state.view.bucket).toBe('addon')
    expect(state.view.capTokens).toBe(PLANS[QUOTA_PLAN].addonTokensPerMonth)
  })

  it('ignora un mensaje cuya fuente no es un modelo', () => {
    const state = init()
    // La guarda mira la fuente: un mensaje de asistente que no venga de una
    // ruta de modelo no tiene cubo al que imputarse.
    const other = {
      time: 1,
      type: 'assistant/message',
      data: {
        turn: 1,
        step: 1,
        stream: [],
        message: { source: { kind: 'tool', callId: 'c' } },
      },
    } as unknown as SessionEvent
    expect(foldQuotaEstimate(state, other)).toBe(state)
  })

  it('ignora cualquier evento que no sea un mensaje del asistente, sin cambiar la referencia', () => {
    const state = init()
    const boundary = { time: 1, type: 'step/end', data: { turn: 1, step: 1 } } as unknown as SessionEvent
    expect(foldQuotaEstimate(state, boundary)).toBe(state)
  })
})

describe('tokens descontados', () => {
  it('prefiere el total exacto del proveedor cuando lo trae', () => {
    // El total exacto manda aunque los contadores parciales sumen otra cosa.
    expect(usageTokens({ inputTokens: 10, outputTokens: 20, totalTokens: 999 })).toBe(999)
  })

  it('suma los contadores disjuntos y deja fuera las razonadas', () => {
    expect(usageTokens({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 25,
      cacheWriteTokens: 5,
      reasoningTokens: 40,
    })).toBe(180)
  })

  it('no inventa consumo con cifras ausentes, negativas o no finitas', () => {
    expect(usageTokens(undefined)).toBe(0)
    expect(usageTokens({ inputTokens: -10, outputTokens: Number.NaN })).toBe(0)
    expect(usageTokens({ inputTokens: 10, outputTokens: 5, totalTokens: Number.NaN })).toBe(15)
    expect(usageTokens({ inputTokens: 10, outputTokens: 5, totalTokens: -1 })).toBe(15)
  })

  it('acumula una llamada sin uso declarado como cero tokens pero si como peticion', () => {
    const state = foldAll([assistantMessage(1_000, 'helmcode', 'deepseek-v4-flash')])
    expect(state.sota?.usedTokens).toBe(0)
    expect(state.view.window.rpm).toBe(1)
  })
})

describe('ventana deslizante de rpm', () => {
  it('cuenta las peticiones dentro de la ventana y descarta las que salen', () => {
    const state = foldAll([
      assistantMessage(1_000_000, 'helmcode', 'deepseek-v4-flash', { inputTokens: 0, outputTokens: 0, totalTokens: 1 }),
      assistantMessage(1_000_000 + RPM_WINDOW_MS, 'helmcode', 'qwen3.6', { inputTokens: 0, outputTokens: 0, totalTokens: 1 }),
      assistantMessage(1_000_000 + RPM_WINDOW_MS + 1, 'helmcode', 'qwen3.6', { inputTokens: 0, outputTokens: 0, totalTokens: 1 }),
    ])
    // La primera queda exactamente a 60s de la tercera: fuera, no dentro.
    expect(state.view.window.rpm).toBe(2)
    expect(state.view.window.limit).toBe(KEY_LIMITS.requestsPerMinute)
    // El token del cubo viejo se va con su peticion; la ventana publicada, no.
    expect(state.sota?.timestamps).toEqual([])
    expect(state.unlimited?.timestamps).toEqual([
      1_000_000 + RPM_WINDOW_MS,
      1_000_000 + RPM_WINDOW_MS + 1,
    ])
  })

  it('una sola tasa por key: los tiempos de todos los cubos cuentan juntos', () => {
    const state = foldAll([
      assistantMessage(1_000, 'helmcode', 'deepseek-v4-flash', { inputTokens: 0, outputTokens: 0, totalTokens: 1 }),
      assistantMessage(1_100, 'helmcode', 'glm5.3', { inputTokens: 0, outputTokens: 0, totalTokens: 1 }),
      assistantMessage(1_200, 'helmcode', 'gemma4', { inputTokens: 0, outputTokens: 0, totalTokens: 1 }),
    ])
    expect(state.view.window.rpm).toBe(3)
    expect(state.view.buckets.map(entry => entry.bucket)).toEqual([...BUCKETS])
  })
})

describe('estado del cubo senalado', () => {
  it('avisa al cruzar el umbral y marca agotado al llegar al tope', () => {
    const cap = PLANS[QUOTA_PLAN].sotaTokensPerMonth
    expect(cap).not.toBeNull()
    const full = cap as number
    const low = foldAll([
      assistantMessage(1, 'helmcode', 'deepseek-v4-flash', { inputTokens: 0, outputTokens: 0, totalTokens: full * 0.85 }),
    ])
    expect(low.view.status).toBe('low')
    const exhausted = foldAll([
      assistantMessage(1, 'helmcode', 'deepseek-v4-flash', { inputTokens: 0, outputTokens: 0, totalTokens: full }),
    ])
    expect(exhausted.view.status).toBe('exhausted')
    expect(exhausted.view.capTokens).toBe(full)
  })

  it('un cubo sin tope se queda en orden y sin tope', () => {
    const state = foldAll([assistantMessage(1, 'helmcode', 'gemma4', { inputTokens: 0, outputTokens: 0, totalTokens: 99_999_999_999 })])
    expect(state.view.bucket).toBe('unlimited')
    expect(state.view.capTokens).toBeNull()
    expect(state.view.status).toBe('ok')
  })

  it('sin ninguna llamada de Helmcode la vista esta vacia y en orden', () => {
    const state = init()
    expect(state.view).toMatchObject({ bucket: null, usedTokens: 0, capTokens: null, status: 'ok' })
    expect(state.view.window).toEqual({ rpm: 0, limit: KEY_LIMITS.requestsPerMinute })
    expect(state.view.buckets).toEqual(BUCKETS.map(bucket => ({ bucket, usedTokens: 0 })))
  })
})

describe('la unidad de proyeccion', () => {
  it('declara su clave, su version y publica la vista por el cable', () => {
    expect(quotaEstimateProjectionDefinition.key).toBe('quotaEstimate')
    expect(quotaEstimateProjectionDefinition.stateVersion).toBe(1)
    const state = foldAll([assistantMessage(1, 'helmcode', 'deepseek-v4-flash', { inputTokens: 0, outputTokens: 0, totalTokens: 42 })])
    const view = quotaEstimateProjectionDefinition.wire.view(state)
    expect(view).toBe(state.view)
    expect(quotaEstimateProjectionDefinition.wire.viewSchema.safeParse(view).success).toBe(true)
  })

  it('rechaza un estado que la tabla no pudo producir', () => {
    const state = init()
    expect(quotaEstimateProjectionDefinition.stateSchema.safeParse(state).success).toBe(true)
    const badSota = { ...state, sota: { usedTokens: -1, timestamps: [] } }
    expect(quotaEstimateProjectionDefinition.stateSchema.safeParse(badSota).success).toBe(false)
    expect(quotaEstimateProjectionDefinition.stateSchema.safeParse({ ...state, extra: true }).success).toBe(false)
    expect(quotaEstimateProjectionDefinition.wire.viewSchema.safeParse({ ...state.view, status: 'green' }).success).toBe(false)
  })
})

describe('el plugin host', () => {
  it('registra la unidad en ctx.sessionProjections al montarse', () => {
    const register = vi.fn()
    const ctx = new Context()
    ctx.provide('sessionProjections', { register } as never)
    expect(QuotaPlugin.inject).toEqual(['sessionProjections'])
    QuotaPlugin.apply(ctx)
    expect(register).toHaveBeenCalledWith(quotaEstimateProjectionDefinition)
  })

  it('deja el registro en manos del servidor, que es quien lo libera', () => {
    // El contrato del registro es devolver el disposedor; el plugin no lo
    // guarda porque la fibra entera se desmonta con el.
    const dispose = vi.fn()
    const register = vi.fn(() => dispose)
    const ctx = new Context()
    ctx.provide('sessionProjections', { register } as never)
    QuotaPlugin.apply(ctx)
    expect(register).toHaveReturnedWith(dispose)
    expect(dispose).not.toHaveBeenCalled()
  })

  it('el tipo del registro que usa es el de la sesion', () => {
    // Anclaje de compilacion: si la clave dejara de existir en el mapa de
    // proyecciones, esta linea no compilaria.
    const key: keyof import('@deepseek-ai/dsh-session-projection/types').SessionProjectionMap = 'quotaEstimate'
    const registry: Pick<SessionProjectionRegistry, 'register'> | undefined = undefined
    expect(key).toBe(quotaEstimateProjectionDefinition.key)
    expect(registry).toBeUndefined()
  })
})
