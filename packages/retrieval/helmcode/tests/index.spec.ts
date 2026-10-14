/**
 * Superficie publica del paquete: el nucleo puro reexportado desde `./core.ts`,
 * el cableado (nombre, seams, esquema de configuracion, ruta por defecto y
 * `apply`) y el fallo tipado de las herramientas.
 *
 * El comportamiento de las herramientas se prueba en `wiring.spec.ts`; aqui solo
 * se comprueba que la superficie existe, que el esquema de configuracion es
 * Schemastery nativo (el unico que el validador del loader reconoce) y que un ida
 * y vuelta del nucleo —trocear, ordenar por coseno, reranquear— viaja entero.
 */

import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as retrieval from '../src/index.ts'

describe('@deepseek-ai/dsh-retrieval-helmcode: superficie publica', () => {
  it('reexporta el nucleo puro del corte', () => {
    expect(typeof retrieval.chunkText).toBe('function')
    expect(typeof retrieval.cosineSimilarity).toBe('function')
    expect(typeof retrieval.HelmcodeHttp).toBe('function')
    expect(typeof retrieval.HelmcodeEmbedder).toBe('function')
    expect(typeof retrieval.HelmcodeReranker).toBe('function')
    expect(typeof retrieval.RetrievalIndex).toBe('function')
    expect(typeof retrieval.search).toBe('function')
    expect(retrieval.HELMCODE_EMBEDDING_MODEL).toBe('qwen3-embedding')
    expect(retrieval.EMBEDDING_DIMENSIONS).toBe(4096)
    expect(retrieval.MAX_EMBED_BATCH).toBe(32)
    expect(retrieval.RetrievalError.prototype).toBeInstanceOf(Error)
  })

  it('expone el cableado: plugin, seams, esquema, ruta por defecto y defectos', () => {
    expect(retrieval.name).toBe('retrieval-helmcode')
    expect(retrieval.inject).toEqual(['tools', 'credentials'])
    expect(typeof retrieval.apply).toBe('function')
    expect(retrieval.DEFAULT_API_KEY_REF).toBe('HELMCODE_API_KEY')
    expect(retrieval.DEFAULT_BASE_URL).toBe('https://api.helmcode.com')
    expect(retrieval.DEFAULT_TOP_K).toBe(8)
    expect(retrieval.DEFAULT_TOP_N).toBe(4)
    expect(retrieval.defaultIndexPath(join('home', 'dsh'))).toBe(join('home', 'dsh', 'retrieval', 'index.sqlite'))
  })

  it('valida su configuracion con el esquema del loader', () => {
    // El esquema es Schemastery NATIVO y por eso el validador de config lo
    // reconoce: un `Config` de zod se marcaria `unsupported`. El dict de fuentes
    // se materializa vacio cuando la fila no lo declara.
    expect(retrieval.Config({ topK: 3, topN: 2 })).toEqual({ sources: {}, topK: 3, topN: 2 })
    expect(retrieval.Config({ sources: { nota: 'notas/nota.md' } }))
      .toEqual({ sources: { nota: 'notas/nota.md' } })
    expect(retrieval.Config({ apiKeyRef: 'OTRA_CLAVE' })).toEqual({ sources: {}, apiKeyRef: 'OTRA_CLAVE' })
    expect(() => retrieval.Config({ topK: 'no-es-un-numero' } as never)).toThrow()
  })

  it('el fallo de las herramientas lleva el codigo como identidad estructurada', () => {
    const failure = new retrieval.RetrievalToolError('MISSING_CREDENTIAL', 'sin clave')

    expect(failure).toBeInstanceOf(Error)
    expect(failure.name).toBe('RetrievalToolError')
    expect(failure.code).toBe('MISSING_CREDENTIAL')
    expect(failure.message).toBe('sin clave')
  })

  it('viaja entero contra el indice real: trocear, coseno y rerank', async () => {
    const index = new retrieval.RetrievalIndex(':memory:')
    try {
      const workspace = retrieval.DEFAULT_WORKSPACE_ID
      const chunks = retrieval.chunkText('Una nota con texto suficiente.')
      expect(chunks).toHaveLength(1)
      index.upsertSource(workspace, 'nota', chunks.map(chunk => ({ ...chunk, embedding: [1, 0] })))

      const hits = await retrieval.search(
        { candidates: (vector, limitK) => index.candidates(workspace, vector, limitK) },
        { embed: () => Promise.resolve([[1, 0]]) },
        { rerank: (_query, documents, _topN) => Promise.resolve(documents.map((_text, i) => ({ index: i, score: 1 - i / 10 }))) },
        'nota',
        { topK: 4, topN: 1 },
      )

      expect(hits).toEqual([{ source: 'nota', text: 'Una nota con texto suficiente.', score: 1, index: 0 }])
    } finally {
      index.close()
    }
  })
})
