import { describe, expect, it } from 'vitest'
import { RetrievalError } from '../src/errors.ts'
import { failureOf, thrownBy } from './doubles.ts'

describe('RetrievalError', () => {
  it('lleva el codigo y deja los campos del proveedor sin definir cuando no los hay', async () => {
    const error = new RetrievalError('MALFORMED', 'contrato roto')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('RetrievalError')
    expect(error.code).toBe('MALFORMED')
    expect(error.status).toBeUndefined()
    expect(error.providerRetryAfterMs).toBeUndefined()
    expect(error.cause).toBeUndefined()

    const caught = await failureOf(Promise.reject(new RetrievalError('CLOSED', 'cerrado')))
    expect(caught.code).toBe('CLOSED')

    const raised = thrownBy(() => {
      throw new RetrievalError('DIMENSION', 'medida distinta')
    })
    expect(raised.message).toBe('medida distinta')
  })

  it('lleva el estado, el intervalo del proveedor y la causa', () => {
    const cause = new Error('causa interna')
    const error = new RetrievalError('RATE_LIMIT', 'mas despacio', { status: 429, providerRetryAfterMs: 2500, cause })
    expect(error.status).toBe(429)
    expect(error.providerRetryAfterMs).toBe(2500)
    expect(error.cause).toBe(cause)
  })
})
