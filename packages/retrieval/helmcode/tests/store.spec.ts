import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cosineSimilarity, RetrievalError, RetrievalIndex } from '../src/index.ts'
import type { IndexChunk } from '../src/index.ts'
import { thrownBy } from './doubles.ts'

/** Un trozo con un vector dado. */
function chunk(text: string, embedding: readonly number[], start = 0): IndexChunk {
  return { text, start, end: start + text.length, embedding }
}

describe('cosineSimilarity', () => {
  it('mide el coseno de vectores ortogonales, iguales y opuestos', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0)
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1)
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1)
  })

  it('devuelve cero cuando algun vector no tiene direccion', () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0)
    expect(cosineSimilarity([1, 2], [0, 0])).toBe(0)
  })

  it('rechaza vectores de distinto tamano', () => {
    const error = thrownBy(() => cosineSimilarity([1, 2], [1, 2, 3]))
    expect(error.code).toBe('DIMENSION')
    expect(error.message).toContain('3')
  })
})

describe('RetrievalIndex', () => {
  it('guarda trozos y ordena candidatos por coseno', () => {
    const index = new RetrievalIndex(':memory:')
    try {
      index.upsertSource('docs/a.md', [chunk('alpha', [1, 0]), chunk('beta', [0, 1], 5)])
      index.upsertSource('docs/b.md', [chunk('gamma', [1, 1])])

      expect(index.count()).toBe(3)
      expect(index.sources()).toEqual(['docs/a.md', 'docs/b.md'])

      const candidates = index.candidates([1, 0], 10)
      expect(candidates.map(candidate => candidate.text)).toEqual(['alpha', 'gamma', 'beta'])
      expect(candidates[0]).toEqual({ source: 'docs/a.md', position: 0, text: 'alpha', score: 1 })
      expect(candidates[2]!.score).toBe(0)
      expect(candidates[0]!.score).toBeGreaterThan(candidates[2]!.score)
    } finally {
      index.close()
    }
  })

  it('respeta el limite de candidatos', () => {
    const index = new RetrievalIndex(':memory:')
    try {
      index.upsertSource('a', [chunk('uno', [1, 0]), chunk('dos', [0.5, 0.5]), chunk('tres', [0, 1])])
      expect(index.candidates([1, 0], 2)).toHaveLength(2)
    } finally {
      index.close()
    }
  })

  it('reemplaza los trozos de un documento al reindexarlo', () => {
    const index = new RetrievalIndex(':memory:')
    try {
      index.upsertSource('a', [chunk('uno', [1, 0]), chunk('dos', [0, 1]), chunk('tres', [1, 1])])
      expect(index.count()).toBe(3)

      index.upsertSource('a', [chunk('uno reescrito', [1, 0])])

      expect(index.count()).toBe(1)
      expect(index.sources()).toEqual(['a'])
      expect(index.candidates([1, 0], 5)[0]!.text).toBe('uno reescrito')
    } finally {
      index.close()
    }
  })

  it('elimina un documento con todos sus trozos', () => {
    const index = new RetrievalIndex(':memory:')
    try {
      index.upsertSource('a', [chunk('uno', [1, 0]), chunk('dos', [0, 1])])
      index.upsertSource('b', [chunk('tres', [1, 1])])

      expect(index.removeSource('a')).toBe(2)
      expect(index.count()).toBe(1)
      expect(index.sources()).toEqual(['b'])
      expect(index.removeSource('no-existe')).toBe(0)
    } finally {
      index.close()
    }
  })

  it('rechaza un vector que no mide lo que el indice', () => {
    const index = new RetrievalIndex(':memory:')
    try {
      index.upsertSource('a', [chunk('uno', [1, 0])])
      const error = thrownBy(() => index.candidates([1, 0, 0], 1))
      expect(error.code).toBe('DIMENSION')
      expect(error.message).toContain('"a"')
    } finally {
      index.close()
    }
  })

  it('persiste entre instancias sobre el mismo fichero y se cierra limpiamente', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-retrieval-'))
    const path = join(directory, 'index.sqlite')
    try {
      const first = new RetrievalIndex(path)
      first.upsertSource('docs/a.md', [chunk('alpha', [1, 0]), chunk('beta', [0, 1], 5)])
      first.close()

      const second = new RetrievalIndex(path)
      expect(second.count()).toBe(2)
      expect(second.sources()).toEqual(['docs/a.md'])
      expect(second.candidates([0, 1], 1)[0]!.text).toBe('beta')
      second.close()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('un indice cerrado se niega a trabajar y cerrarlo dos veces no falla', () => {
    const index = new RetrievalIndex(':memory:')
    index.close()
    index.close()

    const error = thrownBy(() => index.count())
    expect(error).toBeInstanceOf(RetrievalError)
    expect(error.code).toBe('CLOSED')
  })
})
