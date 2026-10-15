// @vitest-environment jsdom
/**
 * El chip de residencia de la cabecera.
 *
 * Solo promete lo que la politica del despliegue garantiza: con la guardia en
 * `eu-only` pinta la promesa; con cualquier otro modo —o sin host que la
 * declare, o con la lectura en vuelo o fallida— no renderiza nada. Ese silencio
 * es la mitad importante del contrato.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { ResidencyPolicy } from '@deepseek-ai/dsh-api-session-controller/types'
import { EuChip, type EuChipProps } from '../src/client/EuChip.tsx'
import { en, es } from '../src/client/locales.ts'
import css from '../src/client/EuChip.module.css'

afterEach(cleanup)

const t = makeTranslate(es) as EuChipProps['t']
const tEn = makeTranslate(en) as EuChipProps['t']

/**
 * Una cara de lectura que responde siempre lo mismo.
 * @param policy - la politica que el host declararia.
 * @returns el lector que inyecta el asiento.
 */
function face(policy: ResidencyPolicy | undefined): EuChipProps['residencyPolicy'] {
  return async () => policy
}

describe('EU residency chip', () => {
  it('states the promise and its reason when the guard runs eu-only', async () => {
    const view = render(<EuChip residencyPolicy={face('eu-only')} t={t} />)
    const chip = await waitFor(() => {
      const node = view.container.querySelector<HTMLElement>('[data-eu-residency]')
      expect(node).not.toBeNull()
      return node!
    })
    expect(chip.textContent).toBe(`${es['residency.chip']}✓`)
    expect(chip.getAttribute('title')).toBe(es['residency.chipTitle'])
    expect(chip.getAttribute('data-residency-policy')).toBe('eu-only')
    // El punto verde es el unico acento fuerte del chip.
    expect(chip.querySelector(`.${css.dot}`)).not.toBeNull()
  })

  it('speaks the English dictionary', async () => {
    const view = render(<EuChip residencyPolicy={face('eu-only')} t={tEn} />)
    await waitFor(() => {
      expect(view.container.querySelector('[data-eu-residency]')?.textContent)
        .toBe(`${en['residency.chip']}✓`)
    })
  })

  it.each<ResidencyPolicy | undefined>(['ask', 'open', undefined])(
    'renders nothing under %s, because the policy guarantees nothing',
    async (policy) => {
      const view = render(<EuChip residencyPolicy={face(policy)} t={t} />)
      // Un turno de microtasks: la lectura resuelve y el chip decide.
      await Promise.resolve()
      await Promise.resolve()
      expect(view.container.querySelector('[data-eu-residency]')).toBeNull()
    },
  )

  it('renders nothing when the policy read fails', async () => {
    const view = render(<EuChip residencyPolicy={async () => { throw new Error('carrier lost') }} t={t} />)
    await Promise.resolve()
    await Promise.resolve()
    expect(view.container.querySelector('[data-eu-residency]')).toBeNull()
  })
})
