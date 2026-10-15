// @vitest-environment jsdom
/**
 * La bienvenida de una sesion nueva: el simbolo del kit en el asiento de la
 * marca del hero, y — en el cuerpo — una linea de propuesta de valor con los
 * cuatro modelos de la ruta europea. Los nombres salen del vocabulario del
 * onboarding, que es su unico dueno.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { HelmcodeHeroMark, WelcomeHero, type WelcomeHeroProps } from '../src/client/WelcomeHero.tsx'
import { en, es } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(es) as WelcomeHeroProps['t']
const tEn = makeTranslate(en) as WelcomeHeroProps['t']

/** Los cuatro modelos de la ruta europea, en el orden en que se publican. */
const MODELS = [
  es['onboarding.model.helmcode/deepseek-v4-flash'],
  es['onboarding.model.helmcode/glm5.3-flash'],
  es['onboarding.model.helmcode/qwen3.6'],
  es['onboarding.model.helmcode/gemma4'],
]

describe('Helmcode welcome surface', () => {
  it('states the proposition and the four European models, and nothing else', () => {
    const { container } = render(<WelcomeHero t={t} />)
    expect(container.querySelector('[data-helmcode-welcome]')).not.toBeNull()
    expect(container.textContent).toContain(es['welcome.valueProposition'])
    expect(container.textContent).toContain(es['welcome.models'])
    const names = [...container.querySelectorAll('li')].map(node => node.textContent)
    expect(names).toEqual(MODELS)
  })

  it('speaks the English dictionary without retyping a model name', () => {
    const { container } = render(<WelcomeHero t={tEn} />)
    expect(container.textContent).toContain(en['welcome.valueProposition'])
    // El nombre de cada modelo es el mismo en los dos idiomas: es un nombre
    // propio del catalogo, no copy traducido.
    expect([...container.querySelectorAll('li')].map(node => node.textContent)).toEqual(MODELS)
  })

  it('carries the kit symbol into the hero mark seat', () => {
    const { container } = render(<HelmcodeHeroMark size={34} className="host-mark" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 115 145')
    expect(svg?.getAttribute('height')).toBe('34')
    // La clase del host viaja al svg, que es quien lleva la geometria del hero.
    expect(svg?.getAttribute('class')).toBe('host-mark')
    // El simbolo es indigo de marca y nunca se recolorea.
    expect(container.querySelector('path[fill="#4934E1"]')).not.toBeNull()
  })
})
