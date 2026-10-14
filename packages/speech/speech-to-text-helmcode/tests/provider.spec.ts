/**
 * El cableado: registro del proveedor en la interfaz de STT existente, la clave
 * resuelta en el credential store y el `fetch` global sustituido por un doble.
 *
 * Este fichero es el que prueba que el paquete es un PROVEEDOR de verdad y no
 * solo un cliente: monta el servicio de STT real, el credential store local de
 * verdad y comprueba la transcripcion a traves del registro.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import SpeechToText from '@deepseek-ai/dsh-experimental-speech-to-text'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Provider from '../src/index.ts'
import type { Config } from '../src/index.ts'
import { failureOf, jsonResponse, queuedTransport, textResponse, waveBytes } from './doubles.ts'
import type { TransportDouble } from './doubles.ts'

/** La referencia por defecto de la clave de Helmcode. */
const KEY_REF = 'HELMCODE_API_KEY'

/** Una clave que no vale para nada porque nunca sale a la red. */
const KEY = 'sk-test'

/** Cinco minutos de WAV a 16 kHz, mono y 16 bits. */
const FIVE_MINUTES = waveBytes({ seconds: 300 })

const contexts: Context[] = []
const roots: string[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** El arnes: credential store local, servicio de STT real y el plugin montado. */
async function harness(options: {
  key?: string
  keyRef?: string
  config?: Config
  transport?: TransportDouble
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-speech-to-text-helmcode-'))
  roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LocalCredentialProvider, { dshHome: join(root, 'home'), watch: false, debounceMs: 0 })
  if (options.key !== undefined) await ctx.credentials.set(credentialRef(options.keyRef ?? KEY_REF), options.key)
  await ctx.plugin(SpeechToText, {
    defaultProvider: options.config?.providerId ?? Provider.DEFAULT_PROVIDER_ID,
    language: 'auto',
  })
  const transport = options.transport ?? queuedTransport([jsonResponse(200, { text: 'hola' })])
  vi.stubGlobal('fetch', transport.fetch)
  const fiber = ctx.plugin(Provider, options.config ?? {})
  await fiber
  return { ctx, transport, fiber }
}

describe('speech-to-text-helmcode: superficie publica', () => {
  it('expone el plugin, sus defectos y el nucleo reexportado', () => {
    expect(Provider.name).toBe('speech-to-text-helmcode')
    expect(Provider.inject).toEqual(['speechToText', 'credentials'])
    expect(Provider.DEFAULT_PROVIDER_ID).toBe('helmcode-whisper')
    expect(Provider.DEFAULT_API_KEY_REF).toBe(KEY_REF)
    expect(Provider.DEFAULT_BASE_URL).toBe('https://api.helmcode.com')
    expect(Provider.DEFAULT_MODEL).toBe('whisper')
    expect(Provider.DEFAULT_SEGMENT_SECONDS).toBe(120)
    expect(Provider.MAX_REQUEST_BYTES).toBe(25 * 1024 * 1024)
    expect(Provider.DEFAULT_MAX_RETRIES).toBe(2)
    expect(Provider.DEFAULT_RETRY_DELAY_MS).toBe(1000)
    expect(Provider.TRANSCRIPTION_PATH).toBe('/v1/audio/transcriptions')
    expect(Provider.WHISPER_LANGUAGES).toContain('auto')
    expect(Provider.WHISPER_LANGUAGES).toContain('es')
    expect(typeof Provider.apply).toBe('function')
    expect(typeof Provider.chunkWave).toBe('function')
    expect(typeof Provider.readWave).toBe('function')
    expect(typeof Provider.HelmcodeTranscriptionClient).toBe('function')
    expect(typeof Provider.TranscriptionError).toBe('function')
  })

  it('valida su configuracion con el esquema del loader', () => {
    expect(Provider.Config({})).toEqual({})
    expect(Provider.Config({ model: 'whisper-large' })).toEqual({ model: 'whisper-large' })
    expect(() => Provider.Config({ maxRetries: 'dos' } as never)).toThrow()
  })

  it('rechaza limites que no son enteros validos antes de registrar nada', () => {
    expect(() => { Provider.apply(new Context(), Provider.Config({ segmentSeconds: 0 })) })
      .toThrow('segmentSeconds must be a positive integer')
    expect(() => { Provider.apply(new Context(), Provider.Config({ maxRequestBytes: 1.5 })) })
      .toThrow('maxRequestBytes must be a positive integer')
    expect(() => { Provider.apply(new Context(), Provider.Config({ maxRetries: -1 })) })
      .toThrow('maxRetries must be a non-negative integer')
    expect(() => { Provider.apply(new Context(), Provider.Config({ retryDelayMs: -1 })) })
      .toThrow('retryDelayMs must be a non-negative integer')
  })
})

describe('registro del proveedor', () => {
  it('registra helmcode-whisper como proveedor en la nube listo para usar', async () => {
    const { ctx } = await harness({ key: KEY })
    const speech = ctx.get('speechToText')!
    expect(speech.listProviders()).toMatchObject([{
      id: 'helmcode-whisper',
      name: 'Helmcode whisper (whisper)',
      location: 'cloud',
    }])
    expect(speech.listProviders()[0]?.languages).toContain('es')
    expect(speech.snapshot().providers[0]?.preparation).toEqual({ phase: 'ready' })
  })

  it('retira el proveedor cuando el plugin se desmonta', async () => {
    const { ctx, fiber } = await harness({ key: KEY })
    expect(ctx.get('speechToText')!.listProviders()).toHaveLength(1)
    await fiber.dispose()
    expect(ctx.get('speechToText')!.listProviders()).toEqual([])
  })
})

describe('transcripcion a traves del registro', () => {
  it('trocea cinco minutos en tres peticiones y concatena el texto', async () => {
    const transport = queuedTransport([
      jsonResponse(200, { text: 'uno' }),
      jsonResponse(200, { text: '' }),
      jsonResponse(200, { text: 'dos' }),
    ])
    const { ctx } = await harness({ key: KEY, transport })
    const speech = ctx.get('speechToText')!
    const transcript = await speech.transcribe(
      speech.resolve({ audio: FIVE_MINUTES, language: 'es' }),
      new AbortController().signal,
    )
    expect(transport.calls).toHaveLength(3)
    expect(transcript.text).toBe('uno dos')
    expect(transcript.audioSeconds).toBe(300)
    expect(transcript.inferenceSeconds).toBeGreaterThanOrEqual(0)
    for (const call of transport.calls) {
      expect(call.url).toBe('https://api.helmcode.com/v1/audio/transcriptions')
      expect(call.init.headers.authorization).toBe(`Bearer ${KEY}`)
    }
  })

  it('aplica la configuracion declarada al registro y a la peticion', async () => {
    const transport = queuedTransport([jsonResponse(200, { text: 'hola' })])
    const { ctx } = await harness({
      key: KEY,
      transport,
      config: {
        providerId: 'whisper-eu',
        baseURL: 'https://eu.example/',
        model: 'whisper-large',
        segmentSeconds: 60,
      },
    })
    const speech = ctx.get('speechToText')!
    expect(speech.listProviders()[0]?.id).toBe('whisper-eu')
    const transcript = await speech.transcribe(
      speech.resolve({ audio: FIVE_MINUTES, language: 'es' }),
      new AbortController().signal,
    )
    expect(transcript.text).toBe('hola hola hola hola hola')
    expect(transport.calls).toHaveLength(5)
    expect(transport.calls[0]?.url).toBe('https://eu.example/v1/audio/transcriptions')
    const body = transport.calls[0]?.init.body
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get('model')).toBe('whisper-large')
  })

  it('reintenta un 429 con el Retry-After del proveedor', async () => {
    const transport = queuedTransport([
      textResponse(429, 'frena', { 'retry-after': '0' }),
      jsonResponse(200, { text: 'ya' }),
    ])
    const { ctx } = await harness({ key: KEY, transport })
    const speech = ctx.get('speechToText')!
    const transcript = await speech.transcribe(
      speech.resolve({ audio: waveBytes({ seconds: 1 }), language: 'auto' }),
      new AbortController().signal,
    )
    expect(transcript.text).toBe('ya')
    expect(transport.calls).toHaveLength(2)
  })

  it('se rinde sin reintentar cuando maxRetries es cero', async () => {
    const transport = queuedTransport([textResponse(429, 'frena', { 'retry-after': '0' })])
    const { ctx } = await harness({ key: KEY, transport, config: { maxRetries: 0 } })
    const speech = ctx.get('speechToText')!
    const failure = await failureOf(speech.transcribe(
      speech.resolve({ audio: waveBytes({ seconds: 1 }), language: 'es' }),
      new AbortController().signal,
    ))
    expect(failure.code).toBe('RATE_LIMIT')
    expect(transport.calls).toHaveLength(1)
  })

  it('traduce un 401 a AUTH', async () => {
    const transport = queuedTransport([textResponse(401, 'clave mala')])
    const { ctx } = await harness({ key: KEY, transport })
    const speech = ctx.get('speechToText')!
    const failure = await failureOf(speech.transcribe(
      speech.resolve({ audio: waveBytes({ seconds: 1 }), language: 'es' }),
      new AbortController().signal,
    ))
    expect(failure.code).toBe('AUTH')
    expect(failure.status).toBe(401)
  })

  it('falla con FILE_TOO_LARGE antes de enviar cuando el limite no admite ni una trama', async () => {
    const transport = queuedTransport([jsonResponse(200, { text: 'no deberia llegar' })])
    const { ctx } = await harness({ key: KEY, transport, config: { maxRequestBytes: 1 } })
    const speech = ctx.get('speechToText')!
    const failure = await failureOf(speech.transcribe(
      speech.resolve({ audio: waveBytes({ seconds: 1 }), language: 'es' }),
      new AbortController().signal,
    ))
    expect(failure.code).toBe('FILE_TOO_LARGE')
    expect(transport.calls).toEqual([])
  })

  it('falla con MISSING_CREDENTIAL cuando no hay clave guardada', async () => {
    const { ctx } = await harness()
    const speech = ctx.get('speechToText')!
    const failure = await failureOf(speech.transcribe(
      speech.resolve({ audio: waveBytes({ seconds: 1 }), language: 'es' }),
      new AbortController().signal,
    ))
    expect(failure.code).toBe('MISSING_CREDENTIAL')
    expect(failure.message).toContain(`no credential is configured for ${KEY_REF}`)
  })

  it('falla con MISSING_CREDENTIAL cuando la referencia no es una credencial', async () => {
    const { ctx } = await harness({ config: { apiKeyRef: 'no es una referencia' } })
    const speech = ctx.get('speechToText')!
    const failure = await failureOf(speech.transcribe(
      speech.resolve({ audio: waveBytes({ seconds: 1 }), language: 'es' }),
      new AbortController().signal,
    ))
    expect(failure.code).toBe('MISSING_CREDENTIAL')
    expect(failure.message).toContain('is not a valid credential reference')
  })

  it('falla con NO_TRANSPORT cuando la composicion no tiene fetch global', async () => {
    const { ctx } = await harness({ key: KEY })
    vi.stubGlobal('fetch', undefined)
    const speech = ctx.get('speechToText')!
    const failure = await failureOf(speech.transcribe(
      speech.resolve({ audio: waveBytes({ seconds: 1 }), language: 'es' }),
      new AbortController().signal,
    ))
    expect(failure.code).toBe('NO_TRANSPORT')
  })

  it('rechaza una transcripcion ya cancelada sin abrir peticion', async () => {
    const transport = queuedTransport([jsonResponse(200, { text: 'no deberia llegar' })])
    const { ctx } = await harness({ key: KEY, transport })
    const speech = ctx.get('speechToText')!
    await expect(speech.transcribe(
      speech.resolve({ audio: waveBytes({ seconds: 1 }), language: 'es' }),
      AbortSignal.abort(new Error('cancelled')),
    )).rejects.toThrow('cancelled')
    expect(transport.calls).toEqual([])
  })
})
