/**
 * Tarjeta de cuota de la sesion: un ESTIMADOR local.
 *
 * El limite de Helmcode es por KEY y por ORGANIZACION, asi que la misma cuota
 * la comparten el IDE del cliente, su pipeline nocturno y cualquier otra cosa
 * que use esa clave. La proyeccion `quotaEstimate` solo ve lo que esta sesion y
 * esta maquina han medido, y por eso la tarjeta se rotula como estimacion: la
 * consola de Helmcode es la unica fuente autoritativa.
 *
 * Solo cuenta rutas helmcode: el consumo que la ruta NaN sirve con los mismos
 * modelos no entra, porque no es cuota de Helmcode.
 */
import type { ReactNode } from 'react'
import type { QuotaEstimateView } from '@deepseek-ai/dsh-quota-helmcode/types'
import type { UseProjection } from '@deepseek-ai/dsh-api-session-controller/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { HelmcodeKey } from '../locales.ts'
import css from '../styles/QuotaCard.module.css'

/** Lo que la tarjeta puede consumir de la proyeccion. */
export interface QuotaCardProps extends PropsLocale<'helmcode'> {
  /** Lector de la proyeccion de la sesion. */
  useProjection: UseProjection
}

/** Los tres estados del cubo, con su clase de color. */
const STATUS_CLASS: Readonly<Record<QuotaEstimateView['status'], string>> = {
  ok: css.stateOk,
  low: css.stateLow,
  exhausted: css.stateExhausted,
}

/** La clave de locale de cada cubo. */
const BUCKET_KEY = {
  sota: 'quota.bucket.sota',
  addon: 'quota.bucket.addon',
  unlimited: 'quota.bucket.unlimited',
} as const

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
 * La tarjeta de cuota: el cubo de mayor consumo, la tasa de peticiones de la
 * ventana, el estado, y el aviso de que todo esto es una estimacion.
 * @param props - lector de la proyeccion y asiento de locale.
 * @returns la tarjeta, o nada mientras la proyeccion no este disponible.
 */
export function QuotaCard({ useProjection, t }: QuotaCardProps): ReactNode {
  const estimate = useProjection('quotaEstimate')
  if (estimate === undefined) return null

  const { bucket, usedTokens, capTokens, status, window: requests } = estimate
  const label = bucket === null ? null : t(BUCKET_KEY[bucket])
  const ratio = capTokens === null || capTokens === 0 ? null : usedTokens / capTokens
  const percent = ratio === null ? null : Math.min(100, Math.max(0, Math.round(ratio * 100)))
  const reading = capTokens === null
    ? compactTokens(usedTokens)
    : `${compactTokens(usedTokens)} / ${compactTokens(capTokens)}`

  return (
    <div className={css.card} data-quota-status={status}>
      <span className={css.eyebrow}>{t('eyebrow.plan')}</span>
      <span className={css.title}>{t('quota.plan')}</span>
      <span className={css.figures}>
        {label === null ? null : <span className={css.bucket}>{label}</span>}
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
    </div>
  )
}
