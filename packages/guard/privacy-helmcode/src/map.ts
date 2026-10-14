/**
 * Mapa determinista de redaccion: valor -> marcador, persistible y con politica
 * de caducidad por entrada.
 *
 * El mapa es la unica fuente de verdad del ida y vuelta. Dos invariantes lo
 * gobiernan:
 *
 * - **Determinismo**: el mismo valor produce SIEMPRE el mismo marcador mientras
 *   viva el mapa (la numeracion se asigna en el primer avistamiento y no se
 *   reutiliza), para que el historial sea coherente entre turnos y la cache del
 *   proveedor siga funcionando.
 * - **Nada silencioso**: lo que no se puede restaurar se declara. `resolve`
 *   NIEGA con un error tipado —{@link UnknownPlaceholderError},
 *   {@link ExpiredEntryError}— en vez de devolver el marcador o inventarse un
 *   valor; `parse` rechaza un documento corrupto con {@link CorruptMapError}.
 *
 * Nucleo PURO: sin `apply()`, sin `Config`, sin `ctx` y sin herramientas.
 *
 * @module @deepseek-ai/dsh-privacy-helmcode/map
 */

import type { PiiType } from './detect.ts'

/** El prefijo del marcador de cada tipo: `[DNI_1]`, `[IBAN_2]`, `[SS_1]`... */
export const PLACEHOLDER_PREFIX: Readonly<Record<PiiType, string>> = {
  DNI: 'DNI',
  NIE: 'NIE',
  IBAN: 'IBAN',
  CARD: 'CARD',
  SS: 'SS',
  TEL: 'TEL',
  EMAIL: 'EMAIL',
  PLATE: 'PLATE',
  RECORD: 'RECORD',
}

/** Los tipos conocidos, en el orden en que se declaran. */
const PII_TYPES: readonly PiiType[] = [
  'DNI',
  'NIE',
  'IBAN',
  'CARD',
  'SS',
  'TEL',
  'EMAIL',
  'PLATE',
  'RECORD',
]

/** La forma de un marcador: `[PREFIJO_digitos]`. */
const PLACEHOLDER_PATTERN = /^\[[A-Z]+_\d+\]$/

/** Una entrada del mapa: que valor se sustituyo, por que marcador y hasta cuando. */
export interface RedactionMapEntry {
  /** El tipo detectado. */
  readonly type: PiiType
  /** El valor original que vive en el mapa. */
  readonly value: string
  /** El marcador que lo sustituye en el texto redactado. */
  readonly placeholder: string
  /** Cuando se acuno la entrada (ISO 8601), si el llamante lo sello. */
  readonly createdAt?: string
  /** Cuando deja de poder restaurarse (ISO 8601), si el llamante lo acoto. */
  readonly expiresAt?: string
}

/** Los sellos temporales opcionales de una entrada nueva. */
export interface AssignOptions {
  /** Marca de creacion de la entrada. */
  readonly createdAt?: Date
  /** Marca a partir de la cual la entrada ya no se restaura. */
  readonly expiresAt?: Date
}

/** El codigo de error de todo lo que este modulo niega. */
export type PrivacyMapErrorCode = 'unknown-placeholder' | 'expired-entry' | 'corrupt-map'

/** Base de los errores tipados del mapa: todo lo negado viaja con su `code`. */
export class PrivacyMapError extends Error {
  /** El codigo estable, para enrutar por el y no por el texto. */
  readonly code: PrivacyMapErrorCode

  /**
   * @param code - el codigo estable del fallo.
   * @param message - el texto legible.
   */
  constructor(code: PrivacyMapErrorCode, message: string) {
    super(message)
    this.name = 'PrivacyMapError'
    this.code = code
  }
}

/** El marcador no esta en el mapa: no se restaura, se declara. */
export class UnknownPlaceholderError extends PrivacyMapError {
  /** El marcador que no se pudo resolver. */
  readonly placeholder: string

  /**
   * @param placeholder - el marcador desconocido.
   */
  constructor(placeholder: string) {
    super('unknown-placeholder', `placeholder ${placeholder} is not in the map`)
    this.name = 'UnknownPlaceholderError'
    this.placeholder = placeholder
  }
}

/** La entrada existe pero caduco: el mapa NIEGA restaurarla. */
export class ExpiredEntryError extends PrivacyMapError {
  /** El marcador de la entrada caducada. */
  readonly placeholder: string
  /** El instante de caducidad declarado (ISO 8601). */
  readonly expiresAt: string

  /**
   * @param placeholder - el marcador caducado.
   * @param expiresAt - su caducidad declarada.
   */
  constructor(placeholder: string, expiresAt: string) {
    super('expired-entry', `placeholder ${placeholder} expired at ${expiresAt}`)
    this.name = 'ExpiredEntryError'
    this.placeholder = placeholder
    this.expiresAt = expiresAt
  }
}

/** El documento del mapa no tiene la forma declarada: no se carga a medias. */
export class CorruptMapError extends PrivacyMapError {
  /**
   * @param detail - que parte del documento no valida.
   */
  constructor(detail: string) {
    super('corrupt-map', `corrupt privacy map: ${detail}`)
    this.name = 'CorruptMapError'
  }
}

/**
 * Compara dos entradas por su marcador, en orden de puntos de codigo, para que
 * la serializacion sea estable y no dependa del idioma de la maquina. Dos
 * entradas nunca comparten marcador (el mapa rechaza duplicados), asi que la
 * comparacion solo necesita decidir cual va antes.
 *
 * @param left - una entrada.
 * @param right - otra entrada.
 */
function comparePlaceholders(left: RedactionMapEntry, right: RedactionMapEntry): number {
  return left.placeholder < right.placeholder ? -1 : 1
}

/**
 * Lee un campo de texto obligatorio.
 *
 * @param record - el objeto candidato.
 * @param key - el nombre del campo.
 */
function readString(record: Record<string, unknown>, key: string): string {
  const raw = record[key]
  if (typeof raw !== 'string') throw new CorruptMapError(`entry field ${key} must be a string`)
  return raw
}

/**
 * Lee un campo de texto opcional.
 *
 * @param record - el objeto candidato.
 * @param key - el nombre del campo.
 */
function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  if (record[key] === undefined) return undefined
  return readString(record, key)
}

/**
 * Lee y valida el tipo declarado de una entrada.
 *
 * @param raw - el valor candidato.
 */
function readType(raw: unknown): PiiType {
  if (typeof raw !== 'string' || !(PII_TYPES as readonly string[]).includes(raw)) {
    throw new CorruptMapError(`entry field type must be one of ${PII_TYPES.join(', ')}`)
  }
  return raw as PiiType
}

/**
 * Valida una entrada cruda del documento y la proyecta a {@link RedactionMapEntry}.
 *
 * @param raw - la entrada tal como vino del JSON.
 */
function readEntry(raw: unknown): RedactionMapEntry {
  if (typeof raw !== 'object' || raw === null) throw new CorruptMapError('entry must be an object')
  const record = raw as Record<string, unknown>
  const type = readType(record['type'])
  const value = readString(record, 'value')
  const placeholder = readString(record, 'placeholder')
  const createdAt = readOptionalString(record, 'createdAt')
  const expiresAt = readOptionalString(record, 'expiresAt')
  return {
    type,
    value,
    placeholder,
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(expiresAt === undefined ? {} : { expiresAt }),
  }
}

/**
 * El indice de un marcador (`[DNI_7]` -> 7), o `undefined` si no tiene la forma.
 *
 * @param placeholder - el marcador a interpretar.
 */
function placeholderIndex(placeholder: string): number | undefined {
  if (!PLACEHOLDER_PATTERN.test(placeholder)) return undefined
  return Number(placeholder.slice(placeholder.lastIndexOf('_') + 1, -1))
}

/**
 * El mapa determinista: valores y marcadores, en las dos direcciones.
 *
 * Se construye vacio y se puebla con {@link RedactionMap.assign}, o se carga
 * entero con {@link RedactionMap.parse} (que reconstruye los contadores para que
 * una entrada nueva no colisione con las ya persistidas).
 */
export class RedactionMap {
  private readonly byValue = new Map<string, RedactionMapEntry>()
  private readonly byPlaceholder = new Map<string, RedactionMapEntry>()
  private readonly counters = new Map<PiiType, number>()

  /**
   * Devuelve el marcador de un valor, acunandolo si es la primera vez que se ve.
   *
   * Un valor ya presente conserva su marcador y sus sellos originales: la
   * opcion nueva no reescribe lo persistido (el mismo valor produce SIEMPRE el
   * mismo marcador).
   *
   * @param type - el tipo detectado del valor.
   * @param value - el valor literal.
   * @param options - sellos temporales opcionales de una entrada nueva.
   * @returns el marcador que sustituye al valor.
   */
  assign(type: PiiType, value: string, options?: AssignOptions): string {
    const existing = this.byValue.get(value)
    if (existing !== undefined) return existing.placeholder
    const next = (this.counters.get(type) ?? 0) + 1
    this.counters.set(type, next)
    const placeholder = `[${PLACEHOLDER_PREFIX[type]}_${next}]`
    const entry: RedactionMapEntry = {
      type,
      value,
      placeholder,
      ...(options?.createdAt === undefined ? {} : { createdAt: options.createdAt.toISOString() }),
      ...(options?.expiresAt === undefined ? {} : { expiresAt: options.expiresAt.toISOString() }),
    }
    this.byValue.set(value, entry)
    this.byPlaceholder.set(placeholder, entry)
    return placeholder
  }

  /**
   * Busca la entrada de un valor.
   *
   * @param value - el valor original.
   * @returns la entrada acunada para ese valor, o `undefined` si no la hay.
   */
  lookup(value: string): RedactionMapEntry | undefined {
    return this.byValue.get(value)
  }

  /**
   * Resuelve un marcador, negando lo que no se puede restaurar.
   *
   * @param placeholder - el marcador a resolver.
   * @param now - el instante contra el que se comprueba la caducidad.
   * @returns la entrada vigente del marcador.
   * @throws UnknownPlaceholderError si el marcador no esta en el mapa.
   * @throws ExpiredEntryError si su caducidad ya paso.
   */
  resolve(placeholder: string, now: Date): RedactionMapEntry {
    const entry = this.byPlaceholder.get(placeholder)
    if (entry === undefined) throw new UnknownPlaceholderError(placeholder)
    const expiresAt = entry.expiresAt
    if (expiresAt !== undefined && Date.parse(expiresAt) <= now.getTime()) {
      throw new ExpiredEntryError(entry.placeholder, expiresAt)
    }
    return entry
  }

  /**
   * Serializa el mapa a JSON estable: entradas ordenadas por marcador y claves
   * siempre en el mismo orden, para que el fichero persistido sea reproducible.
   *
   * @returns el documento JSON del mapa, terminado en salto de linea.
   */
  toJSON(): string {
    const ordered = [...this.byPlaceholder.values()].sort(comparePlaceholders)
    const entries = ordered.map(entry => ({
      type: entry.type,
      value: entry.value,
      placeholder: entry.placeholder,
      ...(entry.createdAt === undefined ? {} : { createdAt: entry.createdAt }),
      ...(entry.expiresAt === undefined ? {} : { expiresAt: entry.expiresAt }),
    }))
    return `${JSON.stringify({ entries }, null, 2)}\n`
  }

  /**
   * Carga un mapa serializado por {@link RedactionMap.toJSON}.
   *
   * @param json - el documento persistido.
   * @returns el mapa con las entradas del documento.
   * @throws CorruptMapError si el documento no tiene la forma declarada.
   */
  static parse(json: string): RedactionMap {
    const map = new RedactionMap()
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      throw new CorruptMapError('document is not valid JSON')
    }
    if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { entries?: unknown }).entries)) {
      throw new CorruptMapError('document must be an object with an entries array')
    }
    const entries = (parsed as { entries: unknown[] }).entries
    for (const raw of entries) {
      const entry = readEntry(raw)
      if (map.byValue.has(entry.value) || map.byPlaceholder.has(entry.placeholder)) {
        throw new CorruptMapError(`duplicate entry ${entry.placeholder}`)
      }
      map.byValue.set(entry.value, entry)
      map.byPlaceholder.set(entry.placeholder, entry)
      const index = placeholderIndex(entry.placeholder)
      if (index !== undefined && index > (map.counters.get(entry.type) ?? 0)) map.counters.set(entry.type, index)
    }
    return map
  }
}
