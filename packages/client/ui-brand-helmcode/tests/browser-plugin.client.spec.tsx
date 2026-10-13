// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { apply, inject } from '../src/client/index.ts'
import { HelmcodeBrandMark, HelmcodeBrandName } from '../src/client/Brand.tsx'
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

const HOLES = ['sidebar.brand.mark', 'sidebar.brand.name'] as const

interface CapturedOverride {
  source: string
  tokens: Record<string, { light: string; dark: string }>
}

/**
 * Build a client context carrying a recording theme stub and the real slot
 * registry, with the sidebar holes optionally declared first.
 * @param declare - Whether to declare the brand holes before applying.
 * @returns The context, registry, recorder, and hole controls.
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
  const declareHoles = (): (() => void) => slots.register({
    name: 'root',
    children: Object.fromEntries(HOLES.map(name => [name, { kind: 'single', scope: 'root' }])),
  } as never, () => null)
  const disposeHoles = declare ? declareHoles() : undefined
  return { ctx, slots, overrides, declareHoles, disposeHoles }
}

describe('helmcode brand skin plugin', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('declares the theme and slot services it uses', () => {
    expect(inject).toEqual(['theme', 'slots'])
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
    for (const hole of HOLES) {
      const entries = subject.slots.entries(hole)
      expect(entries, hole).toHaveLength(1)
      expect(entries[0]?.options.priority).toBe(BRAND_PRIORITY)
    }

    subject.disposeHoles?.()
    for (const hole of HOLES) expect(subject.slots.entries(hole), hole).toHaveLength(0)
    subject.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES) expect(subject.slots.entries(hole), hole).toHaveLength(1)

    await fiber.dispose()
    for (const hole of HOLES) expect(subject.slots.entries(hole), hole).toHaveLength(0)
  })

  it('fills a declaration that arrives after apply', async () => {
    const subject = await bench(false)
    await subject.ctx.plugin({ inject: [...inject], apply }).await()
    for (const hole of HOLES) expect(subject.slots.entries(hole), hole).toHaveLength(0)
    subject.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES) expect(subject.slots.entries(hole), hole).toHaveLength(1)
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
})
