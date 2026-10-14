/**
 * Por que: un documento entero nunca cabe en el presupuesto de un embedding, y
 * el corte decide que recupera la busqueda despues. Se corta por PARRAFOS
 * —la unidad natural de un documento— y solo se baja a ventanas de caracteres
 * con solape cuando un parrafo no cabe: el solape evita perder una frase
 * partida entre dos trozos, y el suelo minimo evita emitir una cola de tres
 * palabras como si fuera un documento.
 *
 * Es puro: texto entra, trozos con posicion sobre el texto ORIGINAL salen. No
 * conoce ni la red ni el indice, asi que se prueba con cadenas.
 *
 * @module @deepseek-ai/dsh-retrieval-helmcode/chunk
 */

/** Un trozo de texto con su posicion sobre el documento original. */
export interface Chunk {
  /** Identificador estable dentro del documento (`chunk-<orden>`). */
  readonly id: string
  /** El texto del trozo; siempre `text.slice(start, end)`. */
  readonly text: string
  /** Offset del primer caracter del trozo en el texto original. */
  readonly start: number
  /** Offset exclusivo del final del trozo en el texto original. */
  readonly end: number
}

/** Ajustes del troceador; todos tienen valor por defecto. */
export interface ChunkOptions {
  /** Maximo de caracteres por trozo (por defecto 1.600, ≈400 tokens). Debe ser > 0. */
  readonly maxChars?: number | undefined
  /** Solape en caracteres entre ventanas de un mismo parrafo (por defecto 200). */
  readonly overlapChars?: number | undefined
  /** Palabras minimas de un trozo; por debajo, se funde con el anterior (por defecto 4). */
  readonly minWords?: number | undefined
}

/** Maximo por defecto, en caracteres, de un trozo. */
export const DEFAULT_MAX_CHARS = 1600

/** Solape por defecto, en caracteres, entre ventanas de un mismo parrafo. */
export const DEFAULT_OVERLAP_CHARS = 200

/** Suelo por defecto, en palabras, de un trozo. */
export const DEFAULT_MIN_WORDS = 4

/** Un parrafo del texto original, sin el espacio en blanco de los bordes. */
interface Span {
  start: number
  end: number
}

/** Frontera de parrafo: una linea en blanco (con el espacio que sea). */
const PARAGRAPH_BREAK = /\n\s*\n/gu

/** Cuenta palabras como lo haria un lector: bloques separados por espacio. */
function wordCount(text: string): number {
  return text.trim().split(/\s+/u).length
}

/** Anade un parrafo ya recortado, saltando los que son solo espacio. */
function pushSpan(spans: Span[], text: string, from: number, to: number): void {
  const raw = text.slice(from, to)
  const start = from + (raw.length - raw.trimStart().length)
  const end = to - (raw.length - raw.trimEnd().length)
  if (end <= start) return
  spans.push({ start, end })
}

/** Los parrafos del texto, en orden y con sus offsets sobre el original. */
function paragraphSpans(text: string): Span[] {
  const spans: Span[] = []
  let from = 0
  for (let match = PARAGRAPH_BREAK.exec(text); match !== null; match = PARAGRAPH_BREAK.exec(text)) {
    pushSpan(spans, text, from, match.index)
    from = match.index + match[0].length
  }
  pushSpan(spans, text, from, text.length)
  return spans
}

/**
 * Parte un parrafo que no cabe en ventanas de `maxChars` con solape.
 *
 * El avance nunca retrocede (`Math.max`): con un solape mayor o igual que el
 * maximo, el corte seguiria siendo finito en vez de girar sobre el mismo
 * offset para siempre.
 */
function splitOversized(span: Span, maxChars: number, overlapChars: number): Span[] {
  const windows: Span[] = []
  let start = span.start
  while (start < span.end) {
    const end = Math.min(start + maxChars, span.end)
    windows.push({ start, end })
    if (end === span.end) break
    start = Math.max(end - overlapChars, start + 1)
  }
  return windows
}

/**
 * Trocea un texto en parrafos, con ventanas de caracteres para los que no caben.
 *
 * @param text - el documento original.
 * @param options - maximos, solape y suelo; ver {@link ChunkOptions}.
 * @returns los trozos en orden, con offsets sobre `text`; vacio si el texto no
 * tiene contenido utilizable.
 */
export function chunkText(text: string, options: ChunkOptions = {}): Chunk[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS
  const overlapChars = options.overlapChars ?? DEFAULT_OVERLAP_CHARS
  const minWords = options.minWords ?? DEFAULT_MIN_WORDS
  const pieces: Span[] = []
  let pending: Span | undefined
  // Referencia al ultimo trozo comprometido: es lo que permite fundirle una
  // cola corta sin volver a indexar el array (que no comprueba presencia).
  let tail: Span | undefined
  const commit = (span: Span): void => {
    pieces.push(span)
    tail = span
  }

  for (const span of paragraphSpans(text)) {
    if (span.end - span.start > maxChars) {
      if (pending !== undefined) {
        commit(pending)
        pending = undefined
      }
      for (const window of splitOversized(span, maxChars, overlapChars)) commit(window)
      continue
    }
    if (pending === undefined) {
      pending = span
      continue
    }
    if (span.end - pending.start > maxChars) {
      commit(pending)
      pending = span
    } else {
      pending = { start: pending.start, end: span.end }
    }
  }

  if (pending !== undefined) {
    if (tail !== undefined && wordCount(text.slice(pending.start, pending.end)) < minWords) {
      // El suelo se aplica fundiendo, no descartando: la cola corta pertenece
      // al trozo anterior y perderla seria perder contenido del documento.
      tail.end = pending.end
    } else {
      pieces.push(pending)
    }
  }

  return pieces.map((span, index) => ({
    id: `chunk-${index}`,
    text: text.slice(span.start, span.end),
    start: span.start,
    end: span.end,
  }))
}
