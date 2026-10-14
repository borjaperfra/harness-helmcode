/**
 * Detectores de PII espanola con checksum real, sobre los formatos que se
 * escriben DE VERDAD: con puntos, guiones, barras, espacios de grupo y prefijo
 * internacional.
 *
 * Nucleo PURO: sin `apply()`, sin `Config`, sin `ctx` y sin herramientas. Nada
 * de este fichero conoce el runtime; el cableado vive en `index.ts`.
 *
 * La deteccion va en DOS pasos y el orden importa:
 *
 * 1. **Normalizacion previa, de un caracter por otro.** Punto, guion, barra y
 *    espacio duro pasan a ser un espacio simple (el `+` del prefijo y el `:` de
 *    una etiqueta NO son separadores de grupo y se quedan). El texto normalizado
 *    mide EXACTAMENTE lo mismo que el original, asi que un indice hallado sobre
 *    el normalizado sigue apuntando al mismo caracter del original.
 * 2. **Deteccion sobre el texto normalizado**, para que `12.345.678-Z`,
 *    `ES91 2100 ...` o `28/12345678/40` encajen con un solo patron por tipo. El
 *    valor del hallazgo es el literal ORIGINAL recortado con esos indices —lo
 *    que se redacta es lo que estaba escrito, no la forma normalizada— y la
 *    validacion del checksum usa los digitos, ya sin separadores.
 *
 * Solo el correo se busca sobre el texto ORIGINAL: el punto es parte de su
 * forma (`ana.perez@...`) y normalizarlo lo romperia.
 *
 * Cada detector que afirma un checksum lo CALCULA aqui: la letra del DNI/NIE se
 * deriva del mod-23 sobre `TRWAGMYFPDXBNJZSQVHLCKE`, el IBAN se valida con el
 * mod-97 de ISO 13616, la tarjeta con el algoritmo de Luhn y el NUSS con el
 * mod-97 de sus diez primeros digitos. Un numero que no valida no es un
 * hallazgo: preferimos perder una coincidencia antes que redactar (o restaurar)
 * un dato que no hemos verificado.
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

/**
 * Los separadores de grupo que la normalizacion convierte en un espacio simple:
 * el punto (`12.345.678-Z`), el guion (`12345678-Z`), la barra
 * (`28/12345678/40`) y el espacio duro que pegan algunos procesadores de texto.
 */
const GROUP_SEPARATOR_PATTERN = /[.\-/\u00A0]/gu

/**
 * Un DNI son 8 digitos mas la letra del mod-23, con espacio opcional entre los
 * grupos de dos, tres y tres (`12345678Z`, `12345678-Z`, `12.345.678-Z`).
 */
const DNI_PATTERN = /(?<![0-9A-Za-z])(\d{2} ?\d{3} ?\d{3} ?[A-Z])(?![0-9A-Za-z])/g

/** Un NIE es X/Y/Z (0/1/2) mas 7 digitos mas la misma letra del mod-23. */
const NIE_PATTERN = /(?<![0-9A-Za-z])([XYZ] ?\d{7} ?[A-Z])(?![0-9A-Za-z])/g

/**
 * Un IBAN espanol son 24 caracteres: `ES` + 2 de control + 20 digitos. El
 * formato real los agrupa de cuatro en cuatro, y esos espacios son del dato.
 */
const IBAN_PATTERN = /(?<![0-9A-Za-z])(ES\d{2}(?: ?\d{4}){5})(?![0-9A-Za-z])/g

/**
 * Una tarjeta son 13 a 19 digitos, agrupados o no de cuatro en cuatro (el
 * checksum lo pone Luhn y el recuento de digitos se comprueba despues de quitar
 * los espacios, porque este patron tambien encaja con tiradas de 12).
 */
const CARD_PATTERN = /(?<![0-9A-Za-z])(\d{4}(?: ?\d{4}){2,4}(?: ?\d{1,3})?)(?![0-9A-Za-z])/g

/**
 * El numero de la Seguridad Social (NUSS) son 12 digitos en tres grupos: dos de
 * provincia, ocho de numero y dos de control (`281234567840`,
 * `28/12345678/40`).
 */
const SS_PATTERN = /(?<![0-9A-Za-z])(\d{2} ?\d{8} ?\d{2})(?![0-9A-Za-z])/g

/**
 * Un telefono espanol son 9 digitos (movil 6/7, fijo 8/9) con prefijo
 * internacional opcional: `+34`, `0034` y el `34` desnudo, con o sin espacio
 * detras, y con los grupos separados por un espacio.
 */
const TEL_PATTERN = /(?<![0-9A-Za-z])((?:\+?34 ?|0034 ?)?[6789]\d{2} ?\d{3} ?\d{3})(?![0-9A-Za-z])/g

/** Un correo electronico corriente, sin espacios. */
const EMAIL_PATTERN = /[0-9A-Za-z._%+-]+@[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*\.[A-Za-z]{2,}/g

/**
 * Una matricula del formato 2000: 4 digitos mas 3 consonantes. El juego de
 * consonantes excluye vocales (para que no se lean palabras) y la Q y la N con
 * tilde, que el formato 2000 no admite.
 */
const PLATE_PATTERN = /(?<![0-9A-Za-z])(\d{4})([BCDFGHJKLMNPRSTVWXYZ]{3})(?![0-9A-Za-z])/g

/**
 * El numero de historia clinica, con su etiqueta `HC-` (que la normalizacion
 * deja como `HC `) o `NHC` con dos puntos, y 4 a 9 digitos.
 */
const RECORD_PATTERN = /(?<![0-9A-Za-z])((?:NHC|HC)(?: |: ?)\d{4,9})(?![0-9A-Za-z])/g

/**
 * Normaliza los separadores de grupo a un espacio simple, caracter por caracter.
 *
 * La sustitucion es 1:1 a proposito: conserva la longitud, y por eso los indices
 * que se hallen sobre el texto normalizado valen sobre el original.
 *
 * @param text - el texto tal como llego.
 * @returns el mismo texto con punto, guion, barra y espacio duro por espacio.
 */
function normalizeSeparators(text: string): string {
  return text.replace(GROUP_SEPARATOR_PATTERN, ' ')
}

/**
 * Los digitos de un valor, sin separadores ni espacios.
 *
 * @param value - el literal hallado.
 * @returns solo sus digitos.
 */
function digitsOf(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * Los caracteres alfanumericos de un valor, sin separadores ni espacios: es la
 * forma que exigen los checksums del IBAN (que lleva letras) y del documento.
 *
 * @param value - el literal hallado.
 * @returns solo sus letras y digitos.
 */
function alphanumericOf(value: string): string {
  return value.replace(/[^0-9A-Za-z]/g, '')
}

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
 * Valida el digito de control del NUSS: los dos ultimos digitos son el resto
 * modulo 97 de los diez primeros, escrito con dos cifras.
 *
 * @param digits - los 12 digitos, sin separadores.
 */
function socialSecurityValid(digits: string): boolean {
  const control = digits.slice(10)
  return control === String(Number(digits.slice(0, 10)) % 97).padStart(2, '0')
}

/**
 * Recorre todos los patrones y devuelve los candidatos que ademas validan su
 * checksum.
 *
 * Los patrones ya exigen fronteras de palabra, asi que un numero dentro de una
 * tirada mas larga de digitos (el cuerpo de un IBAN, por ejemplo) nunca se
 * propone por si solo. El valor que se guarda es el literal ORIGINAL, no el
 * normalizado: es lo que hay que tapar y lo que el mapa guarda como clave.
 *
 * @param text - el texto en el que buscar.
 */
function collectCandidates(text: string): PiiFinding[] {
  const candidates: PiiFinding[] = []
  const normalized = normalizeSeparators(text)
  const push = (type: PiiType, match: RegExpMatchArray): void => {
    // `matchAll` siempre declara el indice; el tipo lo trae opcional porque la
    // misma interfaz sirve a `exec`, asi que se afirma en vez de ramificar.
    const start = match.index as number
    const end = start + match[0].length
    candidates.push({ type, value: text.slice(start, end), start, end })
  }

  for (const match of normalized.matchAll(IBAN_PATTERN)) {
    if (ibanValid(alphanumericOf(match[1] as string))) push('IBAN', match)
  }
  // El correo se busca sobre el ORIGINAL: sus puntos son parte de la forma.
  for (const match of text.matchAll(EMAIL_PATTERN)) {
    candidates.push({ type: 'EMAIL', value: match[0], start: match.index, end: match.index + match[0].length })
  }
  for (const match of normalized.matchAll(DNI_PATTERN)) {
    const document = alphanumericOf(match[1] as string)
    if (dniValid(document.slice(0, 8), document.slice(8))) push('DNI', match)
  }
  for (const match of normalized.matchAll(NIE_PATTERN)) {
    const document = alphanumericOf(match[1] as string)
    if (nieValid(document.charAt(0), document.slice(1, 8), document.charAt(8))) push('NIE', match)
  }
  for (const match of normalized.matchAll(CARD_PATTERN)) {
    const digits = digitsOf(match[1] as string)
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) push('CARD', match)
  }
  for (const match of normalized.matchAll(SS_PATTERN)) {
    if (socialSecurityValid(digitsOf(match[1] as string))) push('SS', match)
  }
  for (const match of normalized.matchAll(PLATE_PATTERN)) {
    push('PLATE', match)
  }
  for (const match of normalized.matchAll(RECORD_PATTERN)) {
    push('RECORD', match)
  }
  for (const match of normalized.matchAll(TEL_PATTERN)) {
    push('TEL', match)
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
 * @returns los hallazgos aceptados, ordenados por posicion, con el valor
 * literal original (con sus separadores) y los indices sobre `text`.
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
