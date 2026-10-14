import { describe, expect, it } from 'vitest'
import { HelmcodeHttp } from '../src/index.ts'
import { failureOf, jsonResponse, queuedTransport, textResponse } from './doubles.ts'

/** Un cliente apuntando al transporte doble. */
function client(transport: ReturnType<typeof queuedTransport>, baseUrl = 'https://api.helmcode.com/'): HelmcodeHttp {
  return new HelmcodeHttp({ baseUrl, apiKey: 'k-secreta', fetch: transport.fetch })
}

describe('HelmcodeHttp.postJson', () => {
  it('manda el JSON con la autorizacion y devuelve el cuerpo tal cual', async () => {
    const transport = queuedTransport([jsonResponse(200, { object: 'list', data: [{ index: 0 }] })])
    const body = await client(transport).postJson('/v1/embeddings', { model: 'qwen3-embedding', input: ['uno'] })

    expect(body).toEqual({ object: 'list', data: [{ index: 0 }] })
    expect(transport.calls).toHaveLength(1)
    const call = transport.calls[0]!
    expect(call.url).toBe('https://api.helmcode.com/v1/embeddings')
    expect(call.init.method).toBe('POST')
    expect(call.init.headers.authorization).toBe('Bearer k-secreta')
    expect(call.init.headers['content-type']).toBe('application/json')
    expect(JSON.parse(call.init.body)).toEqual({ model: 'qwen3-embedding', input: ['uno'] })
  })

  it('acepta una raiz sin barra final', async () => {
    const transport = queuedTransport([jsonResponse(200, { ok: true })])
    await client(transport, 'https://api.helmcode.com').postJson('/v1/rerank', {})
    expect(transport.calls[0]!.url).toBe('https://api.helmcode.com/v1/rerank')
  })

  it('traduce el 401 a AUTH', async () => {
    const transport = queuedTransport([textResponse(401, 'invalid api key')])
    const error = await failureOf(client(transport).postJson('/v1/embeddings', {}))
    expect(error.code).toBe('AUTH')
    expect(error.status).toBe(401)
    expect(error.message).toContain('invalid api key')
  })

  it('traduce el 402 a CREDITS', async () => {
    const transport = queuedTransport([textResponse(402, 'no credits')])
    const error = await failureOf(client(transport).postJson('/v1/embeddings', {}))
    expect(error.code).toBe('CREDITS')
    expect(error.status).toBe(402)
  })

  it('traduce el 429 a RATE_LIMIT con el Retry-After en segundos', async () => {
    const transport = queuedTransport([textResponse(429, 'slow down', { 'retry-after': '2.5' })])
    const error = await failureOf(client(transport).postJson('/v1/embeddings', {}))
    expect(error.code).toBe('RATE_LIMIT')
    expect(error.status).toBe(429)
    expect(error.providerRetryAfterMs).toBe(2500)
  })

  it('traduce el Retry-After en fecha HTTP', async () => {
    const seconds = 60
    const later = new Date(Date.now() + seconds * 1000).toUTCString()
    const transport = queuedTransport([textResponse(429, 'slow down', { 'retry-after': later })])
    const error = await failureOf(client(transport).postJson('/v1/embeddings', {}))
    expect(error.providerRetryAfterMs).toBeGreaterThan(seconds * 1000 - 5000)
    expect(error.providerRetryAfterMs).toBeLessThanOrEqual(seconds * 1000)
  })

  it('una fecha de Retry-After ya pasada vale cero, nunca una espera negativa', async () => {
    const transport = queuedTransport([textResponse(429, 'slow down', { 'retry-after': 'Wed, 21 Oct 2015 07:28:00 GMT' })])
    const error = await failureOf(client(transport).postJson('/v1/embeddings', {}))
    expect(error.providerRetryAfterMs).toBe(0)
  })

  it('sin cabecera Retry-After no inventa un intervalo', async () => {
    const transport = queuedTransport([textResponse(429, 'slow down')])
    const error = await failureOf(client(transport).postJson('/v1/embeddings', {}))
    expect(error.providerRetryAfterMs).toBeUndefined()
  })

  it('con la cabecera vacia tampoco', async () => {
    const transport = queuedTransport([textResponse(429, 'slow down', { 'retry-after': '  ' })])
    const error = await failureOf(client(transport).postJson('/v1/embeddings', {}))
    expect(error.providerRetryAfterMs).toBeUndefined()
  })

  it('con una cabecera ilegible tampoco', async () => {
    const transport = queuedTransport([textResponse(429, 'slow down', { 'retry-after': 'en un rato' })])
    const error = await failureOf(client(transport).postJson('/v1/embeddings', {}))
    expect(error.providerRetryAfterMs).toBeUndefined()
  })

  it('traduce el 5xx a PROVIDER', async () => {
    const transport = queuedTransport([textResponse(503, 'gateway down')])
    const error = await failureOf(client(transport).postJson('/v1/embeddings', {}))
    expect(error.code).toBe('PROVIDER')
    expect(error.status).toBe(503)
    expect(error.message).toContain('gateway down')
  })

  it('traduce un estado inesperado a PROVIDER', async () => {
    const transport = queuedTransport([textResponse(404, 'no such endpoint')])
    const error = await failureOf(client(transport).postJson('/v1/embeddings', {}))
    expect(error.code).toBe('PROVIDER')
    expect(error.status).toBe(404)
    expect(error.message).toContain('404')
  })

  it('un 200 con un cuerpo que no es JSON es MALFORMED', async () => {
    const transport = queuedTransport([textResponse(200, 'esto no es json')])
    const error = await failureOf(client(transport).postJson('/v1/embeddings', {}))
    expect(error.code).toBe('MALFORMED')
    expect(error.cause).toBeInstanceOf(Error)
  })
})
