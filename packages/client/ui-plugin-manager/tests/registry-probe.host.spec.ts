import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import PluginRegistryProbe, { type Config } from '../src/index.ts'

afterEach(() => { vi.unstubAllGlobals() })

async function mount(config: Partial<Config> = {}) {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(PluginRegistryProbe, PluginRegistryProbe.Config(config))
  return { ctx, probe: ctx.pluginRegistryProbe }
}

/** Un `fetch` que falla si alguien lo llama: ninguna sonda debe abrir un socket. */
function forbiddenTransport() {
  const fetch = vi.fn(() => { throw new Error('el sondeo de registros publicos ajenos esta retirado') })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

it('no sondea ningun registro publico: la eleccion queda en el registro que pnpm declare', async () => {
  const fetch = forbiddenTransport()
  const { probe } = await mount()

  expect(await probe.fastest()).toBeNull()
  expect(fetch).not.toHaveBeenCalled()
})

it('con el interruptor apagado tampoco sondea y la respuesta es la misma', async () => {
  const fetch = forbiddenTransport()
  const { probe } = await mount({ registryProbeEnabled: false })

  expect(await probe.fastest()).toBeNull()
  expect(fetch).not.toHaveBeenCalled()
})

it('un servicio descargado ya no responde', async () => {
  const { ctx, probe } = await mount()
  await ctx.fiber.dispose()

  await expect(probe.fastest()).rejects.toThrow()
})

it.each([
  { registryProbeTimeoutMs: 0 }, { registryProbeTimeoutMs: 2_147_483_648 },
  { registryProbeCacheTtlMs: -1 },
])('rejects invalid probe limits %j', (config) => {
  expect(() => PluginRegistryProbe.Config(config)).toThrow()
})
