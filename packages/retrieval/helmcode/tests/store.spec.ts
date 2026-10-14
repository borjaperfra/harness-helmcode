import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_WORKSPACE_ID, cosineSimilarity, RetrievalError, RetrievalIndex } from '../src/index.ts'
import type { IndexChunk } from '../src/index.ts'
import { thrownBy } from './doubles.ts'

/** La particion que usan las pruebas que no hablan de workspaces. */
const WS = DEFAULT_WORKSPACE_ID

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
      index.upsertSource(WS, 'docs/a.md', [chunk('alpha', [1, 0]), chunk('beta', [0, 1], 5)])
      index.upsertSource(WS, 'docs/b.md', [chunk('gamma', [1, 1])])

      expect(index.count(WS)).toBe(3)
      expect(index.sources(WS)).toEqual(['docs/a.md', 'docs/b.md'])

      const candidates = index.candidates(WS, [1, 0], 10)
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
      index.upsertSource(WS, 'a', [chunk('uno', [1, 0]), chunk('dos', [0.5, 0.5]), chunk('tres', [0, 1])])
      expect(index.candidates(WS, [1, 0], 2)).toHaveLength(2)
    } finally {
      index.close()
    }
  })

  it('reemplaza los trozos de un documento al reindexarlo', () => {
    const index = new RetrievalIndex(':memory:')
    try {
      index.upsertSource(WS, 'a', [chunk('uno', [1, 0]), chunk('dos', [0, 1]), chunk('tres', [1, 1])])
      expect(index.count(WS)).toBe(3)

      index.upsertSource(WS, 'a', [chunk('uno reescrito', [1, 0])])

      expect(index.count(WS)).toBe(1)
      expect(index.sources(WS)).toEqual(['a'])
      expect(index.candidates(WS, [1, 0], 5)[0]!.text).toBe('uno reescrito')
    } finally {
      index.close()
    }
  })

  it('elimina un documento con todos sus trozos', () => {
    const index = new RetrievalIndex(':memory:')
    try {
      index.upsertSource(WS, 'a', [chunk('uno', [1, 0]), chunk('dos', [0, 1])])
      index.upsertSource(WS, 'b', [chunk('tres', [1, 1])])

      expect(index.removeSource(WS, 'a')).toBe(2)
      expect(index.count(WS)).toBe(1)
      expect(index.sources(WS)).toEqual(['b'])
      expect(index.removeSource(WS, 'no-existe')).toBe(0)
    } finally {
      index.close()
    }
  })

  it('rechaza un vector que no mide lo que el indice', () => {
    const index = new RetrievalIndex(':memory:')
    try {
      index.upsertSource(WS, 'a', [chunk('uno', [1, 0])])
      const error = thrownBy(() => index.candidates(WS, [1, 0, 0], 1))
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
      first.upsertSource(WS, 'docs/a.md', [chunk('alpha', [1, 0]), chunk('beta', [0, 1], 5)])
      first.close()

      const second = new RetrievalIndex(path)
      expect(second.count(WS)).toBe(2)
      expect(second.sources(WS)).toEqual(['docs/a.md'])
      expect(second.candidates(WS, [0, 1], 1)[0]!.text).toBe('beta')
      second.close()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('un indice cerrado se niega a trabajar y cerrarlo dos veces no falla', () => {
    const index = new RetrievalIndex(':memory:')
    index.close()
    index.close()

    // Sin argumento, el recuento mira la particion de las llamadas sin cwd: un
    // indice cerrado se niega igual.
    const error = thrownBy(() => index.count())
    expect(error).toBeInstanceOf(RetrievalError)
    expect(error.code).toBe('CLOSED')
  })

  it('la particion por defecto es la de las llamadas sin cwd', () => {
    const index = new RetrievalIndex(':memory:')
    try {
      index.upsertSource(DEFAULT_WORKSPACE_ID, 'suelta.md', [chunk('sin sesion', [1, 0])])

      expect(index.count()).toBe(1)
      expect(index.sources()).toEqual(['suelta.md'])
      expect(index.candidates(DEFAULT_WORKSPACE_ID, [1, 0], 1)[0]!.text).toBe('sin sesion')
    } finally {
      index.close()
    }
  })
})

describe('RetrievalIndex: aislamiento entre workspaces', () => {
  it('dos workspaces con la MISMA fuente no se pisan', () => {
    const index = new RetrievalIndex(':memory:')
    try {
      // El caso del review: un manual en cada proyecto. Con la clave vieja
      // `(source, position)` el segundo pisaba al primero.
      index.upsertSource('ws-uno', 'manual', [chunk('manual del proyecto uno', [1, 0])])
      index.upsertSource('ws-dos', 'manual', [chunk('manual del proyecto dos', [0, 1])])

      expect(index.count('ws-uno')).toBe(1)
      expect(index.count('ws-dos')).toBe(1)
      expect(index.candidates('ws-uno', [1, 0], 5).map(candidate => candidate.text))
        .toEqual(['manual del proyecto uno'])
      expect(index.candidates('ws-dos', [0, 1], 5).map(candidate => candidate.text))
        .toEqual(['manual del proyecto dos'])
      // La fuente se cita sin la particion: el modelo ve `manual`, no un hash.
      expect(index.sources('ws-uno')).toEqual(['manual'])
    } finally {
      index.close()
    }
  })

  it('reindexar un workspace no borra los trozos del otro', () => {
    const index = new RetrievalIndex(':memory:')
    try {
      index.upsertSource('ws-uno', 'manual', [chunk('viejo uno', [1, 0]), chunk('viejo dos', [0, 1])])
      index.upsertSource('ws-dos', 'manual', [chunk('manual dos', [0, 1])])

      index.upsertSource('ws-uno', 'manual', [chunk('reescrito', [1, 0])])
      expect(index.removeSource('ws-dos', 'manual')).toBe(1)

      expect(index.count('ws-uno')).toBe(1)
      expect(index.candidates('ws-uno', [1, 0], 5)[0]!.text).toBe('reescrito')
      expect(index.count('ws-dos')).toBe(0)
    } finally {
      index.close()
    }
  })

  it('la busqueda de un workspace vacio no ve los trozos del otro', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-retrieval-'))
    const path = join(directory, 'index.sqlite')
    try {
      const first = new RetrievalIndex(path)
      first.upsertSource('ws-uno', 'manual', [chunk('solo del uno', [1, 0])])
      first.close()

      const second = new RetrievalIndex(path)
      expect(second.count('ws-uno')).toBe(1)
      expect(second.count('ws-dos')).toBe(0)
      expect(second.candidates('ws-dos', [1, 0], 5)).toEqual([])
      second.close()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
