import { describe, expect, it } from 'vitest'
import {
  EMBEDDING_DIMENSIONS,
  HELMCODE_EMBEDDING_MODEL,
  HelmcodeEmbedder,
  HelmcodeHttp,
  MAX_EMBED_BATCH,
} from '../src/index.ts'
import type { FetchLike, HelmcodeEmbedderOptions } from '../src/index.ts'
import { clockDouble, failureOf, jsonResponse, queuedTransport, textResponse, type TransportDouble } from './doubles.ts'

/** Un vector unitario con el 1 en `position`: identifica de que entrada salio. */
function unitVector(position: number): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0)
  vector[position] = 1
  return vector
}

/** El cuerpo de `/v1/embeddings` para los indices dados, en ese orden. */
function embeddingBody(indices: readonly number[]): unknown {
  return { object: 'list', data: indices.map(index => ({ object: 'embedding', index, embedding: unitVector(index) })) }
}

/** Los indices de 0 a `count - 1`. */
function range(count: number): number[] {
  return Array.from({ length: count }, (_value, index) => index)
}

/** Un embedder sobre el transporte doble, con reloj y espera dobles. */
function embedderOver(
  transport: TransportDouble,
  clock = clockDouble(),
  overrides: Partial<HelmcodeEmbedderOptions> = {},
): HelmcodeEmbedder {
  return new HelmcodeEmbedder({
    http: new HelmcodeHttp({ baseUrl: 'https://api.helmcode.com', apiKey: 'k', fetch: transport.fetch }),
    now: clock.now,
    sleep: clock.sleep,
    ...overrides,
  })
}

describe('HelmcodeEmbedder', () => {
  it('declara el modelo, las dimensiones y el lote de la API', () => {
    expect(HELMCODE_EMBEDDING_MODEL).toBe('qwen3-embedding')
    expect(EMBEDDING_DIMENSIONS).toBe(4096)
    expect(MAX_EMBED_BATCH).toBe(32)
  })

  it('parte 70 textos en lotes de 32 y los pide espaciados', async () => {
    const clock = clockDouble()
    const transport = queuedTransport([
      jsonResponse(200, embeddingBody(range(32))),
      jsonResponse(200, embeddingBody(range(32))),
      jsonResponse(200, embeddingBody(range(6))),
    ])
    const embedder = embedderOver(transport, clock)
    const texts = Array.from({ length: 70 }, (_value, index) => `texto ${index}`)

    const embeddings = await embedder.embed(texts)

    expect(embeddings).toHaveLength(70)
    expect(transport.calls).toHaveLength(3)
    const inputs = transport.calls.map(call => (JSON.parse(call.init.body) as { input: string[] }).input)
    expect(inputs.map(input => input.length)).toEqual([32, 32, 6])
    expect(inputs[0]![0]).toBe('texto 0')
    expect(inputs[2]![5]).toBe('texto 69')
    expect(JSON.parse(transport.calls[0]!.init.body)).toMatchObject({ model: 'qwen3-embedding' })
    expect(transport.calls[0]!.url).toBe('https://api.helmcode.com/v1/embeddings')
    // 60 rpm documentados: el cliente espacia sus propias peticiones.
    expect(clock.sleeps).toEqual([1000, 1000])
  })

  it('restaura el orden por data[].index aunque la respuesta venga desordenada', async () => {
    const transport = queuedTransport([
      jsonResponse(200, { data: [{ index: 1, embedding: unitVector(1) }, { index: 0, embedding: unitVector(0) }] }),
    ])
    const embeddings = await embedderOver(transport, clockDouble(), { batchSize: 2 }).embed(['a', 'b'])

    expect(embeddings[0]![0]).toBe(1)
    expect(embeddings[1]![1]).toBe(1)
  })

  it('usa el reloj y la espera reales cuando nadie los inyecta', async () => {
    const transport = queuedTransport([jsonResponse(200, embeddingBody([0])), jsonResponse(200, embeddingBody([0]))])
    const embedder = new HelmcodeEmbedder({
      http: new HelmcodeHttp({ baseUrl: 'https://api.helmcode.com', apiKey: 'k', fetch: transport.fetch }),
      batchSize: 1,
      // Un intervalo corto de verdad: el espaciado real se ejerce sin que la
      // suite dependa de un reloj inyectado.
      minIntervalMs: 100,
    })

    await expect(embedder.embed(['uno', 'dos'])).resolves.toHaveLength(2)
    expect(transport.calls).toHaveLength(2)
  })

  const malformed: ReadonlyArray<readonly [string, unknown, number]> = [
    ['un cuerpo que no es un objeto', 'solo texto', 1],
    ['un cuerpo nulo', null, 1],
    ['menos entradas de las pedidas', { data: [] }, 1],
    ['mas entradas de las pedidas', { data: [{ index: 0, embedding: unitVector(0) }, { index: 1, embedding: unitVector(1) }] }, 1],
    ['una entrada que no es objeto', { data: [42] }, 1],
    ['un indice que no es numero', { data: [{ embedding: unitVector(0) }] }, 1],
    ['un indice negativo', { data: [{ index: -1, embedding: unitVector(0) }] }, 1],
    ['un indice fuera del lote', { data: [{ index: 3, embedding: unitVector(0) }] }, 1],
    ['un embedding que no es vector', { data: [{ index: 0, embedding: 'nope' }] }, 1],
    ['un embedding de otra dimension', { data: [{ index: 0, embedding: [1, 2, 3] }] }, 1],
    ['un embedding con un valor no numerico', { data: [{ index: 0, embedding: withStringAtStart() }] }, 1],
    ['un indice repetido', { data: [{ index: 0, embedding: unitVector(0) }, { index: 0, embedding: unitVector(0) }] }, 2],
  ]

  for (const [name, body, inputs] of malformed) {
    it(`rechaza una respuesta malformada: ${name}`, async () => {
      const transport = queuedTransport([jsonResponse(200, body)])
      const embedder = embedderOver(transport, clockDouble(), { minIntervalMs: 0 })
      const error = await failureOf(embedder.embed(range(inputs).map(index => `texto ${index}`)))
      expect(error.code).toBe('MALFORMED')
    })
  }

  it('reintenta el 429 con el Retry-After que declara el proveedor', async () => {
    const clock = clockDouble()
    const transport = queuedTransport([
      textResponse(429, 'slow down', { 'retry-after': '2' }),
      jsonResponse(200, embeddingBody([0])),
    ])
    const embedder = embedderOver(transport, clock, { minIntervalMs: 0 })

    const embeddings = await embedder.embed(['uno'])

    expect(embeddings).toHaveLength(1)
    expect(transport.calls).toHaveLength(2)
    expect(clock.sleeps).toEqual([2000])
  })

  it('sin Retry-After legible el reintento espera el intervalo minimo propio', async () => {
    const clock = clockDouble()
    const transport = queuedTransport([textResponse(429, 'slow down'), jsonResponse(200, embeddingBody([0]))])
    const embedder = embedderOver(transport, clock, { minIntervalMs: 1000 })

    await embedder.embed(['uno'])

    expect(transport.calls).toHaveLength(2)
    expect(clock.sleeps).toEqual([1000])
  })

  it('deja de reintentar tras tres reintentos y devuelve el error tipado', async () => {
    const clock = clockDouble()
    const transport = queuedTransport([textResponse(429, 'slow down', { 'retry-after': '0' })])
    const embedder = embedderOver(transport, clock, { minIntervalMs: 0 })

    const error = await failureOf(embedder.embed(['uno']))

    expect(error.code).toBe('RATE_LIMIT')
    expect(error.providerRetryAfterMs).toBe(0)
    // La peticion inicial mas tres reintentos: el limite es de reintentos.
    expect(transport.calls).toHaveLength(4)
    expect(clock.sleeps).toEqual([0, 0, 0])
  })

  it('sin reintentos configurados falla al primer 429', async () => {
    const transport = queuedTransport([textResponse(429, 'slow down', { 'retry-after': '1' })])
    const embedder = embedderOver(transport, clockDouble(), { minIntervalMs: 0, maxRetries: 0 })

    const error = await failureOf(embedder.embed(['uno']))

    expect(error.code).toBe('RATE_LIMIT')
    expect(transport.calls).toHaveLength(1)
  })

  it('no reintenta un fallo que no es 429', async () => {
    const transport = queuedTransport([textResponse(401, 'invalid api key')])
    const embedder = embedderOver(transport, clockDouble(), { minIntervalMs: 0 })

    const error = await failureOf(embedder.embed(['uno']))

    expect(error.code).toBe('AUTH')
    expect(transport.calls).toHaveLength(1)
  })

  it('convierte un rechazo que no es Error en un Error', async () => {
    // El contrato del transporte es rechazar con Error; un doble que rechace
    // otra cosa no puede escapar como valor raro hacia arriba.
    const fetch: FetchLike = async () => {
      throw 'sin error de verdad'
    }
    const embedder = new HelmcodeEmbedder({
      http: new HelmcodeHttp({ baseUrl: 'https://api.helmcode.com', apiKey: 'k', fetch }),
      minIntervalMs: 0,
      sleep: () => Promise.resolve(),
    })

    const error = await embedder.embed(['uno']).then(
      () => undefined,
      (reason: unknown) => reason,
    )

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('non-Error')
  })
})

/** Un vector de 4096 posiciones con un valor no numerico en la primera. */
function withStringAtStart(): unknown[] {
  const vector: unknown[] = new Array<unknown>(EMBEDDING_DIMENSIONS).fill(0)
  vector[0] = 'cero'
  return vector
}
