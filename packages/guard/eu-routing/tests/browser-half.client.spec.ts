/**
 * La mitad de NAVEGADOR de la guardia contra un `Context` de verdad: publica
 * `ctx.guardEuRouting` sobre la tabla de residencia por defecto, lee `'eu'`,
 * `'us'` y `'unknown'` como la tabla los declara, y retira el servicio con el
 * plugin (seguridad de HMR).
 *
 * Lo que esta suite fija, y por que: la lectura del navegador NO veta nada y
 * solo conoce la tabla de por defecto —la configuracion del perfil no viaja al
 * Loader del navegador—, asi que una ruta que el perfil anada se lee `'unknown'`
 * aqui aunque el host la deje pasar. Eso es una limitacion declarada de la
 * etiqueta, no una politica: el veto vive en el host.
 */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { DEFAULT_RESIDENCY_TABLE } from '../src/defaults.ts'

describe('guardia de residencia, mitad de navegador', () => {
  it('no declara dependencias: publica una tabla constante', () => {
    expect(inject).toEqual([])
  })

  it('publica la cara de lectura sobre la tabla por defecto', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin({ inject, apply })
    await fiber.await()

    const read = ctx.get('guardEuRouting')
    expect(read).toBeDefined()
    // La ruta europea y los nueve frontera salen como la tabla los declara.
    expect(read?.residency('helmcode', 'qwen3.6')).toBe('eu')
    expect(read?.residency('helmcode', 'gemma4')).toBe('eu')
    expect(read?.residency('helmcode', 'gpt-6-astra')).toBe('us')
    expect(read?.residency('helmcode', 'gemini-3.5-flash-lite')).toBe('us')
    // Lo que la tabla no declara —la ruta NaN del usuario, un proveedor ajeno—
    // se lee 'unknown', que es la lectura default-deny y no un permiso.
    expect(read?.residency('nan-builders', 'glm5.3')).toBe('unknown')
    expect(read?.residency('helmcode', 'glm5.3')).toBe('unknown')

    // La lectura es la MISMA de la tabla por defecto, sin copiarla.
    expect(read?.residency('helmcode', 'qwen3.6')).toBe(DEFAULT_RESIDENCY_TABLE['helmcode/qwen3.6'])
  })

  it('sin la guardia montada no hay cara de lectura (fail-soft)', () => {
    const ctx = new Context()
    expect(ctx.get('guardEuRouting')).toBeUndefined()
  })

  it('retira el servicio con el plugin', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin({ inject, apply })
    await fiber.await()
    expect(ctx.get('guardEuRouting')).toBeDefined()

    await fiber.dispose()
    expect(ctx.get('guardEuRouting')).toBeUndefined()
  })
})
