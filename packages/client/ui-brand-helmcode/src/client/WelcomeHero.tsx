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
import { HelmcodeSymbol } from './Brand.tsx'
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
 * Los cinco modelos de la ruta europea, en el orden en que se publican. GLM 5.3
 * va primero: es el add-on que la key del dueño tiene activado y el modelo que
 * usa por defecto. Van como constantes y no por el diccionario porque son
 * nombres propios del catalogo — identicos en es y en, como documentan los
 * tests del onboarding — y la clave del add-on todavia no existe en el
 * vocabulario del onboarding; migrar aqui es anadir esa clave alli.
 */
const EU_MODELS = [
  'GLM 5.3',
  'DeepSeek V4.1 Flash',
  'GLM 5.3 Flash',
  'Qwen 3.6',
  'Gemma 4',
] as const

/** La linea que describe la lista, para el nombre accesible del bloque. */
const MODELS_LEAD = 'Cinco modelos de la ruta europea'

/**
 * Render the blank-session welcome surface.
 * @param props - owner share of the hero body seat plus the brand's dictionary.
 * @returns the brand mark, the tagline, the proposition and the five models.
 */
export function WelcomeHero({ t }: WelcomeHeroProps): ReactNode {
  void t
  return (
    <section className={css.root} data-helmcode-welcome="">
      <HelmcodeSymbol height={32} className={css.mark} aria-hidden="true" />
      <p className={css.headline}>
        <strong>{TAGLINE_STRONG}</strong> <span className={css.soft}>{TAGLINE_SOFT}</span>
      </p>
      <p className={css.sub}>{VALUE_PROPOSITION}</p>
      <p className={css.models} aria-label={MODELS_LEAD}>
        {EU_MODELS.map((model, index) => (
          <span key={model}>
            {index > 0 ? <span className={css.sep} aria-hidden="true"> / </span> : null}
            <b>{model}</b>
          </span>
        ))}
      </p>
    </section>
  )
}
