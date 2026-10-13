/**
 * Superficie publica del paquete: los cuatro modulos del nucleo puro mas el
 * cableado (nombre, seams, esquema de configuracion y `apply`).
 *
 * El comportamiento de las herramientas se prueba en `wiring.spec.ts`; aqui solo
 * se comprueba que la superficie existe y que un ida y vuelta completo —detectar,
 * redactar, sellar, abrir y restaurar— viaja entero.
 */

import { join } from 'node:path'
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

  it('expone el cableado: el plugin, sus dos seams, el esquema y la ruta por defecto', () => {
    expect(privacy.name).toBe('privacy-helmcode')
    expect(privacy.inject).toEqual(['tools', 'credentials'])
    expect(typeof privacy.apply).toBe('function')
    // El esquema es Schemastery NATIVO y por eso el validador de config lo
    // reconoce: un `Config` de zod se marcaria `unsupported`.
    expect(privacy.Config({ ttlDays: 30 })).toEqual({ ttlDays: 30 })
    expect(privacy.Config({ mapKeyRef: 'OTRA_CLAVE' })).toEqual({ mapKeyRef: 'OTRA_CLAVE' })
    expect(() => privacy.Config({ ttlDays: 'no-es-un-numero' } as never)).toThrow()
    expect(privacy.defaultMapPath(join('home', 'dsh'))).toBe(join('home', 'dsh', 'privacy', 'map.v1'))
    expect(privacy.DEFAULT_MAP_KEY_REF).toBe('PRIVACY_MAP_KEY')
  })
})
