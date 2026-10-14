/**
 * Por que: el coseno sobre embeddings ordena bien pero grueso, y el plan de
 * recuperacion (§6.1) pone un rerank delante del LLM para no gastar contexto en
 * candidatos flojos. La API contesta con `relevance_score` y con el indice
 * ORIGINAL del documento, asi que el trabajo de este modulo es no perder ese
 * indice: reordenar por puntuacion y recortar a `topN` DESPUES del rerank, que
 * es justo lo que no se puede hacer con los candidatos de coseno.
 *
 * @module @deepseek-ai/dsh-retrieval-helmcode/rerank
 */

import { RetrievalError } from './errors.ts'
import type { HelmcodeHttp } from './http.ts'

/** Un documento reranqueado, con su indice original y su puntuacion. */
export interface RerankResult {
  /** Indice del documento en el array que se paso al reranker. */
  readonly index: number
  /** Puntuacion de relevancia del proveedor; mayor es mas relevante. */
  readonly score: number
}

/**
 * El reranker tal como lo ve el pipeline: una interfaz, para que los tests
 * inyecten un doble sin red.
 */
export interface Reranker {
  /**
   * Reordena documentos por relevancia frente a una consulta.
   *
   * @param query - la consulta del usuario.
   * @param documents - los documentos candidatos, en su orden original.
   * @param topN - cuantos resultados devolver como maximo.
   * @returns los documentos mas relevantes, de mayor a menor puntuacion, con el
   * indice que ocupaban en `documents`.
   */
  rerank(query: string, documents: readonly string[], topN: number): Promise<RerankResult[]>
}

/** El modelo de rerank de la API de Helmcode. */
export const HELMCODE_RERANK_MODEL = 'rerank'

/** Ruta del endpoint de rerank. */
const RERANK_PATH = '/v1/rerank'

/** Descarta si el valor es un objeto JSON con campos. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Valida, ordena y recorta la respuesta de `/v1/rerank`.
 *
 * @param raw - el cuerpo JSON del proveedor.
 * @param documentCount - cuantos documentos se enviaron (cota de los indices).
 * @param topN - cuantos resultados se conservan.
 * @returns los resultados de mayor a menor puntuacion.
 * @throws {RetrievalError} MALFORMED si la respuesta no cuadra con los
 * documentos enviados.
 */
function parseRerank(raw: unknown, documentCount: number, topN: number): RerankResult[] {
  const results = isRecord(raw) ? raw.results : undefined
  if (!Array.isArray(results)) {
    throw new RetrievalError('MALFORMED', 'the rerank endpoint answered no results array')
  }
  const parsed: RerankResult[] = []
  for (const entry of results) {
    if (!isRecord(entry)) {
      throw new RetrievalError('MALFORMED', 'the rerank endpoint answered a result that is not a JSON object')
    }
    const index = entry.index
    const score = entry.relevance_score
    if (typeof index !== 'number' || index < 0 || index >= documentCount) {
      throw new RetrievalError('MALFORMED', `the rerank endpoint named an index outside the ${documentCount} documents it was given`)
    }
    if (typeof score !== 'number') {
      throw new RetrievalError('MALFORMED', `the rerank endpoint answered no numeric relevance_score for document ${index}`)
    }
    parsed.push({ index, score })
  }
  parsed.sort((left, right) => right.score - left.score)
  return parsed.slice(0, topN)
}

/**
 * El cliente de rerank de Helmcode.
 */
export class HelmcodeReranker implements Reranker {
  /**
   * @param http - cliente HTTP con el `fetch` inyectado.
   */
  constructor(private readonly http: HelmcodeHttp) {}

  /**
   * Reordena los documentos por relevancia y se queda con `topN`.
   *
   * @param query - la consulta del usuario.
   * @param documents - los documentos candidatos, en su orden original.
   * @param topN - cuantos resultados devolver como maximo.
   * @returns los documentos mas relevantes, con su indice original.
   * @throws {RetrievalError} la clase de fallo que devuelva el cliente HTTP, o
   * MALFORMED si la respuesta no cuadra.
   */
  async rerank(query: string, documents: readonly string[], topN: number): Promise<RerankResult[]> {
    const raw = await this.http.postJson(RERANK_PATH, {
      model: HELMCODE_RERANK_MODEL,
      query,
      documents,
      top_n: topN,
    })
    return parseRerank(raw, documents.length, topN)
  }
}
