/**
 * El identificador del workspace con el que el indice particiona sus trozos.
 *
 * Por que existe: un indice es un fichero por perfil, y dos proyectos abiertos
 * con el perfil comparten ese fichero. Con la clave `(source, position)` a
 * secas, una fuente llamada `manual` en un proyecto pisaba el `manual` del otro
 * —reindexar uno borraba los embeddings del otro— y una busqueda podia citar
 * trozos de un workspace que el modelo no habia abierto.
 *
 * La particion es el HASH del cwd de la sesion, no la ruta: el hash es corto,
 * estable y no filtra la ruta del cliente en la clave. La ruta se hacha tal como
 * la declara la sesion; una llamada sin cwd cae en su propia particion (el hash
 * del vacio), que es un workspace mas y no "ninguno".
 *
 * @module @deepseek-ai/dsh-retrieval-helmcode/workspace
 */

import { createHash } from 'node:crypto'

/** Cuantos caracteres hexadecimales del hash forman el identificador. */
const WORKSPACE_ID_LENGTH = 16

/**
 * El identificador de particion de un cwd.
 *
 * @param cwd - el cwd de la sesion, o `undefined` cuando la llamada no trae una.
 * @returns el hash hexadecimal que particiona el indice.
 */
export function workspaceIdOf(cwd: string | undefined): string {
  return createHash('sha256').update(cwd ?? '').digest('hex').slice(0, WORKSPACE_ID_LENGTH)
}

/** La particion de una llamada sin cwd: un workspace propio, no "ninguno". */
export const DEFAULT_WORKSPACE_ID = workspaceIdOf(undefined)
