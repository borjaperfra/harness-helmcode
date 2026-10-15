/**
 * La portada de la cabecera: el lockup de Helmcode en el hueco leading de la
 * cabecera de conversacion, que upstream deja vacio. Aparece en la fase hero
 * (la portada de una sesion nueva) y en cualquier cabecera sin titulo de
 * sesion; con una sesion abierta el titulo manda y el hueco sigue siendo el
 * sitio donde la marca respira.
 *
 * El lockup es el arte del kit a 20px: simbolo indigo + wordmark por
 * currentColor, esquinas a cero, sin caja. No es un boton: es identidad.
 */
import type { ReactNode } from 'react'
import { HelmcodeLockup } from './Brand.tsx'
import css from './HeaderLeading.module.css'

/**
 * Ocupa el hueco leading de la cabecera con el lockup de la marca.
 * @returns el lockup, sin interaccion.
 */
export function HelmcodeHeaderLeading(): ReactNode {
  return (
    <span className={css.root} data-helmcode-header-leading="">
      <HelmcodeLockup height={20} className={css.lockup} />
    </span>
  )
}
