// @vitest-environment jsdom
/**
 * La bienvenida de una sesion nueva: la pieza editorial del cuerpo del hero.
 * El nombre completo del producto, el lockup (simbolo + wordmark), la tagline a
 * dos pesos y la propuesta con "Zero logs". Sin lista de modelos: la portada es
 * identidad, no catalogo. La tagline viaja como constante: identidad, no copy
 * traducido. El asiento de marca del hero upstream se retiro con su titular: el
 * cuerpo es el unico dueno de la identidad.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { WelcomeHero, type WelcomeHeroProps } from '../src/client/WelcomeHero.tsx'
import { en, es } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(es) as WelcomeHeroProps['t']
const tEn = makeTranslate(en) as WelcomeHeroProps['t']

describe('Helmcode welcome surface', () => {
  it('carries the product name, the tagline and the proposition', () => {
    const { container } = render(<WelcomeHero t={t} />)
    expect(container.querySelector('[data-helmcode-welcome]')).not.toBeNull()
    // El nombre completo del producto sobre el lockup.
    expect(container.textContent).toContain('Helmcode Harness')
    // La tagline es identidad y no viaja por el diccionario: es constante.
    expect(container.textContent).toContain('Burn tokens,')
    expect(container.textContent).toContain('not money.')
    expect(container.textContent).toContain('Zero logs')
  })

  it('opens with the LOCKUP — symbol and wordmark, one identity — and lists no models', () => {
    const { container } = render(<WelcomeHero t={tEn} />)
    // Un solo svg: el lockup de 546x103, no el simbolo solo. Dos marcas (la del
    // hero upstream y esta) leian como un fallo; por eso el cuerpo lleva la
    // identidad entera.
    const svgs = [...container.querySelectorAll('svg')]
    expect(svgs).toHaveLength(1)
    expect(svgs[0]?.getAttribute('viewBox')).toBe('0 0 546 103')
    expect(container.querySelector('path[fill="#4934E1"]')).not.toBeNull()
    // El wordmark pinta por currentColor, no por un color fijo.
    expect(container.querySelector('path[fill="currentColor"]')).not.toBeNull()
    // La portada es identidad, no catalogo: ningun nombre de modelo.
    expect(container.textContent).not.toContain('GLM 5.3')
    expect(container.textContent).not.toContain('DeepSeek')
    expect(container.textContent).not.toContain('Qwen')
    expect(container.textContent).not.toContain('Gemma')
  })
})
