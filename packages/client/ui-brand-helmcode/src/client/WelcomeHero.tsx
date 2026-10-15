/**
 * La bienvenida de una sesion nueva.
 *
 * Una sesion recien abierta no tiene transcripcion: lo unico que el operador ve
 * es la cabecera del hero y el hueco del composer. Este ocupante llena ese hueco
 * con la pieza editorial de la marca: el simbolo del kit, la tagline a dos
 * pesos ("Burn tokens, not money."), la propuesta y los cinco modelos que sirve
 * la ruta europea en una linea mono.
 *
 * Vive en el asiento `conversation.hero.body`, que declara ui-conversation y que
 * el skin ocupa como cualquier otra celda de marca: ausente este ocupante, el
 * hueco se queda como estaba.
 *
 * Las cadenas de marca viajan como constantes y no en el diccionario por una
 * decision deliberada: la tagline NO se traduce (es identidad, no copy), y el
 * resto son las mismas en ambos esquemas de locale. La migracion al
 * diccionario, si algun dia hacen falta variantes por locale, es mecanica.
 *
 * Los nombres de los modelos NO se retipan aqui: son las mismas claves que usa
 * el onboarding, que es el unico dueno de ese vocabulario.
 */
import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { HelmcodeLockup } from './Brand.tsx'
import css from './WelcomeHero.module.css'

/**
 * Lo que el ocupante consume: el vocabulario de la marca. El asiento del cuerpo
 * del hero no manda valores de dueno, asi que el componente declara solo el
 * diccionario que necesita.
 */
export type WelcomeHeroProps = PropsLocale<'helmcode'>

/** La tagline de la marca: identidad, no copy. No se traduce. */
const TAGLINE_STRONG = 'Burn tokens,'
const TAGLINE_SOFT = 'not money.'

/** La propuesta, con la formulacion que el dueño fijó ("Zero logs"). */
const VALUE_PROPOSITION = 'Inferencia europea. Tarifa plana. Zero logs.'

/** El simbolo del hero, con la geometria que el host pide. RETIRADO: el asiento
 * de marca del hero upstream se retiro junto con su titular, y la identidad la
 * lleva el lockup del cuerpo. Migrado a HelmcodeLockup. */
export type WelcomeHeroMarkProps = {
  /** Lado cuadrado pedido, en pixeles. */
  size: number
  /** Clase del host que conserva la geometria de la marca. */
  className?: string | undefined
}

/** El nombre completo del producto sobre el lockup: pide sitio por su cuenta. */
const PRODUCT_NAME = 'Helmcode Harness'

/**
 * Render the blank-session welcome surface.
 * @param props - owner share of the hero body seat plus the brand's dictionary.
 * @returns the product name, the brand lockup, the tagline and the proposition.
 */
export function WelcomeHero({ t }: WelcomeHeroProps): ReactNode {
  void t
  return (
    <section className={css.root} data-helmcode-welcome="">
      <p className={css.product}>{PRODUCT_NAME}</p>
      <HelmcodeLockup height={30} className={css.lockup} aria-hidden="true" />
      <p className={css.headline}>
        <strong>{TAGLINE_STRONG}</strong> <span className={css.soft}>{TAGLINE_SOFT}</span>
      </p>
      <p className={css.sub}>{VALUE_PROPOSITION}</p>
    </section>
  )
}
