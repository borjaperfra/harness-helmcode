/**
 * Detectores de PII espanola con checksum real.
 *
 * Nucleo PURO: sin `apply()`, sin `Config`, sin `ctx` y sin herramientas. Nada
 * de este fichero conoce el runtime; el cableado vive en `index.ts`.
 *
 * Cada detector que afirma un checksum lo CALCULA aqui: la letra del DNI/NIE se
 * deriva del mod-23 sobre `TRWAGMYFPDXBNJZSQVHLCKE`, el IBAN se valida con el
 * mod-97 de ISO 13616, la tarjeta con el algoritmo de Luhn. Un numero que no
 * valida no es un hallazgo: preferimos perder una coincidencia antes que
 * redactar (o restaurar) un dato que no hemos verificado.
 *
 * Los solapes se resuelven por PRECEDENCIA —IBAN y email por delante de
 * documento, documento por delante de numero desnudo, telefono al final— y, a
 * igualdad de precedencia, por posicion (el candidato que empieza antes, y a
 * igualdad de inicio, el mas largo). `SS`, `CARD` y `PLATE` son numeros
 * desnudos: ceden ante cualquier forma con letra que los contenga.
 *
 * @module @deepseek-ai/dsh-privacy-helmcode/detect
 */

/** Los tipos de dato personal que este corte sabe reconocer. */
export type PiiType =
  | 'DNI'
  | 'NIE'
  | 'IBAN'
  | 'CARD'
  | 'SS'
  | 'TEL'
  | 'EMAIL'
  | 'PLATE'
  | 'RECORD'

/** Un hallazgo: que se encontro, con que valor literal y en que rango de `text`. */
export interface PiiFinding {
  /** El tipo reconocido. */
  readonly type: PiiType
  /** El texto literal tal como aparece en la entrada. */
  readonly value: string
  /** Indice inclusivo del primer caracter del valor. */
  readonly start: number
  /** Indice exclusivo del ultimo caracter del valor. */
  readonly end: number
}

/**
 * Tabla oficial del mod-23 del documento nacional: la letra es
 * `TRWAGMYFPDXBNJZSQVHLCKE[numero % 23]`. Tiene las 23 letras que el modulo
 * necesita (la mencion abreviada del brief no cubre el rango del modulo).
 */
const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE'

/** La precedencia del solape: menor numero gana. */
const PRECEDENCE: Readonly<Record<PiiType, number>> = {
  IBAN: 0,
  EMAIL: 0,
  DNI: 1,
  NIE: 1,
  CARD: 2,
  SS: 2,
  PLATE: 2,
  RECORD: 2,
  TEL: 3,
}

/** Un DNI es 8 digitos mas la letra del mod-23 (`12345678Z`). */
const DNI_PATTERN = /(?<![0-9A-Za-z])(\d{8})([A-Z])(?![0-9A-Za-z])/g

/** Un NIE es X/Y/Z (0/1/2) mas 7 digitos mas la misma letra del mod-23. */
const NIE_PATTERN = /(?<![0-9A-Za-z])([XYZ])(\d{7})([A-Z])(?![0-9A-Za-z])/g

/** Un IBAN espanol son 24 caracteres: `ES` + 2 de control + 20 digitos. */
const IBAN_PATTERN = /(?<![0-9A-Za-z])(ES\d{22})(?![0-9A-Za-z])/g

/** Una tarjeta son 13 a 19 digitos seguidos (el checksum lo pone Luhn). */
const CARD_PATTERN = /(?<![0-9A-Za-z])(\d{13,19})(?![0-9A-Za-z])/g

/** El numero de la Seguridad Social (NUSS) son 12 digitos. */
const SS_PATTERN = /(?<![0-9A-Za-z])(\d{12})(?![0-9A-Za-z])/g

/** Un telefono espanol son 9 digitos: movil 6/7, fijo 8/9. */
const TEL_PATTERN = /(?<![0-9A-Za-z])([6789]\d{8})(?![0-9A-Za-z])/g

/** Un correo electronico corriente, sin espacios. */
const EMAIL_PATTERN = /[0-9A-Za-z._%+-]+@[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*\.[A-Za-z]{2,}/g

/**
 * Una matricula del formato 2000: 4 digitos mas 3 consonantes. El juego de
 * consonantes excluye vocales (para que no se lean palabras) y la Q y la N con
 * tilde, que el formato 2000 no admite.
 */
const PLATE_PATTERN = /(?<![0-9A-Za-z])(\d{4})([BCDFGHJKLMNPRSTVWXYZ]{3})(?![0-9A-Za-z])/g

/** El numero de historia clinica, con su etiqueta `HC-` y 4 a 9 digitos. */
const RECORD_PATTERN = /(?<![0-9A-Za-z])(HC-\d{4,9})(?![0-9A-Za-z])/g

/**
 * Letra del mod-23 de un documento nacional.
 *
 * @param numeric - los digitos (DNI) o los digitos con X/Y/Z ya sustituidos (NIE).
 * @returns la letra que le corresponde.
 */
function documentLetter(numeric: string): string {
  return DNI_LETTERS.charAt(Number(numeric) % 23)
}

/**
 * Valida un DNI comprobando la letra del mod-23. No basta con que la forma
 * encaje: `12345678A` tiene la forma y no es un DNI.
 *
 * @param digits - los 8 digitos.
 * @param letter - la letra declarada.
 */
function dniValid(digits: string, letter: string): boolean {
  return documentLetter(digits) === letter
}

/**
 * Valida un NIE comprobando la letra del mod-23 sobre los digitos con X/Y/Z
 * convertidos a 0/1/2 (la conversion que fija la Orden de 1990).
 */
function nieValid(prefix: string, digits: string, letter: string): boolean {
  const numeric = String('XYZ'.indexOf(prefix)) + digits
  return documentLetter(numeric) === letter
}

/**
 * Valida un IBAN con el mod-97 de ISO 13616: se mueven los 4 primeros
 * caracteres al final, cada letra se expande a su valor (A=10 ... Z=35) y el
 * resto modulo 97 tiene que ser exactamente 1.
 *
 * @param iban - el IBAN completo, ya sin espacios.
 */
function ibanValid(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const character of rearranged) {
    if (character >= '0' && character <= '9') remainder = (remainder * 10 + (character.charCodeAt(0) - 48)) % 97
    else remainder = (remainder * 100 + (character.charCodeAt(0) - 55)) % 97
  }
  return remainder === 1
}

/**
 * Valida una tarjeta con el algoritmo de Luhn: desde la derecha, un digito de
 * cada dos se dobla (restando 9 si pasa de 9) y la suma tiene que ser multiplo
 * de 10.
 *
 * @param digits - los digitos, sin separadores.
 */
function luhnValid(digits: string): boolean {
  let sum = 0
  let doubling = false
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = digits.charCodeAt(index) - 48
    if (doubling) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    doubling = !doubling
  }
  return sum % 10 === 0
}

/**
 * Recorre todos los patrones y devuelve los candidatos que ademas validan su
 * checksum. Los patrones ya exigen fronteras de palabra, asi que un numero
 * dentro de una tirada mas larga de digitos (el cuerpo de un IBAN, por ejemplo)
 * nunca se propone por si solo.
 *
 * @param text - el texto en el que buscar.
 */
function collectCandidates(text: string): PiiFinding[] {
  const candidates: PiiFinding[] = []
  const push = (type: PiiType, value: string, start: number): void => {
    candidates.push({ type, value, start, end: start + value.length })
  }

  for (const match of text.matchAll(IBAN_PATTERN)) {
    if (ibanValid(match[1] as string)) push('IBAN', match[1] as string, match.index)
  }
  for (const match of text.matchAll(EMAIL_PATTERN)) {
    candidates.push({ type: 'EMAIL', value: match[0], start: match.index, end: match.index + match[0].length })
  }
  for (const match of text.matchAll(DNI_PATTERN)) {
    if (dniValid(match[1] as string, match[2] as string)) push('DNI', match[0], match.index)
  }
  for (const match of text.matchAll(NIE_PATTERN)) {
    if (nieValid(match[1] as string, match[2] as string, match[3] as string)) push('NIE', match[0], match.index)
  }
  for (const match of text.matchAll(CARD_PATTERN)) {
    if (luhnValid(match[1] as string)) push('CARD', match[1] as string, match.index)
  }
  for (const match of text.matchAll(SS_PATTERN)) {
    push('SS', match[1] as string, match.index)
  }
  for (const match of text.matchAll(PLATE_PATTERN)) {
    push('PLATE', match[0], match.index)
  }
  for (const match of text.matchAll(RECORD_PATTERN)) {
    push('RECORD', match[1] as string, match.index)
  }
  for (const match of text.matchAll(TEL_PATTERN)) {
    push('TEL', match[1] as string, match.index)
  }
  return candidates
}

/**
 * Detecta la PII del texto y resuelve los solapes.
 *
 * Primero se quedan los candidatos de mayor precedencia y, solo despues, los de
 * precedencia menor que no pisen a los ya aceptados: un telefono dentro de un
 * IBAN no se declara, y una tirada de 12 digitos dentro de una tarjeta tampoco.
 *
 * @param text - el texto a inspeccionar.
 * @returns los hallazgos aceptados, ordenados por posicion.
 */
export function detectPii(text: string): PiiFinding[] {
  const ordered = collectCandidates(text).sort((left, right) =>
    PRECEDENCE[left.type] - PRECEDENCE[right.type]
    || left.start - right.start
    || right.end - left.end)
  const accepted: PiiFinding[] = []
  for (const candidate of ordered) {
    const overlaps = accepted.some(other => candidate.start < other.end && other.start < candidate.end)
    if (!overlaps) accepted.push(candidate)
  }
  return accepted.sort((left, right) => left.start - right.start)
}
