import { describe, expect, it } from 'vitest'
import { HELMCODE_RERANK_MODEL, HelmcodeHttp, HelmcodeReranker } from '../src/index.ts'
import { failureOf, jsonResponse, queuedTransport } from './doubles.ts'
import type { TransportDouble } from './doubles.ts'

/** Un reranker sobre el transporte doble. */
function rerankerOver(transport: TransportDouble): HelmcodeReranker {
  return new HelmcodeReranker(
    new HelmcodeHttp({ baseUrl: 'https://api.helmcode.com', apiKey: 'k', fetch: transport.fetch }),
  )
}

const DOCUMENTS = ['alpha', 'beta', 'gamma']

describe('HelmcodeReranker', () => {
  it('declara el modelo de rerank', () => {
    expect(HELMCODE_RERANK_MODEL).toBe('rerank')
  })

  it('ordena por relevancia descendente conservando el indice original y recorta a topN', async () => {
    const transport = queuedTransport([jsonResponse(200, {
      results: [
        { index: 2, relevance_score: 0.1 },
        { index: 0, relevance_score: 0.9 },
        { index: 1, relevance_score: 0.5 },
      ],
    })])

    const results = await rerankerOver(transport).rerank('consulta', DOCUMENTS, 2)

    expect(results).toEqual([{ index: 0, score: 0.9 }, { index: 1, score: 0.5 }])
    const call = transport.calls[0]!
    expect(call.url).toBe('https://api.helmcode.com/v1/rerank')
    expect(JSON.parse(call.init.body)).toEqual({
      model: 'rerank',
      query: 'consulta',
      documents: DOCUMENTS,
      top_n: 2,
    })
  })

  it('no recorta nada cuando topN cubre todos los resultados', async () => {
    const transport = queuedTransport([jsonResponse(200, {
      results: [{ index: 1, relevance_score: 0.2 }, { index: 0, relevance_score: 0.3 }],
    })])

    const results = await rerankerOver(transport).rerank('consulta', DOCUMENTS, 5)

    expect(results).toEqual([{ index: 0, score: 0.3 }, { index: 1, score: 0.2 }])
  })

  const malformed: ReadonlyArray<readonly [string, unknown]> = [
    ['un cuerpo que no es un objeto', 'solo texto'],
    ['un cuerpo nulo', null],
    ['una respuesta sin results', {}],
    ['results que no es un array', { results: 'nada' }],
    ['un resultado que no es objeto', { results: [42] }],
    ['un indice que no es numero', { results: [{ relevance_score: 0.5 }] }],
    ['un indice negativo', { results: [{ index: -1, relevance_score: 0.5 }] }],
    ['un indice fuera de los documentos enviados', { results: [{ index: 3, relevance_score: 0.5 }] }],
    ['una puntuacion que no es numero', { results: [{ index: 0, relevance_score: 'alta' }] }],
    ['una puntuacion ausente', { results: [{ index: 0 }] }],
  ]

  for (const [name, body] of malformed) {
    it(`rechaza una respuesta malformada: ${name}`, async () => {
      const transport = queuedTransport([jsonResponse(200, body)])
      const error = await failureOf(rerankerOver(transport).rerank('consulta', DOCUMENTS, 3))
      expect(error.code).toBe('MALFORMED')
    })
  }
})
