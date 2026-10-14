import { describe, expect, it } from 'vitest'
import { RetrievalIndex, search } from '../src/index.ts'
import type { Candidate, CandidateIndex, Embedder, Reranker, SearchHit } from '../src/index.ts'
import { failureOf } from './doubles.ts'

/** Un embedder doble que registra su paso y devuelve el vector dado. */
function embedderDouble(vector: readonly number[], order: string[]): Embedder {
  return {
    embed: (texts) => {
      order.push('embed')
      expect(texts).toEqual(['consulta'])
      return Promise.resolve([vector])
    },
  }
}

/** Un indice doble que registra su paso y devuelve los candidatos dados. */
function indexDouble(candidates: readonly Candidate[], order: string[]): CandidateIndex {
  return {
    candidates: (vector, limitK) => {
      order.push('candidates')
      expect(vector).toEqual([1, 0])
      expect(limitK).toBe(3)
      return [...candidates]
    },
  }
}

/** Un reranker doble que registra su paso y devuelve los resultados dados. */
function rerankerDouble(
  results: ReadonlyArray<{ index: number; score: number }>,
  order: string[],
  topN = 2,
  documents: readonly string[] = ['alpha', 'beta'],
): Reranker {
  return {
    rerank: (query, docs, limit) => {
      order.push('rerank')
      expect(query).toBe('consulta')
      expect(docs).toEqual(documents)
      expect(limit).toBe(topN)
      return Promise.resolve([...results])
    },
  }
}

const CANDIDATES: readonly Candidate[] = [
  { source: 'docs/a.md', position: 0, text: 'alpha', score: 1 },
  { source: 'docs/b.md', position: 1, text: 'beta', score: 0 },
]

describe('search', () => {
  it('ejecuta embed, coseno y rerank en ese orden y devuelve fuente y puntuacion', async () => {
    const order: string[] = []
    const hits = await search(
      indexDouble(CANDIDATES, order),
      embedderDouble([1, 0], order),
      rerankerDouble([{ index: 1, score: 0.8 }, { index: 0, score: 0.2 }], order),
      'consulta',
      { topK: 3, topN: 2 },
    )

    expect(order).toEqual(['embed', 'candidates', 'rerank'])
    expect(hits).toEqual([
      { source: 'docs/b.md', text: 'beta', score: 0.8, index: 1 },
      { source: 'docs/a.md', text: 'alpha', score: 0.2, index: 0 },
    ])
  })

  it('recorta a topN despues del rerank, no antes', async () => {
    const order: string[] = []
    const hits = await search(
      indexDouble(CANDIDATES, order),
      embedderDouble([1, 0], order),
      rerankerDouble([{ index: 1, score: 0.9 }, { index: 0, score: 0.4 }], order, 1, ['alpha', 'beta']),
      'consulta',
      { topK: 3, topN: 1 },
    )

    // El reranker vio los dos candidatos y el recorte vino despues.
    expect(order).toEqual(['embed', 'candidates', 'rerank'])
    expect(hits).toHaveLength(1)
    expect(hits[0]!.text).toBe('beta')
  })

  it('sin candidatos no llama al reranker', async () => {
    const order: string[] = []
    const hits = await search(
      indexDouble([], order),
      embedderDouble([1, 0], order),
      rerankerDouble([], order),
      'consulta',
      { topK: 3, topN: 2 },
    )

    expect(hits).toEqual([])
    expect(order).toEqual(['embed', 'candidates'])
  })

  it('rechaza un embedder que no devuelve vector para la consulta', async () => {
    const order: string[] = []
    const embedder: Embedder = { embed: () => Promise.resolve([]) }
    const error = await failureOf(search(indexDouble(CANDIDATES, order), embedder, rerankerDouble([], order), 'consulta', { topK: 3, topN: 2 }))

    expect(error.code).toBe('MALFORMED')
    expect(error.message).toContain('no vector')
  })

  it('rechaza un reranker que nombra un candidato que no recibio', async () => {
    const order: string[] = []
    const error = await failureOf(search(
      indexDouble(CANDIDATES, order),
      embedderDouble([1, 0], order),
      rerankerDouble([{ index: 9, score: 1 }], order),
      'consulta',
      { topK: 3, topN: 2 },
    ))

    expect(error.code).toBe('MALFORMED')
    expect(error.message).toContain('candidate 9')
  })

  it('funciona contra el indice real: el coseno elige, el rerank ordena', async () => {
    const index = new RetrievalIndex(':memory:')
    try {
      index.upsertSource('docs/a.md', [{ text: 'alpha', start: 0, end: 5, embedding: [1, 0] }])
      index.upsertSource('docs/b.md', [{ text: 'beta', start: 0, end: 4, embedding: [0, 1] }])
      const embedder: Embedder = { embed: () => Promise.resolve([[1, 0]]) }
      const reranker: Reranker = {
        rerank: (_query, documents, _topN) => {
          // El proveedor puntua al reves de lo que dice el coseno.
          expect(documents).toEqual(['alpha', 'beta'])
          return Promise.resolve([{ index: 1, score: 0.9 }, { index: 0, score: 0.1 }])
        },
      }

      const hits: SearchHit[] = await search(index, embedder, reranker, 'consulta', { topK: 3, topN: 2 })

      expect(hits).toEqual([
        { source: 'docs/b.md', text: 'beta', score: 0.9, index: 1 },
        { source: 'docs/a.md', text: 'alpha', score: 0.1, index: 0 },
      ])
    } finally {
      index.close()
    }
  })
})
