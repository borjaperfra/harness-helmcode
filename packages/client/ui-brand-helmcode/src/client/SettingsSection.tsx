/**
 * La seccion de Ajustes de Helmcode: los hechos del DESPLIEGUE, en un sitio.
 *
 * Cuatro lineas, todas de SOLO LECTURA:
 *
 *  1. si la clave de API del bundle resuelve (nunca su valor: el secreto no
 *     cruza al navegador, solo su estado `configured`);
 *  2. el plan y la cuota que la tabla de Helmcode asume, con los topes
 *     publicados —la verdad del consumo sigue estando en la consola—;
 *  3. la politica de residencia del despliegue, tal como la resuelve la guardia;
 *  4. la retencion declarada del mapa de anonimizacion.
 *
 * Esta seccion NO escribe nada: la clave la escribe el onboarding, y el plan y
 * las politicas los declara el perfil. Lo que muestra son hechos que el host
 * sirve —el catalogo de modelos, el credential store— y, en cada fila, donde se
 * cambian.
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { ResidencyPolicy } from '@deepseek-ai/dsh-api-session-controller/types'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { HelmcodeKey } from './locales.ts'
import css from './SettingsSection.module.css'

/**
 * Los hechos que la seccion lee. Todo async porque todo cruza al host: el estado
 * de la credencial, la politica (que viaja con el catalogo de modelos) y la
 * retencion declarada.
 */
export interface HelmcodeSettingsFacts {
  /**
   * Si la credencial `HELMCODE_API_KEY` esta configurada.
   * @returns `true` cuando el credential store la tiene; nunca su valor.
   */
  apiKeyConfigured: () => Promise<boolean>
  /**
   * La politica de residencia del despliegue.
   * @returns el modo efectivo de la guardia, o `undefined` sin guardia montada.
   */
  residencyPolicy: () => Promise<ResidencyPolicy | undefined>
  /**
   * La retencion declarada del mapa de anonimizacion.
   * @returns los dias declarados, `null` cuando el mapa no caduca, o `undefined`
   * cuando la composicion no monta el canal de redaccion.
   */
  redactionTtlDays: () => Promise<number | null | undefined>
}

/**
 * Lo que la seccion consume: el diccionario de la marca y los hechos del host.
 * El asiento le ofrece ademas `close`, que esta pagina no usa: no hay ningun
 * flujo que salga de Ajustes desde aqui.
 */
export type HelmcodeSettingsSectionProps = PropsLocale<'helmcode'> & HelmcodeSettingsFacts

/**
 * El plan asumido y sus topes publicados, como CONSTANTES DE PRESENTACION.
 *
 * Importar valores de la tabla de cuotas desde un bundle de cliente esta
 * prohibido (pureza de bundles: sin imports de valor entre plugins). El plan
 * asumido es una decision del despliegue —el perfil puede declarar otro— y los
 * topes son datos publicados que no cambian en runtime; la verdad del CONSUMO
 * sigue llegando por el wire de la proyeccion (`capTokens`), que es la cifra
 * que no se puede fijar a mano.
 *
 * Procedencia: https://helmcode.com/es/pricing, consultada el 2026-10-13; el
 * paquete de cuota de Helmcode es el dueno de la tabla completa.
 */
const ASSUMED_PLAN = 'growth'
const PLAN_PRICE_EUR_MONTH = 1_299
const PLAN_API_KEYS = 15

/** La clave de locale del modo de la guardia, con el vocabulario de la guardia. */
const POLICY_KEY = {
  'eu-only': 'settings.residency.eu-only',
  ask: 'settings.residency.ask',
  open: 'settings.residency.open',
} as const satisfies Record<ResidencyPolicy, HelmcodeKey>

/** El estado de la lectura de un hecho: en vuelo, resuelto, o fallido. */
type Reading<T> = { phase: 'pending' } | { phase: 'ready'; value: T } | { phase: 'failed' }

/**
 * El texto de una lectura: el valor cuando resolvio, y el estado honesto cuando
 * no. Un fallo se dice —nunca se pinta un valor que nadie pudo leer—.
 * @param state - el estado de la lectura.
 * @param ready - como se escribe el valor resuelto.
 * @param t - traductor de la marca, para los dos estados sin valor.
 * @returns el texto de la fila.
 */
function shown<T>(
  state: Reading<T>,
  ready: (value: T) => string,
  t: PropsLocale<'helmcode'>['t'],
): string {
  if (state.phase === 'pending') return t('settings.reading')
  if (state.phase === 'failed') return t('settings.failed')
  return ready(state.value)
}

/**
 * Lee un hecho del host una vez al montar.
 * @param read - la lectura del hecho.
 * @returns el estado de la lectura.
 */
function useReading<T>(read: () => Promise<T>): Reading<T> {
  const [state, setState] = useState<Reading<T>>({ phase: 'pending' })
  useEffect(() => {
    let alive = true
    void read().then(
      (value) => { if (alive) setState({ phase: 'ready', value }) },
      () => { if (alive) setState({ phase: 'failed' }) },
    )
    return () => { alive = false }
  }, [read])
  return state
}

/**
 * Una fila de la seccion: rotulo a la izquierda, valor y procedencia a la derecha.
 * @param props - rotulo, valor y donde se cambia ese hecho.
 * @returns la fila.
 */
function FactRow({ label, value, note }: { label: string; value: string; note: string }): ReactNode {
  return (
    <div className={css.row}>
      <span className={css.label}>{label}</span>
      <span className={css.value}>
        {value}
        <span className={css.note}>{note}</span>
      </span>
    </div>
  )
}

/**
 * Render the read-only Helmcode facts section.
 * @param props - settings seat, brand dictionary, and the injected host reads.
 * @returns the deployment facts, each with where it is owned.
 */
export function HelmcodeSettingsSection({
  apiKeyConfigured, residencyPolicy, redactionTtlDays, t,
}: HelmcodeSettingsSectionProps): ReactNode {
  const key = useReading(apiKeyConfigured)
  const policy = useReading(residencyPolicy)
  const retention = useReading(redactionTtlDays)

  return (
    <section className={css.root} data-helmcode-settings="">
      <p className={css.intro}>{t('settings.intro')}</p>
      <FactRow
        label={t('settings.apiKey')}
        value={shown(key, configured => t(configured ? 'settings.apiKey.configured' : 'settings.apiKey.missing'), t)}
        note={t('settings.apiKey.where')}
      />
      <FactRow
        label={t('settings.plan')}
        value={t('settings.plan.value', {
          plan: ASSUMED_PLAN,
          price: `${String(PLAN_PRICE_EUR_MONTH)} €/mes`,
          keys: String(PLAN_API_KEYS),
        })}
        note={t('settings.plan.where')}
      />
      <FactRow
        label={t('settings.residency')}
        value={shown(policy, mode => mode === undefined ? t('settings.residency.absent') : t(POLICY_KEY[mode]), t)}
        note={t('settings.residency.where')}
      />
      <FactRow
        label={t('settings.retention')}
        value={shown(
          retention,
          days => days === undefined
            ? t('settings.retention.absent')
            : days === null ? t('settings.retention.never') : t('settings.retention.days', { days }),
          t,
        )}
        note={t('settings.retention.where')}
      />
    </section>
  )
}
