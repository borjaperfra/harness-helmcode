/**
 * Redaccion y restauracion de texto contra un mapa determinista.
 *
 * `redactText` sustituye cada hallazgo por su marcador; `restoreText` hace el
 * camino de vuelta. La regla que gobierna la vuelta es la de siempre: **nada
 * silencioso**. Un marcador desconocido o caducado NO se restaura y tampoco se
 * borra: se deja tal cual en el texto y se declara en `unresolved`, para que el
 * llamante decida con el dato delante.
 *
 * Nucleo PURO: sin `apply()`, sin `Config`, sin `ctx` y sin herramientas.
 *
 * @module @deepseek-ai/dsh-privacy-helmcode/redact
 */

import { detectPii, type PiiType } from './detect.ts'
import { PrivacyMapError, type RedactionMap } from './map.ts'

/** Un hallazgo redactado: el tipo, su valor original y el marcador que lo tapa. */
export interface RedactionFinding {
  /** El tipo detectado. */
  readonly type: PiiType
  /** El valor original (vive en el mapa, no en el texto que sale). */
  readonly value: string
  /** El marcador que aparece en el texto redactado. */
  readonly placeholder: string
  /** Indice inclusivo del valor original. */
  readonly start: number
  /** Indice exclusivo del valor original. */
  readonly end: number
}

/** El resultado de redactar: el texto con marcadores y lo que se sustituyo. */
export interface RedactResult {
  /** El texto redactado. */
  readonly text: string
  /** Los hallazgos sustituidos, en orden de aparicion. */
  readonly findings: RedactionFinding[]
}

/** El resultado de restaurar: el texto, cuantos marcadores volvieron y cuales no. */
export interface RestoreResult {
  /** El texto con los valores restaurados alli donde se pudo. */
  readonly text: string
  /** Cuantos marcadores se restauraron. */
  readonly restored: number
  /** Los marcadores que NO se restauraron, tal como quedaron en el texto. */
  readonly unresolved: string[]
}

/** La forma de un marcador: `[PREFIJO_digitos]`. */
const MARKER_PATTERN = /\[[A-Z]+_\d+\]/g

/**
 * Redacta el texto: cada valor detectado se cambia por su marcador del mapa.
 *
 * @param text - el texto original.
 * @param map - el mapa donde viven los valores; se puebla con lo que aparezca.
 * @returns el texto redactado y los hallazgos sustituidos.
 */
export function redactText(text: string, map: RedactionMap): RedactResult {
  const parts: string[] = []
  const findings: RedactionFinding[] = []
  let cursor = 0
  for (const detected of detectPii(text)) {
    parts.push(text.slice(cursor, detected.start))
    const placeholder = map.assign(detected.type, detected.value)
    parts.push(placeholder)
    findings.push({
      type: detected.type,
      value: detected.value,
      placeholder,
      start: detected.start,
      end: detected.end,
    })
    cursor = detected.end
  }
  parts.push(text.slice(cursor))
  return { text: parts.join(''), findings }
}

/**
 * Restaura los marcadores que el mapa pueda demostrar.
 *
 * Un marcador desconocido o caducado se queda en el texto y entra en
 * `unresolved`; un texto que no sea un marcador no es asunto de esta funcion y
 * pasa intacto, sin aparecer en `unresolved`.
 *
 * @param text - el texto con marcadores.
 * @param map - el mapa que demuestra los valores.
 * @param now - el instante contra el que se comprueba la caducidad.
 * @returns el texto restaurado, el recuento y los marcadores no resueltos.
 */
export function restoreText(text: string, map: RedactionMap, now: Date = new Date()): RestoreResult {
  const unresolved: string[] = []
  let restored = 0
  const replaced = text.replace(MARKER_PATTERN, (marker) => {
    try {
      const entry = map.resolve(marker, now)
      restored += 1
      return entry.value
    } catch (error) {
      /* v8 ignore next -- `resolve` solo lanza subclases de `PrivacyMapError`; la guardia reenvia lo ajeno */
      if (!(error instanceof PrivacyMapError)) throw error
      unresolved.push(marker)
      return marker
    }
  })
  return { text: replaced, restored, unresolved }
}
