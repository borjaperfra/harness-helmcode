/**
 * Por que: el indice del primer corte tiene que ser aburrido y honesto. Se usa
 * `node:sqlite` DIRECTO porque es el mismo motor que ya usa
 * `packages/storage/storage-sqlite` (su backend abre `DatabaseSync` sin
 * envoltorio propio), asi que el despliegue no gana una dependencia nativa
 * nueva ni un segundo motor que mantener; y los candidatos se ordenan por
 * similitud coseno CALCULADA EN JS, a fuerza bruta sobre todos los trozos.
 *
 * Eso ultimo es una decision, no un descuido: con el corpus de este corte
 * (documentos del perfil, miles de trozos) el coste es lineal y predecible, y
 * un ANN traeria un indice aproximado —y su recall— antes de que haya datos
 * para medirlo. Cuando los haya, el cambio se hace detras de `candidates()`,
 * que es la unica puerta de entrada a la busqueda.
 *
 * El fichero es PROPIO por ruta de constructor: el cableado le pasa la ruta del
 * perfil y cada indice vive y se cierra solo.
 *
 * @module @deepseek-ai/dsh-retrieval-helmcode/store
 */

import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { RetrievalError } from './errors.ts'
import type { Embedding } from './embed.ts'

/** Un trozo tal como se guarda: texto, posicion original y vector. */
export interface IndexChunk {
  /** El texto del trozo. */
  readonly text: string
  /** Offset del trozo en el documento, para poder citarlo. */
  readonly start: number
  /** Offset exclusivo del final del trozo. */
  readonly end: number
  /** El vector del trozo; su longitud define la dimension del indice. */
  readonly embedding: Embedding
}

/** Un candidato devuelto por {@link RetrievalIndex.candidates}. */
export interface Candidate {
  /** Ruta logica del documento del que salio el trozo. */
  readonly source: string
  /** Orden del trozo dentro de su documento (0 es el primero). */
  readonly position: number
  /** El texto del trozo. */
  readonly text: string
  /** Similitud coseno con el vector consultado, en `[-1, 1]`. */
  readonly score: number
}

/**
 * Columnas de una fila de `chunks` tal como las lee {@link RetrievalIndex}.
 *
 * Es un alias y no una interfaz a proposito: solo un tipo literal recibe la
 * firma de indice implicita que permite afirmar la forma de una fila de SQLite
 * (`Record<string, SQLOutputValue>`) sin pasar por `unknown`.
 */
type ChunkRow = {
  source: string
  position: number
  text: string
  dimensions: number
  embedding: string
}

/** El esquema del indice: un trozo por fila, con su vector serializado. */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS chunks (
    source       TEXT    NOT NULL,
    position     INTEGER NOT NULL,
    start_offset INTEGER NOT NULL,
    end_offset   INTEGER NOT NULL,
    text         TEXT    NOT NULL,
    dimensions   INTEGER NOT NULL,
    embedding    TEXT    NOT NULL,
    PRIMARY KEY (source, position)
  ) STRICT
`

/**
 * Similitud coseno entre dos vectores del mismo tamano.
 *
 * @param left - primer vector.
 * @param right - segundo vector.
 * @returns el coseno en `[-1, 1]`, o 0 si alguno tiene norma cero (un vector
 * nulo no tiene direccion y no se puede ordenar contra ella).
 * @throws {RetrievalError} DIMENSION si los tamanos no coinciden.
 */
export function cosineSimilarity(left: Embedding, right: Embedding): number {
  if (left.length !== right.length) {
    throw new RetrievalError('DIMENSION', `cosine similarity needs equal lengths, got ${left.length} and ${right.length}`)
  }
  let dot = 0
  let leftSquared = 0
  let rightSquared = 0
  for (const [index, value] of left.entries()) {
    // Los tamanos ya coinciden, asi que el indice siempre existe; se afirma en
    // vez de ramificar, que aqui no hay nada que decidir.
    const other = right[index] as number
    dot += value * other
    leftSquared += value * value
    rightSquared += other * other
  }
  if (leftSquared === 0 || rightSquared === 0) return 0
  return dot / Math.sqrt(leftSquared * rightSquared)
}

/**
 * El indice local persistente de trozos: SQLite para el almacen, coseno en JS
 * para el orden.
 */
export class RetrievalIndex {
  private readonly db: DatabaseSync
  private readonly removeSourceStatement: StatementSync
  private readonly insertStatement: StatementSync
  private readonly selectCandidatesStatement: StatementSync
  private readonly countStatement: StatementSync
  private readonly sourcesStatement: StatementSync
  private closed = false

  /**
   * @param path - ruta del fichero del indice; `:memory:` para uno efimero.
   */
  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec(SCHEMA)
    this.removeSourceStatement = this.db.prepare('DELETE FROM chunks WHERE source = ?')
    this.insertStatement = this.db.prepare(
      'INSERT INTO chunks (source, position, start_offset, end_offset, text, dimensions, embedding) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    this.selectCandidatesStatement = this.db.prepare(
      'SELECT source, position, text, dimensions, embedding FROM chunks ORDER BY source, position',
    )
    this.countStatement = this.db.prepare('SELECT COUNT(*) AS total FROM chunks')
    this.sourcesStatement = this.db.prepare('SELECT DISTINCT source FROM chunks ORDER BY source')
  }

  /**
   * Reemplaza los trozos de un documento.
   *
   * Es un reemplazo, no una mezcla: los trozos que no esten en `chunks` dejan de
   * existir, que es lo que hace que reindexar un documento editado no deje
   * versiones viejas compitiendo en la busqueda.
   *
   * @param source - ruta logica del documento.
   * @param chunks - los trozos del documento, en orden.
   */
  upsertSource(source: string, chunks: readonly IndexChunk[]): void {
    this.ensureOpen()
    this.removeSourceStatement.run(source)
    for (const [position, chunk] of chunks.entries()) {
      this.insertStatement.run(
        source,
        position,
        chunk.start,
        chunk.end,
        chunk.text,
        chunk.embedding.length,
        JSON.stringify(chunk.embedding),
      )
    }
  }

  /**
   * Borra un documento y todos sus trozos.
   *
   * @param source - ruta logica del documento.
   * @returns cuantos trozos se borraron.
   */
  removeSource(source: string): number {
    this.ensureOpen()
    return Number(this.removeSourceStatement.run(source).changes)
  }

  /**
   * Los `limitK` trozos mas parecidos al vector, por coseno.
   *
   * @param vector - el vector de la consulta.
   * @param limitK - cuantos candidatos devolver como maximo.
   * @returns los candidatos de mayor a menor similitud (empates en orden de
   * documento y posicion).
   * @throws {RetrievalError} DIMENSION si un trozo guardado no mide lo mismo que
   * el vector consultado.
   */
  candidates(vector: Embedding, limitK: number): Candidate[] {
    this.ensureOpen()
    const rows = this.selectCandidatesStatement.all() as ChunkRow[]
    const scored: Candidate[] = []
    for (const row of rows) {
      if (row.dimensions !== vector.length) {
        throw new RetrievalError(
          'DIMENSION',
          `chunk ${row.position} of "${row.source}" holds ${row.dimensions} dimensions, but the query vector has ${vector.length}`,
        )
      }
      const embedding = JSON.parse(row.embedding) as Embedding
      scored.push({
        source: row.source,
        position: row.position,
        text: row.text,
        score: cosineSimilarity(vector, embedding),
      })
    }
    scored.sort((left, right) => right.score - left.score)
    return scored.slice(0, limitK)
  }

  /**
   * Cuantos trozos guarda el indice.
   *
   * @returns el total de trozos.
   */
  count(): number {
    this.ensureOpen()
    // `COUNT(*)` siempre devuelve una fila, asi que no hay ausencia que tratar.
    const row = this.countStatement.get() as { total: number }
    return row.total
  }

  /**
   * Los documentos indexados, sin repetir y en orden.
   *
   * @returns las rutas logicas de los documentos con al menos un trozo.
   */
  sources(): string[] {
    this.ensureOpen()
    const rows = this.sourcesStatement.all() as Array<{ source: string }>
    return rows.map(row => row.source)
  }

  /**
   * Cierra la base. Es idempotente: cerrar dos veces no falla, para que un
   * desmontaje que corre dos veces no rompa el apagado.
   */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.db.close()
  }

  /** Niega cualquier uso posterior al cierre, con una clase de fallo propia. */
  private ensureOpen(): void {
    if (this.closed) throw new RetrievalError('CLOSED', 'the retrieval index is closed')
  }
}
