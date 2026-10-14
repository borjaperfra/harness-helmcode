/**
 * El cliente del endpoint de transcripcion: formulario multipart, traduccion de
 * estados y reintento de 429.
 *
 * El transporte es un doble, asi que ninguna prueba abre un socket; la espera
 * del reintento tambien es un doble, asi que ninguna duerme.
 */

import { describe, expect, it } from 'vitest'
import type { AudioSegment } from '../src/chunker.ts'
import { HelmcodeTranscriptionClient, TRANSCRIPTION_PATH } from '../src/client.ts'
import type { HelmcodeTranscriptionClientOptions } from '../src/client.ts'
import { failureOf, jsonResponse, queuedTransport, sleepDouble, textResponse } from './doubles.ts'
import type { TransportDouble } from './doubles.ts'

/** El segmento minimo que el cliente acepta. */
const segment: AudioSegment = { audio: new Uint8Array([1, 2, 3, 4]), seconds: 0.1 }

/** El arnes: el cliente con el transporte doble y la espera doble a la vista. */
function client(transport: TransportDouble, overrides: Partial<HelmcodeTranscriptionClientOptions> = {}) {
  const sleep = sleepDouble()
  const instance = new HelmcodeTranscriptionClient({
    baseUrl: 'https://api.helmcode.com/',
    apiKey: 'sk-test',
    fetch: transport.fetch,
    model: 'whisper',
    maxBytes: 1024,
    maxRetries: 2,
    retryDelayMs: 7,
    sleep: sleep.sleep,
    ...overrides,
  })
  return { instance, sleeps: sleep.sleeps }
}

/** El formulario de la primera llamada vista por el doble. */
function formOf(transport: TransportDouble): FormData {
  const body = transport.calls[0]?.init.body
  if (!(body instanceof FormData)) throw new Error('the request did not carry a FormData body')
  return body
}

describe('HelmcodeTranscriptionClient.transcribe', () => {
  it('envia el fichero como multipart con el modelo, el idioma y la autorizacion', async () => {
    const transport = queuedTransport([jsonResponse(200, { text: 'hola' })])
    const { instance } = client(transport)
    await expect(instance.transcribe(segment, 'es', new AbortController().signal)).resolves.toBe('hola')
    expect(transport.calls).toHaveLength(1)
    expect(transport.calls[0]?.url).toBe(`https://api.helmcode.com${TRANSCRIPTION_PATH}`)
    expect(transport.calls[0]?.init).toMatchObject({
      method: 'POST',
      headers: { authorization: 'Bearer sk-test' },
    })
    const form = formOf(transport)
    expect(form.get('model')).toBe('whisper')
    expect(form.get('language')).toBe('es')
    const file = form.get('file')
    expect(file).toBeInstanceOf(File)
    expect((file as File).name).toBe('audio.wav')
    expect(new Uint8Array(await (file as File).arrayBuffer())).toEqual(segment.audio)
  })

  it('omite el idioma cuando se pide deteccion automatica', async () => {
    const transport = queuedTransport([jsonResponse(200, { text: '' })])
    const { instance } = client(transport)
    await expect(instance.transcribe(segment, 'auto', new AbortController().signal)).resolves.toBe('')
    expect(formOf(transport).get('language')).toBeNull()
  })

  it('rechaza un segmento que supera el limite antes de enviar nada', async () => {
    const transport = queuedTransport([jsonResponse(200, { text: 'no deberia llegar' })])
    const { instance } = client(transport, { maxBytes: 2 })
    const failure = await failureOf(instance.transcribe(segment, 'es', new AbortController().signal))
    expect(failure.code).toBe('FILE_TOO_LARGE')
    expect(failure.message).toContain('exceeds the 2-byte limit')
    expect(transport.calls).toEqual([])
  })

  it('no envia nada si la llamada ya venia cancelada', async () => {
    const transport = queuedTransport([jsonResponse(200, { text: 'no deberia llegar' })])
    const { instance } = client(transport)
    await expect(instance.transcribe(segment, 'es', AbortSignal.abort(new Error('cancelled')))).rejects.toThrow('cancelled')
    expect(transport.calls).toEqual([])
  })

  it.each([
    [401, 'AUTH'],
    [413, 'FILE_TOO_LARGE'],
    [500, 'PROVIDER'],
    [503, 'PROVIDER'],
    [400, 'PROVIDER'],
  ])('traduce el estado %i a %s', async (status, code) => {
    const transport = queuedTransport([textResponse(status, 'boom')])
    const { instance } = client(transport)
    const failure = await failureOf(instance.transcribe(segment, 'es', new AbortController().signal))
    expect(failure.code).toBe(code)
    expect(failure.status).toBe(status)
  })

  it.each([
    ['no es JSON', 'no-es-json'],
    ['es null', 'null'],
    ['es una cadena', '"texto"'],
    ['no trae text', '{"otra":"cosa"}'],
    ['trae un text que no es cadena', '{"text":7}'],
  ])('rechaza un 200 cuyo cuerpo %s', async (_reason, body) => {
    const transport = queuedTransport([textResponse(200, body)])
    const { instance } = client(transport)
    expect((await failureOf(instance.transcribe(segment, 'es', new AbortController().signal))).code).toBe('MALFORMED')
  })

  it('propaga un fallo de transporte que no es suyo', async () => {
    const transport = queuedTransport([new Error('socket cerrado')])
    const { instance } = client(transport)
    await expect(instance.transcribe(segment, 'es', new AbortController().signal)).rejects.toThrow('socket cerrado')
  })
})

describe('HelmcodeTranscriptionClient: reintento de 429', () => {
  it('espera el Retry-After que el proveedor declara y repite la peticion', async () => {
    const transport = queuedTransport([
      textResponse(429, 'slow down', { 'retry-after': '2' }),
      jsonResponse(200, { text: 'ya' }),
    ])
    const { instance, sleeps } = client(transport)
    await expect(instance.transcribe(segment, 'es', new AbortController().signal)).resolves.toBe('ya')
    expect(sleeps).toEqual([2000])
    expect(transport.calls).toHaveLength(2)
  })

  it('espera su intervalo por defecto cuando el 429 no declara Retry-After', async () => {
    const transport = queuedTransport([textResponse(429, 'slow down'), jsonResponse(200, { text: 'ya' })])
    const { instance, sleeps } = client(transport)
    await expect(instance.transcribe(segment, 'es', new AbortController().signal)).resolves.toBe('ya')
    expect(sleeps).toEqual([7])
  })

  it.each([
    ['vacio', '', 7],
    ['ilegible', 'en un rato', 7],
    ['una fecha ya pasada', new Date(Date.now() - 60_000).toUTCString(), 0],
  ])('trata un Retry-After %s como su intervalo por defecto', async (_reason, header, expected) => {
    const transport = queuedTransport([
      textResponse(429, 'slow down', { 'retry-after': header }),
      jsonResponse(200, { text: 'ya' }),
    ])
    const { instance, sleeps } = client(transport)
    await expect(instance.transcribe(segment, 'es', new AbortController().signal)).resolves.toBe('ya')
    expect(sleeps).toEqual([expected])
  })

  it('espera una fecha futura lo que falta hasta ella', async () => {
    const transport = queuedTransport([
      textResponse(429, 'slow down', { 'retry-after': new Date(Date.now() + 5000).toUTCString() }),
      jsonResponse(200, { text: 'ya' }),
    ])
    const { instance, sleeps } = client(transport)
    await expect(instance.transcribe(segment, 'es', new AbortController().signal)).resolves.toBe('ya')
    expect(sleeps[0]).toBeGreaterThan(3000)
    expect(sleeps[0]).toBeLessThanOrEqual(5000)
  })

  it('se rinde con RATE_LIMIT cuando agota sus reintentos', async () => {
    const transport = queuedTransport([textResponse(429, 'slow down', { 'retry-after': '1' })])
    const { instance, sleeps } = client(transport, { maxRetries: 1 })
    const failure = await failureOf(instance.transcribe(segment, 'es', new AbortController().signal))
    expect(failure.code).toBe('RATE_LIMIT')
    expect(failure.status).toBe(429)
    expect(sleeps).toEqual([1000])
    expect(transport.calls).toHaveLength(2)
  })

  it('no reintenta despues de que la llamada se cancele', async () => {
    const controller = new AbortController()
    const transport: TransportDouble = {
      calls: [],
      fetch: (url, init) => {
        transport.calls.push({ url, init })
        controller.abort(new Error('cancelled'))
        return Promise.resolve(textResponse(429, 'slow down'))
      },
    }
    const { instance, sleeps } = client(transport)
    await expect(instance.transcribe(segment, 'es', controller.signal)).rejects.toThrow('cancelled')
    expect(sleeps).toEqual([])
  })
})
