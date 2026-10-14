// @vitest-environment jsdom
/**
 * La tarjeta de cuota: el cubo de mayor consumo, la tasa de la ventana, el
 * estado con su color y — lo que no es negociable — el rotulo de que todo esto
 * es una estimacion local.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn, es as commonEs } from '@deepseek-ai/dsh-client-locale/src/locales/index.ts'
import type { QuotaEstimateView } from '@deepseek-ai/dsh-quota-helmcode/types'
import { QuotaCard, compactTokens, type QuotaCardProps } from '../src/client/QuotaCard.tsx'
import { en, es } from '../src/client/locales.ts'
import css from '../src/client/QuotaCard.module.css'

afterEach(cleanup)

const t = makeTranslate(es, commonEs) as QuotaCardProps['t']
const tEn = makeTranslate(en, commonEn) as QuotaCardProps['t']

/** La proyeccion por defecto de una sesion con consumo del cubo SOTA. */
function estimate(overrides: Partial<QuotaEstimateView> = {}): QuotaEstimateView {
  return {
    bucket: 'sota',
    usedTokens: 3_200_000_000,
    capTokens: 5_000_000_000,
    status: 'low',
    window: { rpm: 42, limit: 100 },
    buckets: [
      { bucket: 'sota', usedTokens: 3_200_000_000 },
      { bucket: 'addon', usedTokens: 0 },
      { bucket: 'unlimited', usedTokens: 0 },
    ],
    ...overrides,
  }
}

/** Un lector de proyeccion que solo conoce `quotaEstimate`. */
function projections(value: QuotaEstimateView | undefined): QuotaCardProps['useProjection'] {
  return (key: string) => key === 'quotaEstimate' ? value : undefined
}

function card(value: QuotaEstimateView | undefined, translate = t) {
  return render(<QuotaCard useProjection={projections(value)} t={translate} />)
}

describe('QuotaCard', () => {
  it('muestra el cubo de mayor consumo con su tope y su porcentaje', () => {
    const view = card(estimate())
    const text = view.container.textContent ?? ''
    expect(text).toContain('SOTA')
    expect(text).toContain('3,2B / 5B')
    expect(text).toContain('64%')
    expect(view.container.querySelector(`.${css.fill}`)?.getAttribute('style')).toBe('width: 64%;')
  })

  it('rotula la estimacion y deja claro donde esta la verdad', () => {
    const { container } = card(estimate())
    expect(container.textContent).toContain(es['quota.estimate.notice'])
    // Y el rotulo tambien viaja traducido, no solo en castellano.
    const english = card(estimate(), tEn)
    expect(english.container.textContent).toContain(en['quota.estimate.notice'])
  })

  it('publica la tasa de la ventana como rpm sobre el limite de la key', () => {
    const { container } = card(estimate({ window: { rpm: 42, limit: 100 } }))
    expect(container.querySelector(`.${css.rpm}`)?.textContent).toBe('RPM 42/100')
    const idle = card(estimate({ window: { rpm: 0, limit: 100 } }))
    expect(idle.container.querySelector(`.${css.rpm}`)?.textContent).toBe('RPM 0/100')
  })

  it('pinta el estado en su color: en orden, queda poco y agotado', () => {
    const cases = [
      { status: 'ok', klass: css.stateOk },
      { status: 'low', klass: css.stateLow },
      { status: 'exhausted', klass: css.stateExhausted },
    ] as const
    for (const entry of cases) {
      const { container } = card(estimate({ status: entry.status }))
      const status = container.querySelector(`.${css.status}`)
      expect(status?.className, entry.status).toContain(entry.klass)
      expect(status?.textContent).toBe(es[`quota.status.${entry.status}`])
      cleanup()
    }
  })

  it('rotula un estado desconocido que llegue por el cable en vez de dejarlo en blanco', () => {
    // El valor viene validado, pero la tarjeta no puede depender de eso para
    // tener texto: un estado fuera de la tabla se lee como el estado en orden.
    const { container } = card(estimate({ status: 'raro' as QuotaEstimateView['status'] }))
    expect(container.querySelector(`.${css.status}`)?.textContent).toBe(es['quota.status.ok'])
  })

  it('no deja pasar del 100% de la barra aunque el consumo pase del tope', () => {
    const { container } = card(estimate({ usedTokens: 9_000_000_000, capTokens: 5_000_000_000, status: 'exhausted' }))
    expect(container.textContent).toContain('100%')
    expect(container.querySelector(`.${css.fill}`)?.getAttribute('style')).toBe('width: 100%;')
  })

  it('un cubo sin tope muestra el consumo y ni porcentaje ni barra llena', () => {
    const { container } = card(estimate({
      bucket: 'unlimited',
      usedTokens: 1_250_000_000,
      capTokens: null,
      status: 'ok',
    }))
    expect(container.textContent).toContain('Ilimitado')
    expect(container.textContent).toContain('1,3B')
    expect(container.textContent).not.toContain('%')
    expect(container.querySelector(`.${css.fill}`)?.getAttribute('style')).toBe('width: 0%;')
  })

  it('sin consumo contabilizado no senala cubo, y no inventa un 0/0', () => {
    const { container } = card(estimate({ bucket: null, usedTokens: 0, capTokens: null, status: 'ok' }))
    expect(container.textContent).not.toContain('SOTA')
    expect(container.textContent).toContain('0B')
    expect(container.querySelector(`.${css.fill}`)?.getAttribute('style')).toBe('width: 0%;')
  })

  it('no pinta nada sin proyeccion: una sesion sin medidor no tiene tarjeta', () => {
    const props = { useProjection: projections(undefined), t }
    const { container } = render(<QuotaCard {...props} />)
    expect(container.innerHTML).toBe('')
  })

  it('se suscribe a la unica clave que sabe leer', () => {
    const keys: string[] = []
    const useProjection = ((key: string) => {
      keys.push(key)
      return estimate()
    }) as unknown as QuotaCardProps['useProjection']
    const props = { useProjection, t }
    render(<QuotaCard {...props} />)
    expect([...new Set(keys)]).toEqual(['quotaEstimate'])
  })

  it('formatea las cifras en miles de millones, con decimal solo cuando aporta', () => {
    expect(compactTokens(0)).toBe('0B')
    expect(compactTokens(3_200_000_000)).toBe('3,2B')
    expect(compactTokens(5_000_000_000)).toBe('5B')
    expect(compactTokens(35_000_000_000)).toBe('35B')
    expect(compactTokens(123_400_000_000)).toBe('123B')
  })
})
