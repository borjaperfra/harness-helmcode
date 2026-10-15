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

  it('fills user-authored bubbles with the brand indigo at low alpha', () => {
    // El mismo token sirve al mensaje del usuario, al input de goal y a la
    // respuesta de pregunta: las tres son superficies del usuario, no del
    // asistente.
    expect(HELMCODE_TOKENS['--dsw-specific-bubble']).toEqual({
      dark: 'rgba(73, 52, 225, 0.12)',
      light: 'rgba(73, 52, 225, 0.07)',
    })
    expect(HELMCODE_TOKENS['--dsw-specific-bubble-highlight']).toEqual({
      dark: 'rgba(73, 52, 225, 0.18)',
      light: 'rgba(73, 52, 225, 0.12)',
    })
  })

  it('leaves the assistant on the neutral canvas', () => {
    // El asistente no pinta superficie propia: su mensaje se lee sobre el fondo
    // base, que sigue siendo el neutro de marca en los dos esquemas.
    expect(HELMCODE_TOKENS['--dsw-alias-bg-base']).toEqual({ dark: '#0a0a0a', light: '#ffffff' })
  })

  it('accents inline code and the code-block banner, never the code body', () => {
    expect(HELMCODE_TOKENS['--dsw-alias-markdown-inline-code']).toEqual({
      dark: 'rgba(73, 52, 225, 0.20)',
      light: 'rgba(73, 52, 225, 0.08)',
    })
    expect(HELMCODE_TOKENS['--dsw-alias-markdown-code-block-banner']).toEqual({
      dark: 'rgba(73, 52, 225, 0.18)',
      light: 'rgba(73, 52, 225, 0.07)',
    })
    expect(HELMCODE_TOKENS['--dsw-alias-markdown-code-block']).toEqual({ dark: '#111111', light: '#fafafa' })
  })

  it('tints with the brand indigo itself, never an invented purple', () => {
    // rgb(73, 52, 225) es --dsw-alias-brand-primary (#4934e1): el acento es el
    // del skin, no un morado nuevo.
    expect(HELMCODE_TOKENS['--dsw-alias-brand-primary']?.dark).toBe('#4934e1')
    for (const name of [
      '--dsw-specific-bubble',
      '--dsw-specific-bubble-highlight',
      '--dsw-alias-markdown-inline-code',
      '--dsw-alias-markdown-code-block-banner',
    ]) {
      for (const mode of ['light', 'dark'] as const) {
        expect(HELMCODE_TOKENS[name]?.[mode], `${name} ${mode}`).toMatch(/^rgba\(73, 52, 225, 0\.\d+\)$/u)
      }
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

  it('shows the lockup in both schemes — the kit ships a positive asset', () => {
    // El kit trae logo-positivo (tinta negra) y logo-negativo (tinta blanca):
    // la sede del brand no degrada al símbolo desnudo en claro, y el wordmark
    // toma la tinta primaria del tema por currentColor.
    expect(SHEET).toContain('.hc-brand-mark__lockup {\n  display: inline-flex')
    expect(SHEET).toContain('.hc-brand-mark__symbol {\n  display: none')
    expect(SHEET).toContain('color: var(--dsw-alias-label-primary)')
    expect(SHEET).not.toContain('body[data-ds-dark-theme] .hc-brand-mark__lockup')
  })

  it('accents quotes and reasoning traces through the hooks it documents', () => {
    // El marcador de cita y la traza de razonamiento no tienen token propio: el
    // skin se acopla a los hooks estables que publican los paquetes, y ese
    // acoplamiento queda escrito en la hoja.
    expect(SHEET).toContain('body [data-chat-flow] blockquote {')
    expect(SHEET).toContain('border-left-color: var(--dsw-alias-brand-text);')
    expect(SHEET).toContain("body [data-variant='think'] [data-disclosure-row],")
    expect(SHEET).toContain("body [data-variant='think'] [class*='_markdown'] {")
    expect(SHEET).toContain('color: var(--dsw-alias-brand-text);')
  })

  it('never invents an accent ink: the sheet only names theme tokens', () => {
    expect(SHEET).not.toMatch(/#[0-9a-f]{3,8}\b/iu)
    expect(SHEET).not.toMatch(/\brgba?\(/u)
  })
})
