import { describe, expect, it } from 'vitest'

import * as privacy from '../src/index.ts'

describe('@deepseek-ai/dsh-privacy-helmcode: superficie publica', () => {
  it('reexporta los cuatro modulos del corte', () => {
    expect(typeof privacy.detectPii).toBe('function')
    expect(typeof privacy.RedactionMap).toBe('function')
    expect(typeof privacy.redactText).toBe('function')
    expect(typeof privacy.restoreText).toBe('function')
    expect(typeof privacy.seal).toBe('function')
    expect(typeof privacy.open).toBe('function')
    expect(privacy.SEAL_VERSION).toBe('v1')
    expect(privacy.UnknownPlaceholderError.prototype).toBeInstanceOf(privacy.PrivacyMapError)
  })

  it('viaja entero: detectar, redactar, sellar, abrir y restaurar', () => {
    const map = new privacy.RedactionMap()
    const redacted = privacy.redactText('DNI 12345678Z y movil 612345678.', map)
    expect(redacted.text).toBe('DNI [DNI_1] y movil [TEL_1].')

    const sealed = privacy.seal(map.toJSON(), 'clave-del-perfil')
    expect(sealed.startsWith(`${privacy.SEAL_VERSION}:`)).toBe(true)

    const reloaded = privacy.RedactionMap.parse(privacy.open(sealed, 'clave-del-perfil'))
    expect(privacy.restoreText(redacted.text, reloaded).text).toBe('DNI 12345678Z y movil 612345678.')
  })

  it('no expone ningun punto de cableado: sin apply ni Config en este corte', () => {
    expect('apply' in privacy).toBe(false)
    expect('Config' in privacy).toBe(false)
    expect('name' in privacy).toBe(false)
    expect('inject' in privacy).toBe(false)
  })
})
