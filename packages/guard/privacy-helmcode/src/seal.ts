/**
 * Persistencia cifrada del mapa, con fallo cerrado.
 *
 * Formato versionado: `v1:<iv b64>:<tag b64>:<ciphertext b64>`. El cifrado es
 * AES-256-GCM (confidencialidad e integridad en la misma primitiva) y la clave
 * se deriva con scrypt de la contrasena que el cableado le pase.
 *
 * El formato del brief no tiene campo de salt, y scrypt necesita uno: el salt
 * es el PROPIO IV de 16 bytes, que es aleatorio por sellado y viaja en claro en
 * el formato. No se repite entre sellados, que es lo unico que el salt exige.
 *
 * **Fallo cerrado**: `open` no degrada ni devuelve vacio. Si la version no es
 * conocida, si el sobre no tiene cuatro campos o si la etiqueta GCM no valida
 * (contrasena incorrecta o fichero manipulado), lanza {@link SealError} y quien
 * redacta se niega.
 *
 * Nucleo PURO: sin `apply()`, sin `Config`, sin `ctx` y sin herramientas.
 *
 * @module @deepseek-ai/dsh-privacy-helmcode/seal
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

/** La version del formato del sobre. */
export const SEAL_VERSION = 'v1'

/** Los bytes del IV (y, por tanto, del salt de scrypt). */
const IV_BYTES = 16

/** Los bytes de la clave derivada: 32, que es lo que AES-256 exige. */
const KEY_BYTES = 32

/** El numero de campos del sobre sellado. */
const SEAL_FIELDS = 4

/** El sello no se pudo abrir: la clave no es la buena o el fichero no esta intacto. */
export class SealError extends Error {
  /** El codigo estable del fallo. */
  readonly code = 'seal-open-failed'

  /**
   * @param message - que sobre no se pudo abrir.
   */
  constructor(message: string) {
    super(message)
    this.name = 'SealError'
  }
}

/**
 * Deriva la clave de cifrado de la contrasena y el salt.
 *
 * @param password - la contrasena del perfil.
 * @param salt - el salt del sellado (el IV).
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_BYTES)
}

/**
 * Sella un texto en claro y devuelve el sobre versionado.
 *
 * @param plaintext - el contenido a proteger.
 * @param password - la contrasena del perfil.
 * @returns el sobre `v1:<iv b64>:<tag b64>:<ciphertext b64>`.
 */
export function seal(plaintext: string, password: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(password, iv), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${SEAL_VERSION}:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`
}

/**
 * Abre un sobre sellado por {@link seal}.
 *
 * @param sealed - el sobre versionado.
 * @param password - la contrasena del perfil.
 * @returns el texto plano que se sello.
 * @throws SealError si el sobre no tiene la forma, la version no es conocida o
 * la etiqueta de autenticacion no valida.
 */
export function open(sealed: string, password: string): string {
  const fields = sealed.split(':')
  if (fields.length !== SEAL_FIELDS) {
    throw new SealError(`sealed payload must have ${SEAL_FIELDS} fields, got ${fields.length}`)
  }
  const version = fields[0] as string
  if (version !== SEAL_VERSION) throw new SealError(`unsupported seal version ${version}`)
  const iv = Buffer.from(fields[1] as string, 'base64')
  const tag = Buffer.from(fields[2] as string, 'base64')
  const ciphertext = Buffer.from(fields[3] as string, 'base64')
  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(password, iv), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    // Clave incorrecta o ciphertext manipulado: la etiqueta GCM no valida. Se
    // niega en vez de devolver un texto a medias o un vacio que parezca exito.
    throw new SealError('cannot open sealed payload: wrong password or tampered ciphertext')
  }
}
