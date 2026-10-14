/**
 * Por que: el pipeline del plan (§6.1) es `embed → busqueda → rerank → LLM`, y
 * este es el trozo que se puede probar entero sin red: embedder y reranker
 * entran como INTERFACES, y el indice como la unica operacion que el pipeline
 * necesita (`candidates`). Con esas tres costuras, los tests inyectan dobles y
 * comprueban el ORDEN de los pasos y la forma del resultado.
 *
 * El orden importa y no es intercambiable: el coseno elige a lo ancho
 * (`topK` candidatos baratos) y el rerank afina dentro de esos candidatos
 * (`topN` resultados); recortar antes del rerank seria tirar documentos que el
 * proveedor habria subido. Por eso `topN` se aplica DESPUES del rerank.
 *
 * @module @deepseek-ai/dsh-retrieval-helmcode/search
 */

import { RetrievalError } from './errors.ts'
import type { Embedder, Embedding } from './embed.ts'
import type { Reranker } from './rerank.ts'
import type { Candidate } from './store.ts'

/**
 * Lo que el pipeline necesita del indice.
 *
 * {@link RetrievalIndex} lo cumple acotado a un workspace: el cableado le pasa
 * una vista (`candidates` con la particion ya fijada), porque el indice de disco
 * es uno por perfil y el pipeline de una busqueda es de un solo workspace. Un
 * doble de test tambien lo cumple tal cual.
 */
export interface CandidateIndex {
  /**
   * Los trozos mas parecidos al vector.
   *
   * @param vector - el vector de la consulta.
   * @param limitK - cuantos candidatos devolver como maximo.
   * @returns los candidatos de mayor a menor similitud.
   */
  candidates(vector: Embedding, limitK: number): Candidate[]
}

/** Los tamanos del pipeline. */
export interface SearchOptions {
  /** Candidatos que se piden al indice por coseno. */
  readonly topK: number
  /** Resultados que se devuelven tras el rerank. */
  readonly topN: number
}

/** Un resultado de busqueda listo para el LLM. */
export interface SearchHit {
  /** Ruta logica del documento de origen. */
  readonly source: string
  /** El texto del trozo. */
  readonly text: string
  /** Puntuacion del rerank. */
  readonly score: number
  /** Indice del candidato dentro de la lista que recibio el rerank. */
  readonly index: number
}

/**
 * Ejecuta `embed → coseno → rerank` y devuelve los `topN` mejores trozos.
 *
 * @param index - el indice local (o un doble) por el que se piden candidatos.
 * @param embedder - el cliente de embeddings (o un doble).
 * @param reranker - el cliente de rerank (o un doble).
 * @param query - la consulta del usuario.
 * @param options - `topK` para el coseno y `topN` para el recorte final.
 * @returns los trozos mas relevantes, ya recortados a `topN`.
 * @throws {RetrievalError} MALFORMED si el embedder no devuelve vector para la
 * consulta o si el reranker nombra un candidato que no se le dio.
 */
export async function search(
  index: CandidateIndex,
  embedder: Embedder,
  reranker: Reranker,
  query: string,
  options: SearchOptions,
): Promise<SearchHit[]> {
  const [queryVector] = await embedder.embed([query])
  if (queryVector === undefined) {
    throw new RetrievalError('MALFORMED', 'the embedder answered no vector for the query')
  }
  const candidates = index.candidates(queryVector, options.topK)
  if (candidates.length === 0) return []
  // El rerank ve los textos, no los vectores: es el proveedor el que puntua, y
  // el indice vuelve en `result.index` para poder reconstruir la fuente.
  const reranked = await reranker.rerank(query, candidates.map(candidate => candidate.text), options.topN)
  return reranked.slice(0, options.topN).map((result) => {
    const candidate = candidates[result.index]
    if (candidate === undefined) {
      throw new RetrievalError('MALFORMED', `the reranker named candidate ${result.index}, which it was not given`)
    }
    return { source: candidate.source, text: candidate.text, score: result.score, index: result.index }
  })
}
