// @vitest-environment jsdom
/**
 * El chip de cuota: en la fila de utilidades solo cabe UNA linea, y lo que no
 * cabe — la barra, la ventana de RPM y, lo que no es negociable, el rotulo de
 * que todo esto es una estimacion local — vive en el popover.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
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

function chip(value: QuotaEstimateView | undefined, translate = t) {
  return render(<QuotaCard useProjection={projections(value)} t={translate} />)
}

/** El boton del chip: la unica linea que ocupa el asiento de utilidades. */
function trigger(container: HTMLElement): HTMLElement {
  const node = container.querySelector<HTMLElement>('[data-quota-chip]')
  expect(node).not.toBeNull()
  return node!
}

/**
 * Abre el detalle con el foco, que es como lo alcanza el teclado, y devuelve el
 * panel. El popover se monta por portal, asi que no cuelga del contenedor.
 * @param container - el contenedor del render.
 * @returns el panel de detalle ya abierto.
 */
function openDetail(container: HTMLElement): HTMLElement {
  fireEvent.focus(trigger(container))
  const panel = document.body.querySelector<HTMLElement>(`.${css.popover}`)
  expect(panel).not.toBeNull()
  return panel!
}

describe('QuotaCard', () => {
  it('reduce el asiento de la cabecera a un chip de una linea', () => {
    const { container } = chip(estimate())
    const node = trigger(container)
    // Las tres piezas del chip, en orden: punto, cubo y cifras.
    expect(node.querySelector(`.${css.dot}`)).not.toBeNull()
    expect(node.querySelector(`.${css.short}`)?.textContent).toBe('SOTA')
    expect(node.querySelector(`.${css.count}`)?.textContent).toBe('3,2B / 5B')
    expect(node.querySelector(`.${css.chipPercent}`)?.textContent).toBe('64%')
    // Y el chip es de una linea: la barra, el RPM y el aviso NO se cuelan.
    const text = container.textContent ?? ''
    expect(text).not.toContain(es['quota.estimate.notice'])
    expect(text).not.toContain('RPM')
    expect(container.querySelector(`.${css.bar}`)).toBeNull()
  })

  it('nombra el chip para quien no ve el color del punto', () => {
    const { container } = chip(estimate())
    expect(trigger(container).getAttribute('aria-label')).toBe('Queda poco · SOTA · 3,2B / 5B · 64%')
    expect(trigger(container).getAttribute('aria-expanded')).toBe('false')
  })

  it('guarda el detalle completo en el popover, que abre al hover y al foco', () => {
    const { container } = chip(estimate())
    expect(document.body.querySelector(`.${css.popover}`)).toBeNull()
    fireEvent.mouseEnter(trigger(container))
    const panel = document.body.querySelector<HTMLElement>(`.${css.popover}`)
    expect(panel).not.toBeNull()
    expect(trigger(container).getAttribute('aria-expanded')).toBe('true')
    // El titulo, la barra con su porcentaje, la ventana de RPM y el aviso.
    expect(panel?.textContent).toContain(es['eyebrow.plan'])
    expect(panel?.textContent).toContain(es['quota.bucket.sota'])
    expect(panel?.textContent).toContain('3,2B / 5B')
    expect(panel?.textContent).toContain('64%')
    expect(panel?.querySelector(`.${css.fill}`)?.getAttribute('style')).toBe('width: 64%;')
    expect(panel?.querySelector(`.${css.rpm}`)?.textContent).toBe('RPM 42/100')
    expect(panel?.textContent).toContain(es['quota.estimate.notice'])
    // El puntero fuera del chip y del panel lo cierra.
    fireEvent.mouseLeave(trigger(container))
    expect(document.body.querySelector(`.${css.popover}`)).toBeNull()
  })

  it('rotula la estimacion y deja claro donde esta la verdad', () => {
    const spanish = openDetail(chip(estimate()).container)
    expect(spanish.textContent).toContain(es['quota.estimate.notice'])
    cleanup()
    // Y el rotulo tambien viaja traducido, no solo en castellano.
    const english = openDetail(chip(estimate(), tEn).container)
    expect(english.textContent).toContain(en['quota.estimate.notice'])
  })

  it('publica la tasa de la ventana como rpm sobre el limite de la key', () => {
    const busy = openDetail(chip(estimate({ window: { rpm: 42, limit: 100 } })).container)
    expect(busy.querySelector(`.${css.rpm}`)?.textContent).toBe('RPM 42/100')
    cleanup()
    const idle = openDetail(chip(estimate({ window: { rpm: 0, limit: 100 } })).container)
    expect(idle.querySelector(`.${css.rpm}`)?.textContent).toBe('RPM 0/100')
  })

  it('pinta el estado en su color: en orden, queda poco y agotado', () => {
    const cases = [
      { status: 'ok', dot: css.dotOk, state: css.stateOk },
      { status: 'low', dot: css.dotLow, state: css.stateLow },
      { status: 'exhausted', dot: css.dotExhausted, state: css.stateExhausted },
    ] as const
    for (const entry of cases) {
      const { container } = chip(estimate({ status: entry.status }))
      const dot = trigger(container).querySelector(`.${css.dot}`)
      expect(dot?.className, entry.status).toContain(entry.dot)
      const status = openDetail(container).querySelector(`.${css.status}`)
      expect(status?.className, entry.status).toContain(entry.state)
      expect(status?.textContent).toBe(es[`quota.status.${entry.status}`])
      cleanup()
    }
  })

  it('rotula un estado desconocido que llegue por el cable en vez de dejarlo en blanco', () => {
    // El valor viene validado, pero el chip no puede depender de eso para
    // tener texto: un estado fuera de la tabla se lee como el estado en orden.
    const { container } = chip(estimate({ status: 'raro' as QuotaEstimateView['status'] }))
    expect(openDetail(container).querySelector(`.${css.status}`)?.textContent).toBe(es['quota.status.ok'])
  })

  it('no deja pasar del 100% de la barra aunque el consumo pase del tope', () => {
    const { container } = chip(estimate({ usedTokens: 9_000_000_000, capTokens: 5_000_000_000, status: 'exhausted' }))
    expect(container.textContent).toContain('100%')
    expect(openDetail(container).querySelector(`.${css.fill}`)?.getAttribute('style')).toBe('width: 100%;')
  })

  it('un cubo sin tope muestra el consumo y ni porcentaje ni barra llena', () => {
    const { container } = chip(estimate({
      bucket: 'unlimited',
      usedTokens: 1_250_000_000,
      capTokens: null,
      status: 'ok',
    }))
    expect(container.textContent).toContain('UNLIM')
    expect(container.textContent).toContain('1,3B')
    expect(container.textContent).not.toContain('%')
    expect(openDetail(container).querySelector(`.${css.fill}`)?.getAttribute('style')).toBe('width: 0%;')
  })

  it('nombra corto cada cubo, y el detalle lleva el nombre entero', () => {
    expect(chip(estimate({ bucket: 'addon' })).container.textContent).toContain('ADD-ON')
    cleanup()
    const addon = openDetail(chip(estimate({ bucket: 'addon' })).container)
    expect(addon.textContent).toContain(es['quota.bucket.addon'])
  })

  it('sin consumo contabilizado no senala cubo, y no inventa un 0/0', () => {
    const { container } = chip(estimate({ bucket: null, usedTokens: 0, capTokens: null, status: 'ok' }))
    expect(container.textContent).not.toContain('SOTA')
    expect(container.textContent).toContain('0B')
    expect(openDetail(container).querySelector(`.${css.fill}`)?.getAttribute('style')).toBe('width: 0%;')
  })

  it('no pinta nada sin proyeccion: una sesion sin medidor no tiene chip', () => {
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
