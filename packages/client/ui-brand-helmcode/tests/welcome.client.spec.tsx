// @vitest-environment jsdom
/**
 * La bienvenida de una sesion nueva: la pieza editorial del cuerpo del hero.
 * El lockup completo (simbolo + wordmark) abre, la tagline va a dos pesos, la
 * propuesta fija "Zero logs" y los cinco modelos cierran en mono con GLM 5.3
 * primero. La tagline y los nombres viajan como constantes: identidad y
 * nombres propios, no copy traducido. El asiento de marca del hero upstream se
 * retiro con su titular: el cuerpo es el unico dueno de la identidad.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { WelcomeHero, type WelcomeHeroProps } from '../src/client/WelcomeHero.tsx'
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

  it('opens with the LOCKUP — symbol and wordmark, one identity', () => {
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
    // El mismo orden en ambos idiomas: son nombres propios, no copy.
    expect([...container.querySelectorAll(`.${css.models} b`)].map(node => node.textContent)).toEqual(MODELS)
  })
})
