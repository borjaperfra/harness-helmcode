/**
 * Chip de cuota de la sesion: un ESTIMADOR local.
 *
 * El limite de Helmcode es por KEY y por ORGANIZACION, asi que la misma cuota
 * la comparten el IDE del cliente, su pipeline nocturno y cualquier otra cosa
 * que use esa clave. La proyeccion `quotaEstimate` solo ve lo que esta sesion y
 * esta maquina han medido, y por eso el detalle se rotula como estimacion: la
 * consola de Helmcode es la unica fuente autoritativa.
 *
 * Solo cuenta rutas helmcode: el consumo que la ruta NaN sirve con los mismos
 * modelos no entra, porque no es cuota de Helmcode.
 *
 * El asiento es la fila de utilidades de la cabecera, una linea flex de mandos
 * pequenos: aqui solo cabe un chip de una linea (punto de estado, cubo, cifras
 * y porcentaje). El resto del detalle — la barra, la ventana de RPM y el aviso
 * honesto — vive en el popover de hover/focus.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { QuotaEstimateView } from '@deepseek-ai/dsh-quota-helmcode/types'
import type { UseProjection } from '@deepseek-ai/dsh-api-session-controller/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { HelmcodeKey } from './locales.ts'
import css from './QuotaCard.module.css'

/** Lo que el chip puede consumir de la proyeccion. */
export interface QuotaCardProps extends PropsLocale<'helmcode'> {
  /** Lector de la proyeccion de la sesion. */
  useProjection: UseProjection
}

/** Los tres estados del cubo, con su clase de color para el texto del detalle. */
const STATUS_CLASS = {
  // El modulo CSS virtual tipa sus clases como `string | undefined` bajo
  // `noUncheckedIndexedAccess`; estas tres las declara QuotaCard.module.css, y
  // el cierre de tipos que las une es este mismo mapa.
  ok: css.stateOk as string,
  low: css.stateLow as string,
  exhausted: css.stateExhausted as string,
} satisfies Record<QuotaEstimateView['status'], string>

/** Los tres estados del cubo, con la clase que colorea el punto del chip. */
const DOT_CLASS = {
  ok: css.dotOk as string,
  low: css.dotLow as string,
  exhausted: css.dotExhausted as string,
} satisfies Record<QuotaEstimateView['status'], string>

/** La clave de locale de cada cubo, para el titulo del detalle. */
const BUCKET_KEY = {
  sota: 'quota.bucket.sota',
  addon: 'quota.bucket.addon',
  unlimited: 'quota.bucket.unlimited',
} as const

/**
 * La etiqueta corta de cada cubo: lo unico que cabe en una linea de utilidades.
 * El nombre largo viaja en el titulo del popover, que si tiene sitio.
 */
const SHORT_BUCKET = {
  sota: 'SOTA',
  addon: 'ADD-ON',
  unlimited: 'UNLIM',
} as const

/** Distancia que el popover guarda con su ancla y con cada borde de la ventana. */
const POPOVER_GAP = 6
const POPOVER_MARGIN = 16

/**
 * La clave de locale de un estado. El respaldo sobre `quota.status.ok` existe
 * porque un valor fuera de la tabla llegaria desde el cable, y el estado se
 * rotula siempre en vez de quedarse en blanco.
 * @param status - estado publicado.
 * @returns la clave del diccionario.
 */
function statusKey(status: string): HelmcodeKey {
  return status === 'low' || status === 'exhausted' ? `quota.status.${status}` : 'quota.status.ok'
}

/**
 * Redondea una cifra a una decima solo por debajo de cien: `3,2B` y `15B` no
 * necesitan el mismo detalle.
 * @param value - cifra a redondear.
 * @returns la cifra sin decimales sobrantes.
 */
function round(value: number): string {
  return value >= 100 ? String(Math.round(value)) : String(Math.round(value * 10) / 10)
}

/**
 * Formatea una cantidad de tokens en miles de millones de tokens, que es la
 * unidad en la que Helmcode publica sus cuotas.
 * @param value - tokens.
 * @returns la cifra compacta.
 */
export function compactTokens(value: number): string {
  const scaled = value / 1_000_000_000
  return `${round(scaled).replace('.', ',')}B`
}

/**
 * Coloca el popover junto a su ancla, en coordenadas de ventana, y lo mantiene
 * dentro de los bordes mientras siga abierto. El chip vive en una barra con
 * recorte, asi que el panel se monta por portal y se mide despues de aparecer:
 * la primera pasada ya lleva `left`/`top`, asi que no hay salto visible.
 * @param options - si esta abierto, el ancla, el panel, y el hueco/margen.
 * @returns la posicion fija del panel, o `null` mientras no haya medida.
 */
function usePopoverPosition({ open, anchor, panel }: {
  open: boolean
  anchor: RefObject<HTMLElement | null>
  panel: RefObject<HTMLElement | null>
}): CSSProperties | null {
  const [position, setPosition] = useState<CSSProperties | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    const place = (): void => {
      const rect = anchor.current?.getBoundingClientRect()
      if (rect === undefined) return
      const size = panel.current
      const width = size?.offsetWidth ?? 0
      const height = size?.offsetHeight ?? 0
      // El chip va a la derecha de la cabecera: el panel se alinea por su borde
      // derecho y cuelga por debajo, que es donde hay sitio.
      let left = rect.right - width
      let top = rect.bottom + POPOVER_GAP
      if (width > 0) left = Math.min(Math.max(left, POPOVER_MARGIN), window.innerWidth - width - POPOVER_MARGIN)
      if (height > 0) top = Math.min(Math.max(top, POPOVER_MARGIN), window.innerHeight - height - POPOVER_MARGIN)
      setPosition({ left, top })
    }
    // La primera pasada mide el panel en el mismo commit que lo abre.
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    const size = panel.current
    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && size !== null) {
      observer = new ResizeObserver(place)
      observer.observe(size)
    }
    return () => {
      observer?.disconnect()
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, anchor, panel])

  return position
}

/**
 * El chip de cuota: una linea con el punto de estado, el cubo, el consumo sobre
 * su tope y el porcentaje. Al hover o al focus abre el detalle completo.
 * @param props - lector de la proyeccion y asiento de locale.
 * @returns el chip con su popover, o nada mientras la proyeccion no este.
 */
export function QuotaCard({ useProjection, t }: QuotaCardProps): ReactNode {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const chipRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const estimate = useProjection('quotaEstimate')
  const position = usePopoverPosition({ open, anchor: chipRef, panel: panelRef })

  // El panel cuelga fuera de la caja del ancla, asi que el puntero tambien
  // puede salir del chip sin querer cerrarlo: un puntero fuera del chip y del
  // panel lo cierra, y el hueco de 6px sigue siendo alcanzable porque el
  // popover se abre al entrar en el.
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent): void => {
      if (event.target instanceof Node
        && rootRef.current?.contains(event.target) !== true
        && panelRef.current?.contains(event.target) !== true) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => { document.removeEventListener('pointerdown', closeOutside) }
  }, [open])

  // Escape cierra y devuelve el foco al chip, que es de donde salio.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setOpen(false)
      chipRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open])

  if (estimate === undefined) return null

  const { bucket, usedTokens, capTokens, status, window: requests } = estimate
  const label = bucket === null ? null : t(BUCKET_KEY[bucket])
  const ratio = capTokens === null || capTokens === 0 ? null : usedTokens / capTokens
  const percent = ratio === null ? null : Math.min(100, Math.max(0, Math.round(ratio * 100)))
  const reading = capTokens === null
    ? compactTokens(usedTokens)
    : `${compactTokens(usedTokens)} / ${compactTokens(capTokens)}`
  const short = bucket === null ? null : SHORT_BUCKET[bucket]
  // El nombre accesible del chip es su propia lectura en voz alta, incluido el
  // estado, que en el chip es solo un punto de color.
  const summary = [
    t(statusKey(status)),
    short,
    reading,
    percent === null ? null : `${percent}%`,
  ].filter((part): part is string => part !== null).join(' · ')

  const chip = (
    <button
      ref={chipRef}
      type="button"
      className={css.chip}
      data-quota-chip=""
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={summary}
      onMouseEnter={() => { setOpen(true) }}
      onMouseLeave={() => { setOpen(false) }}
      onFocus={() => { setOpen(true) }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return
        setOpen(false)
      }}
      onClick={() => { setOpen(current => !current) }}
    >
      <span className={`${css.dot} ${DOT_CLASS[status]}`} aria-hidden="true" />
      {short === null ? null : <span className={css.short}>{short}</span>}
      <span className={css.count}>{reading}</span>
      {percent === null ? null : <span className={css.chipPercent}>{`${percent}%`}</span>}
    </button>
  )

  return (
    <span ref={rootRef} className={css.root} data-quota-status={status}>
      {chip}
      {open && createPortal(
        <div
          ref={panelRef}
          className={css.popover}
          style={position ?? { left: 0, top: 0, visibility: 'hidden' }}
          role="dialog"
          aria-label={t('quota.plan')}
          onMouseEnter={() => { setOpen(true) }}
          onMouseLeave={() => { setOpen(false) }}
        >
          <span className={css.popoverHead}>
            <span className={css.eyebrow}>{t('eyebrow.plan')}</span>
            <span className={css.title}>{label ?? t('quota.plan')}</span>
          </span>
          <span className={css.figures}>
            <span className={css.tokens}>{reading}</span>
            {percent === null ? null : <span className={css.percent}>{`${percent}%`}</span>}
          </span>
          <span className={css.bar}>
            <span className={css.fill} style={{ width: `${percent ?? 0}%` }} />
          </span>
          <span className={css.foot}>
            <span className={`${css.status} ${STATUS_CLASS[status]}`}>{t(statusKey(status))}</span>
            <span className={css.rpm}>{t('quota.rpm', { rpm: requests.rpm, limit: requests.limit })}</span>
          </span>
          <span className={css.notice}>{t('quota.estimate.notice')}</span>
        </div>,
        document.body,
      )}
    </span>
  )
}
