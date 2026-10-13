import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { HELMCODE_TOKENS } from '../src/client/tokens.ts'

/** The injected sheet as source, independent of the bundler and the test stubs. */
const SHEET = readFileSync(fileURLToPath(new URL('../src/styles/helmcode.css', import.meta.url)), 'utf8')

/** The brand kit's exact ink, dark column (https://helmcode.com/brand). */
const BRAND_DARK = {
  '--dsw-alias-bg-base': '#0a0a0a',
  '--dsw-alias-bg-layer-1': '#111111',
  '--dsw-alias-bg-layer-2': '#161616',
  '--dsw-alias-label-primary': '#ffffff',
  '--dsw-alias-label-secondary': 'rgba(255, 255, 255, 0.55)',
  '--dsw-alias-label-tertiary': 'rgba(255, 255, 255, 0.35)',
  '--dsw-alias-brand-primary': '#4934e1',
  '--dsw-alias-brand-text': '#818cf8',
  '--dsw-alias-link': '#818cf8',
  '--dsw-alias-state-error-primary': '#ff5f56',
  '--dsw-alias-state-warn-primary': '#ffbd2e',
  '--dsw-alias-state-success-primary': '#27c93f',
  '--dsw-alias-border-l2': 'rgba(255, 255, 255, 0.09)',
  '--dsw-alias-border-l4': 'rgba(255, 255, 255, 0.16)',
} as const

/** The brand asks for straight corners; every shipped radius token is zeroed. */
const RADIUS_TOKENS = [
  '--dsw-radius-xs',
  '--dsw-radius-sm',
  '--dsw-radius-md',
  '--dsw-radius-lg',
  '--dsw-radius-xl',
  '--dsw-radius-panel',
] as const

describe('helmcode token layer', () => {
  it('carries the brand kit ink exactly in the dark column', () => {
    for (const [name, value] of Object.entries(BRAND_DARK)) {
      expect(HELMCODE_TOKENS[name]?.dark, name).toBe(value)
    }
  })

  it('keeps the derived light column on the same signal indigo', () => {
    expect(HELMCODE_TOKENS['--dsw-alias-brand-primary']?.light).toBe('#4934e1')
    expect(HELMCODE_TOKENS['--dsw-alias-bg-base']?.light).toBe('#ffffff')
    expect(HELMCODE_TOKENS['--dsw-alias-label-primary']?.light).toBe('#0a0a0a')
  })

  it('zeroes the radius scale in both schemes', () => {
    for (const name of RADIUS_TOKENS) {
      expect(HELMCODE_TOKENS[name], name).toEqual({ light: '0px', dark: '0px' })
    }
  })

  it('selects Roboto and Roboto Mono, with the CJK tail kept', () => {
    expect(HELMCODE_TOKENS['--dsw-font-family']?.dark).toContain("'Roboto'")
    expect(HELMCODE_TOKENS['--dsw-font-family']?.dark).toContain('Microsoft YaHei')
    expect(HELMCODE_TOKENS['--ds-font-family-code']?.dark).toContain("'Roboto Mono'")
  })

  it('drops the glass material the brand forbids', () => {
    expect(HELMCODE_TOKENS['--dsw-menu-backdrop-filter']?.dark).toBe('none')
  })

  it('never emits an empty value', () => {
    for (const [name, modes] of Object.entries(HELMCODE_TOKENS)) {
      expect(modes.light, `${name} light`).not.toBe('')
      expect(modes.dark, `${name} dark`).not.toBe('')
    }
  })
})

describe('helmcode sheet', () => {
  it('declares the two brand families at the allowed weights only', () => {
    for (const weight of ['300', '400', '500']) expect(SHEET).toContain(`font-weight: ${weight};`)
    expect(SHEET.match(/font-family: 'Roboto';/gu)).toHaveLength(3)
    expect(SHEET.match(/font-family: 'Roboto Mono';/gu)).toHaveLength(2)
    // The brand forbids heavier weights; a 700 request would synthesize a face.
    expect(SHEET).not.toMatch(/font-weight: (?:700|900)/u)
  })

  it('serves every face from the shell rather than a network origin', () => {
    const urls = SHEET.match(/url\('[^']+'\)/gu) ?? []
    expect(urls).toHaveLength(5)
    for (const url of urls) expect(url).toMatch(/^url\('\/fonts\/roboto[^']*\.woff2'\)$/u)
  })

  it('swaps the lockup for the bare symbol on the derived light palette', () => {
    expect(SHEET).toContain('.hc-brand-mark__lockup')
    expect(SHEET).toContain('body[data-ds-dark-theme] .hc-brand-mark__lockup')
    expect(SHEET).toContain('body[data-ds-dark-theme] .hc-brand-mark__symbol')
  })
})
