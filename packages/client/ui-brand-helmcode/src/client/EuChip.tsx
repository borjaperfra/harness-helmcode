/**
 * El chip de residencia de la cabecera de sesion.
 *
 * Dice lo que el DESPLIEGUE garantiza, no donde corre el modelo elegido: el
 * asiento no sabe que modelo hay seleccionado, y la decision de residencia se
 * toma al elegirlo (de eso se encarga la etiqueta del selector). Lo que este
 * chip promete es la POLITICA: mientras la guardia de residencia corra en
 * `eu-only`, toda ruta que no sea europea esta vetada, asi que la sesion no sale
 * de la UE.
 *
 * La politica no se pregunta a una copia del navegador —el modo es configuracion
 * del host y una copia local podria contradecir al veto—: viaja con el catalogo
 * de modelos, que el host sirve desde la MISMA cara de lectura que decide. Si el
 * modo no es `eu-only`, o si la composicion no monta guardia, el chip no
 * renderiza NADA: solo promete lo que la politica garantiza.
 *
 * Es hermano del chip de cuota: misma linea de utilidades, mismo tinte de marca,
 * esquinas a cero.
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { ResidencyPolicy } from '@deepseek-ai/dsh-api-session-controller/types'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './EuChip.module.css'

/** Lo que el chip consume: la politica leida del catalogo servido. */
export interface EuChipProps extends PropsLocale<'helmcode'> {
  /**
   * Lee el modo efectivo de la guardia del despliegue.
   * @returns la politica, o `undefined` cuando el host no la declara.
   */
  residencyPolicy: () => Promise<ResidencyPolicy | undefined>
}

/** El unico modo que respalda la promesa del chip. */
const GUARANTEED: ResidencyPolicy = 'eu-only'

/**
 * El chip `UE` con su punto verde, o nada.
 * @param props - cara de lectura de la politica y asiento de locale.
 * @returns el chip cuando la politica garantiza la residencia europea.
 */
export function EuChip({ residencyPolicy, t }: EuChipProps): ReactNode {
  // `undefined` mientras la lectura esta en vuelo: no se promete nada antes de
  // saberlo, que es el lado honesto del fail-soft.
  const [policy, setPolicy] = useState<ResidencyPolicy | undefined>(undefined)

  useEffect(() => {
    let alive = true
    void residencyPolicy().then(
      (next) => { if (alive) setPolicy(next) },
      () => { if (alive) setPolicy(undefined) },
    )
    return () => { alive = false }
  }, [residencyPolicy])

  if (policy !== GUARANTEED) return null

  return (
    <span
      className={css.chip}
      data-eu-residency=""
      data-residency-policy={policy}
      title={t('residency.chipTitle')}
    >
      <span className={css.dot} aria-hidden="true" />
      <span className={css.label}>{t('residency.chip')}</span>
      <span className={css.check} aria-hidden="true">✓</span>
    </span>
  )
}
