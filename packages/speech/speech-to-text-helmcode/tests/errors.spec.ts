/**
 * El vocabulario de fallo del proveedor: un codigo por decision, con el estado
 * y el intervalo del proveedor a la vista.
 */

import { describe, expect, it } from 'vitest'
import { TranscriptionError } from '../src/errors.ts'

describe('TranscriptionError', () => {
  it('lleva el codigo, el estado y el intervalo del proveedor', () => {
    const failure = new TranscriptionError('RATE_LIMIT', 'frena', { status: 429, providerRetryAfterMs: 2000 })
    expect(failure).toBeInstanceOf(Error)
    expect(failure.name).toBe('TranscriptionError')
    expect(failure.code).toBe('RATE_LIMIT')
    expect(failure.message).toBe('frena')
    expect(failure.status).toBe(429)
    expect(failure.providerRetryAfterMs).toBe(2000)
  })

  it('deja el estado y el intervalo sin definir cuando el fallo no viene de una respuesta', () => {
    const cause = new Error('de abajo')
    const failure = new TranscriptionError('MALFORMED', 'no cuadra', { cause })
    expect(failure.status).toBeUndefined()
    expect(failure.providerRetryAfterMs).toBeUndefined()
    expect(failure.cause).toBe(cause)
  })
})
