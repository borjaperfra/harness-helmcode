// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { apply, inject } from '../src/client/index.ts'
import { HelmcodeBrandMark, HelmcodeBrandName } from '../src/client/Brand.tsx'
import { en, NS, es } from '../src/client/locales.ts'
import { apply as hostApply } from '../src/index.ts'

const PLUGIN_ID = '@deepseek-ai/dsh-client-ui-brand-helmcode'

afterEach(() => {
  cleanup()
  // jsdom shares one document across the file, so a sheet left by a test that
  // does not dispose its fiber would satisfy a later retraction assertion.
  document.head.querySelectorAll(`style[data-plugin="${PLUGIN_ID}"]`).forEach((node) => { node.remove() })
})

/** Rank this skin registers at; below a shipped occupant so the cell is taken. */
const BRAND_PRIORITY = -10

/**
 * The holes this skin fills, with how many occupants it puts in each.
 * `settings.onboarding` is the root step the panel takes; the utilities list
 * takes the residency chip and the quota card; the two `conversation.hero.*`
 * seats are the blank-session welcome (the kit's mark and the proposition line).
 */
const HOLES = [
  { name: 'sidebar.brand.mark', kind: 'single', scope: 'root', occupants: 1 },
  { name: 'sidebar.brand.name', kind: 'single', scope: 'root', occupants: 1 },
  { name: 'conversation.hero.brand.mark', kind: 'single', scope: 'root', occupants: 1 },
  { name: 'conversation.hero.body', kind: 'single', scope: 'root', occupants: 1 },
  { name: 'conversation.session.header.utilities', kind: 'list', scope: 'session', occupants: 2 },
  { name: 'settings.onboarding', kind: 'list', scope: 'root', occupants: 1 },
] as const

interface CapturedOverride {
  source: string
  tokens: Record<string, { light: string; dark: string }>
}

/**
 * Build a client context carrying a recording theme stub, the real slot
 * registry, a real locale runtime, and a credentials remote, with the holes
 * optionally declared first.
 * @param declare - Whether to declare the slots before applying.
 * @returns The context, registry, recorder, locale, and hole controls.
 */
async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  const overrides: CapturedOverride[] = []
  ctx.provide('theme', {
    overrideTokens: (source: string, tokens: Record<string, { light: string; dark: string }>) => {
      overrides.push({ source, tokens })
      return (): void => { overrides.length = 0 }
    },
  } as never)
  // There is no jsdom browser-language detection lane here, so the asserted
  // locale is stated explicitly rather than derived.
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('es')
  ctx.provide('locale', locale)
  const credentials = {
    describe: async (refs: string[]) => ({
      ok: true,
      value: Object.fromEntries(refs.map(ref => [ref, { configured: false, writable: true }])),
    }),
    set: async () => ({ ok: true, value: undefined }),
  }
  // El catalogo servido: la unica via por la que la interfaz lee la politica de
  // residencia del despliegue (el modo de la guardia lo resuelve el host).
  const session = {
    modelCatalog: async () => ({
      ok: true,
      value: {
        default: { provider: 'helmcode', model: 'qwen3.6' },
        routableProviders: ['helmcode'],
        groups: [],
        failures: [],
        residencyPolicy: 'eu-only',
      },
    }),
  }
  ctx.provide('remote', { credentials, session } as never)
  // The credentials Remote namespace is its own service key, exactly as the
  // generated contribution registers it on the browser side.
  ctx.provide('remote.credentials', credentials as never)
  ctx.provide('remote.session', session as never)
  const declareHoles = (): (() => void) => slots.register({
    name: 'root',
    children: Object.fromEntries(HOLES.map(hole => [hole.name, { kind: hole.kind, scope: hole.scope }])),
  } as never, () => null)
  const disposeHoles = declare ? declareHoles() : undefined
  return { ctx, slots, overrides, locale, declareHoles, disposeHoles }
}

describe('helmcode brand skin plugin', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('declares the theme, slot, locale, and remote services it uses', () => {
    expect(inject).toEqual(['theme', 'slots', 'locale', 'remote', 'remote.credentials', 'remote.session'])
  })

  it('reads the deployment residency policy from the served catalog, once per success', async () => {
    const calls = vi.fn()
    const ctx = new Context()
    ctx.provide('remote', {
      session: {
        modelCatalog: async () => {
          calls()
          return { ok: true as const, value: { residencyPolicy: 'eu-only' as const } }
        },
      },
    } as never)
    const { residencyPolicyFace } = await import('../src/client/index.ts')
    const face = residencyPolicyFace(ctx)
    expect(await face()).toBe('eu-only')
    // La segunda lectura sale del cache: el modo es politica del despliegue, no
    // algo que cambie entre dos renders de la misma pagina.
    expect(await face()).toBe('eu-only')
    expect(calls).toHaveBeenCalledOnce()
  })

  it('retries after a failed policy read instead of caching the failure', async () => {
    const ctx = new Context()
    let attempt = 0
    ctx.provide('remote', {
      session: {
        modelCatalog: async () => {
          attempt += 1
          if (attempt === 1) throw new Error('carrier lost')
          return { ok: true as const, value: { residencyPolicy: 'eu-only' as const } }
        },
      },
    } as never)
    const { residencyPolicyFace } = await import('../src/client/index.ts')
    const face = residencyPolicyFace(ctx)
    // Un fallo no es una politica: se responde `undefined` y se reintenta.
    expect(await face()).toBeUndefined()
    expect(await face()).toBe('eu-only')
  })

  it('registers its own namespace under both languages and releases it with the fiber', async () => {
    const subject = await bench()
    const fiber = subject.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const translate = subject.ctx.locale.bind(NS)
    expect(translate('residency.eu')).toBe(es['residency.eu'])
    subject.locale.setLocale('en')
    expect(translate('residency.eu')).toBe(en['residency.eu'])
    expect(translate('eyebrow.plan')).toBe(en['eyebrow.plan'])

    // A second registration of the same namespace is a duplicate occupant.
    expect(() => subject.ctx.locale.register(NS, { es, en })).toThrow(/already has locale/)

    // Withdrawn dictionaries leave the key unresolved rather than translated.
    await fiber.dispose()
    expect(translate('residency.eu')).not.toBe(en['residency.eu'])
  })

  it('keeps the English dictionary key-identical to the Spanish source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort())
  })

  it('registers one token layer whose every token carries both schemes', async () => {
    const subject = await bench()
    await subject.ctx.plugin({ inject: [...inject], apply }).await()
    expect(subject.overrides).toHaveLength(1)
    const layer = subject.overrides[0]!
    expect(layer.source).toBe('@deepseek-ai/dsh-client-ui-brand-helmcode')
    const names = Object.keys(layer.tokens)
    expect(names.length).toBeGreaterThan(100)
    for (const [name, modes] of Object.entries(layer.tokens)) {
      // Alias tokens are `--dsw-*`; the code face is the shared `--ds-*` name.
      expect(/^--ds(w)?-/.test(name), name).toBe(true)
      expect(modes.light, `${name} light`).toBeTruthy()
      expect(modes.dark, `${name} dark`).toBeTruthy()
    }
  })

  it('occupies both brand seats below the shipped occupant and withdraws on teardown', async () => {
    const subject = await bench()
    const fiber = subject.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    for (const hole of HOLES.filter(entry => entry.name.startsWith('sidebar.brand'))) {
      const entries = subject.slots.entries(hole.name)
      expect(entries, hole.name).toHaveLength(1)
      expect(entries[0]?.options.priority).toBe(BRAND_PRIORITY)
    }

    subject.disposeHoles?.()
    for (const hole of HOLES) expect(subject.slots.entries(hole.name), hole.name).toHaveLength(0)
    subject.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES) expect(subject.slots.entries(hole.name), hole.name).toHaveLength(hole.occupants)

    await fiber.dispose()
    for (const hole of HOLES) expect(subject.slots.entries(hole.name), hole.name).toHaveLength(0)
  })

  it('fills a declaration that arrives after apply', async () => {
    const subject = await bench(false)
    await subject.ctx.plugin({ inject: [...inject], apply }).await()
    for (const hole of HOLES) expect(subject.slots.entries(hole.name), hole.name).toHaveLength(0)
    subject.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES) expect(subject.slots.entries(hole.name), hole.name).toHaveLength(hole.occupants)
  })

  it('mounts its own sheet and retracts it with the plugin', async () => {
    const subject = await bench()
    const fiber = subject.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    // Vitest stubs CSS to an empty string by default, so this asserts ownership
    // and cleanup; the sheet's own content is checked in tokens.client.spec.ts
    // against the source file, and lands minified in the built browser bundle.
    const selector = 'style[data-plugin="@deepseek-ai/dsh-client-ui-brand-helmcode"]'
    const tag = document.head.querySelector(selector)
    expect(tag).not.toBeNull()
    expect(tag?.getAttribute('data-plugin-css')).toBe('@deepseek-ai/dsh-client-ui-brand-helmcode/helmcode.css')
    await fiber.dispose()
    expect(document.head.querySelector(selector)).toBeNull()
  })

  it('takes the quota card seat in the session header and the onboarding step in settings', async () => {
    const subject = await bench()
    const fiber = subject.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    // La tarjeta va DESPUES de las utilidades que ya ocupaban el asiento: es un
    // indicador, no una accion.
    const quota = subject.slots.entries('conversation.session.header.utilities')
      .find(entry => entry.options.id === 'helmcode-quota')
    expect(quota?.options.order).toBe(50)
    expect(quota?.locale).toBe(NS)
    // El paso se sirve desactivado por defecto y comprueba la credencial el
    // mismo; el coordinador lo completa solo cuando la clave ya esta.
    const onboarding = subject.slots.entries('settings.onboarding')[0]
    expect(onboarding?.options.id).toBe('helmcode-api-key')
    expect(onboarding?.options.order).toBe(-10)
    // Y su cara inyectada lee el credential store con la referencia del bundle.
    const face = (onboarding?.inject as (() => { credentials: { isConfigured: () => Promise<boolean> } }) | undefined)?.()
    expect(await face?.credentials.isConfigured()).toBe(false)
    await fiber.dispose()
    expect(subject.slots.entries('settings.onboarding')).toHaveLength(0)
    expect(subject.slots.entries('conversation.session.header.utilities')).toHaveLength(0)
  })

  it('takes the residency chip seat beside the quota card and reads the policy it serves', async () => {
    const subject = await bench()
    const fiber = subject.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    // El chip de residencia va DELANTE del de cuota en la misma fila: primero la
    // promesa del despliegue, luego el consumo.
    const entries = subject.slots.entries('conversation.session.header.utilities')
    expect(entries.map(entry => entry.options.id)).toEqual(['helmcode-residency', 'helmcode-quota'])
    const residency = entries[0]!
    expect(residency.options.order).toBe(49)
    expect(residency.locale).toBe(NS)
    // La cara inyectada es la lectura de la politica, y es la misma que el host
    // resuelve con el catalogo.
    const face = (residency.inject as (() => { residencyPolicy: () => Promise<string | undefined> }) | undefined)?.()
    expect(await face?.residencyPolicy()).toBe('eu-only')
    await fiber.dispose()
  })

  it('takes the blank-session welcome seats: the kit mark and the proposition body', async () => {
    const subject = await bench()
    const fiber = subject.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    // La marca del hero se toma por debajo del ocupante de serie, como las
    // celdas de la barra lateral: el asiento queda para el kit.
    const mark = subject.slots.entries('conversation.hero.brand.mark')[0]
    expect(mark?.options.priority).toBe(BRAND_PRIORITY)
    // El cuerpo del hero es una linea de marca, no una accion: un solo ocupante
    // con el diccionario de la marca enlazado.
    const body = subject.slots.entries('conversation.hero.body')[0]
    expect(body).toBeDefined()
    expect(body?.locale).toBe(NS)
    await fiber.dispose()
    expect(subject.slots.entries('conversation.hero.brand.mark')).toHaveLength(0)
    expect(subject.slots.entries('conversation.hero.body')).toHaveLength(0)
  })

  it('renders the bare symbol in the collapsed rail and the lockup in the expanded row', () => {
    const rail = render(<HelmcodeBrandMark size={24} placement="rail" />)
    const railSvg = rail.container.querySelector('svg')!
    expect(railSvg.getAttribute('viewBox')).toBe('0 0 115 145')
    expect(railSvg.getAttribute('height')).toBe('24')
    rail.unmount()

    const row = render(<HelmcodeBrandMark size={24} placement="row" />)
    const lockup = row.container.querySelector('.hc-brand-mark__lockup > svg')!
    expect(lockup.getAttribute('viewBox')).toBe('0 0 546 103')
    expect(row.container.querySelector('.hc-brand-mark__symbol > svg')).not.toBeNull()
    // The symbol is brand indigo and is never recolored.
    expect(lockup.querySelector('path[fill="#4934E1"]')).not.toBeNull()
  })

  it('renders the wordmark alone for the name seat', () => {
    const name = render(<HelmcodeBrandName />)
    expect(name.container.querySelector('svg')?.getAttribute('viewBox')).toBe('104 0 442 103')
  })

  it('builds the credential face over the credentials remote namespace', async () => {
    const describe = vi.fn(async (refs: string[]) => ({
      ok: true as const,
      value: Object.fromEntries(refs.map(ref => [ref, { configured: ref === 'HELMCODE_API_KEY', writable: true }])),
    }))
    const set = vi.fn(async () => ({ ok: true as const, value: undefined }))
    const ctx = new Context()
    ctx.provide('remote', { credentials: { describe, set } } as never)
    const { credentialFace, API_KEY_REF } = await import('../src/client/index.ts')
    expect(API_KEY_REF).toBe('HELMCODE_API_KEY')
    const face = credentialFace(ctx)
    expect(await face.isConfigured()).toBe(true)
    expect(describe).toHaveBeenCalledWith(['HELMCODE_API_KEY'])
    expect(await face.set('hc-live')).toBeUndefined()
    expect(set).toHaveBeenCalledWith('HELMCODE_API_KEY', 'hc-live')
  })

  it('reports a refused credential read as not configured, and a refusal message on write', async () => {
    const ctx = new Context()
    ctx.provide('remote', {
      credentials: {
        describe: async () => ({ ok: false, error: { code: 'gateway/internal', message: 'no provider' } }),
        set: async () => ({ ok: false, error: { code: 'credential/rejected', message: 'read-only source' } }),
      },
    } as never)
    const { credentialFace } = await import('../src/client/index.ts')
    const face = credentialFace(ctx)
    expect(await face.isConfigured()).toBe(false)
    expect(await face.set('x')).toBe('read-only source')
  })
})
