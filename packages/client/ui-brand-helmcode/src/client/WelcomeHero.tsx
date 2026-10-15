/**
 * La bienvenida de una sesion nueva.
 *
 * Una sesion recien abierta no tiene transcripcion: lo unico que el operador ve
 * es la cabecera del hero y el hueco del composer. Este ocupante llena ese hueco
 * con la superficie de la marca — el simbolo del kit, la propuesta de valor y
 * los cuatro modelos que sirve la ruta europea — y NADA mas: es una linea y una
 * lista corta, no una landing.
 *
 * Vive en el asiento `conversation.hero.body`, que declara ui-conversation y que
 * el skin ocupa como cualquier otra celda de marca: ausente este ocupante, el
 * hueco se queda como estaba.
 *
 * Los nombres de los modelos NO se retipan aqui: son las mismas claves que usa
 * el onboarding, que es el unico dueno de ese vocabulario.
 */
import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { HelmcodeSymbol } from './Brand.tsx'
import type { HelmcodeKey } from './locales.ts'
import css from './WelcomeHero.module.css'

/**
 * Lo que el ocupante consume: el vocabulario de la marca. El asiento del cuerpo
 * del hero no manda valores de dueno, asi que el componente declara solo el
 * diccionario que necesita.
 */
export type WelcomeHeroProps = PropsLocale<'helmcode'>
/** El simbolo del hero, con la geometria que el host pide. */
export type WelcomeHeroMarkProps = {
  /** Lado cuadrado pedido, en pixeles. */
  size: number
  /** Clase del host que conserva la geometria de la marca. */
  className?: string | undefined
}

/**
 * Ocupa el asiento de la marca del hero con el simbolo del kit, que es el mismo
 * dibujo que el rail de la barra lateral ya registra en `sidebar.brand.mark`.
 * @param props - lado pedido y clase del host.
 * @returns el hexagono isometrico de la marca.
 */
export function HelmcodeHeroMark({ size, className }: WelcomeHeroMarkProps): ReactNode {
  return <HelmcodeSymbol height={size} className={className} />
}

/**
 * Los cuatro modelos de la ruta europea, por la clave de locale que ya existe:
 * el onboarding es el dueno de esos nombres y aqui solo se muestran.
 */
const EU_MODEL_KEYS = [
  'onboarding.model.helmcode/deepseek-v4-flash',
  'onboarding.model.helmcode/glm5.3-flash',
  'onboarding.model.helmcode/qwen3.6',
  'onboarding.model.helmcode/gemma4',
] as const satisfies readonly HelmcodeKey[]

/**
 * Render the blank-session welcome surface.
 * @param props - owner share of the hero body seat plus the brand's dictionary.
 * @returns the proposition line and the four European models.
 */
export function WelcomeHero({ t }: WelcomeHeroProps): ReactNode {
  return (
    <section className={css.root} data-helmcode-welcome="">
      <p className={css.proposition}>{t('welcome.valueProposition')}</p>
      <p className={css.modelsLead}>{t('welcome.models')}</p>
      <ul className={css.models}>
        {EU_MODEL_KEYS.map(key => <li key={key} className={css.model}>{t(key)}</li>)}
      </ul>
    </section>
  )
}
