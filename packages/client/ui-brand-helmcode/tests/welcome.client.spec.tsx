// @vitest-environment jsdom
/**
 * La bienvenida de una sesion nueva: el simbolo del kit en el asiento de la
 * marca del hero, y — en el cuerpo — la pieza editorial: tagline a dos pesos,
 * propuesta con "Zero logs" y los cinco modelos de la ruta europea en mono.
 * La tagline y los nombres viajan como constantes: identidad y nombres
 * propios, no copy traducido.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { HelmcodeHeroMark, WelcomeHero, type WelcomeHeroProps } from '../src/client/WelcomeHero.tsx'
import { en, es } from '../src/client/locales.ts'
import css from '../src/client/WelcomeHero.module.css'

afterEach(cleanup)

const t = makeTranslate(es) as WelcomeHeroProps['t']
const tEn = makeTranslate(en) as WelcomeHeroProps['t']

/** Los cinco modelos de la ruta europea, en el orden en que se publican. */
const MODELS = ['GLM 5.3', 'DeepSeek V4.1 Flash', 'GLM 5.3 Flash', 'Qwen 3.6', 'Gemma 4']

describe('Helmcode welcome surface', () => {
  it('carries the tagline, the proposition and the five European models', () => {
    const { container } = render(<WelcomeHero t={t} />)
    expect(container.querySelector('[data-helmcode-welcome]')).not.toBeNull()
    // La tagline es identidad y no viaja por el diccionario: es constante.
    expect(container.textContent).toContain('Burn tokens,')
    expect(container.textContent).toContain('not money.')
    expect(container.textContent).toContain('Zero logs')
    // Los modelos van en una linea mono con separadores, no en una lista. Los
    // nombres de clase viajan por el objeto del CSS module: en runtime estan
    // hasheados y un selector literal no los encuentra.
    const names = [...container.querySelectorAll(`.${css.models} b`)].map(node => node.textContent)
    expect(names).toEqual(MODELS)
    // Cuatro separadores para cinco modelos.
    expect(container.querySelectorAll(`.${css.sep}`)).toHaveLength(MODELS.length - 1)
  })

  it('opens with the kit symbol in the body, indigo and untranslated', () => {
    const { container } = render(<WelcomeHero t={tEn} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 115 145')
    expect(container.querySelector('path[fill="#4934E1"]')).not.toBeNull()
    // El mismo orden en ambos idiomas: son nombres propios, no copy.
    expect([...container.querySelectorAll(`.${css.models} b`)].map(node => node.textContent)).toEqual(MODELS)
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
