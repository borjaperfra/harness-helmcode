/**
 * La cara de LECTURA de la residencia: la misma tabla que decide el veto,
 * expuesta a quien necesita saber DONDE corre una ruta sin decidir nada.
 *
 * El selector de modelos la usa —a traves del catalogo, que el host sirve con la
 * residencia de cada modelo— para pintar la residencia declarada junto al nombre
 * del modelo, porque la decision de residencia se toma al ELEGIR modelo. Este
 * objeto **no veta, no autoriza y no tiene efectos**: el veredicto sigue en el
 * waterfall `llm/stream` ({@link decideModelRoute}) y en
 * `tools/pre-execute` ({@link decideTool}), que son los unicos seams por los que
 * pasa de verdad una llamada.
 *
 * La lectura es la de {@link declaredResidency}: lo que la tabla no declara se
 * lee `'unknown'`, y `'unknown'` no es un valor neutro —en modo `eu-only` es un
 * veto—, asi que una etiqueta `'unknown'` en la interfaz dice exactamente lo que
 * el veto diria.
 *
 * @module @deepseek-ai/dsh-guard-eu-routing/residency
 */

import { declaredResidency, type Residency, type ResidencyMode, type ResidencyTable } from './decisions.ts'

/**
 * El servicio `ctx.guardEuRouting`: lectura de residencia y del modo efectivo
 * para la interfaz y los diagnosticos. No tiene estado y no decide nada.
 */
export interface GuardEuRouting {
  /**
   * El modo EFECTIVO de la guardia (el de la configuracion, o el defecto del
   * paquete cuando el perfil no declara ninguno).
   *
   * Es la POLITICA del despliegue, no la residencia de una ruta: quien promete
   * algo en la interfaz —por ejemplo que una sesion no sale de la UE— tiene que
   * leerla de aqui, porque es el mismo valor que decide el veto. En `eu-only`
   * hay una lista blanca cerrada; en `ask` y `open` el despliegue NO garantiza
   * esa promesa, y quien la pinte tiene que callarse.
   */
  readonly mode: ResidencyMode
  /**
   * Residencia declarada de una ruta de modelo.
   * @param provider - el id del proveedor de la ruta, tal como lo registra el harness.
   * @param model - el id del modelo dentro de ese proveedor.
   * @returns `'eu'`, `'us'`, o `'unknown'` cuando la tabla no declara la ruta.
   */
  residency(provider: string, model: string): Residency
}

/**
 * Construye la cara de lectura sobre una tabla de residencia y el modo efectivo
 * de la guardia.
 *
 * Quien la publique decide QUE tabla y QUE modo lee; el plugin publica los
 * EFECTIVOS (los valores por defecto mas lo que sume la configuracion del
 * perfil), que son los que deciden el veto y los que el host pregunta al servir
 * el catalogo de modelos. No hay cara de navegador: el Loader del navegador crea
 * cada entrada sin configuracion, asi que una copia alli solo podria contradecir
 * al host.
 *
 * @param table - la lista blanca de residencia por `provider/model`.
 * @param mode - el modo efectivo declarado por el despliegue.
 * @returns el objeto que se publica como `ctx.guardEuRouting`.
 */
export function residencyReader(table: ResidencyTable, mode: ResidencyMode): GuardEuRouting {
  return {
    mode,
    residency: (provider, model) => declaredResidency(table, provider, model),
  }
}
