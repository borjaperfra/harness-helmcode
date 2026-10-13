import { describe, expect, it } from 'vitest'

import { RedactionMap } from '../src/map.ts'
import { redactText, restoreText } from '../src/redact.ts'

/** Un Exito del bufete: un parrafo realista con varios tipos de PII a la vez. */
const PARAGRAPH = [
  'Doña Ana Pérez (DNI 12345678Z, NIE X1234567L) reclama por el siniestro 4539578763621486',
  'con cargo a la cuenta ES9121000418450200051332. Su movil es 612345678, su fijo 912345678',
  'y su correo ana.perez+legal@bufete-ibanez.example.com. Afiliacion 281234567840,',
  'vehiculo 1234BCD e historia clinica HC-20240123.',
].join('\n')

describe('redactText', () => {
  it('sustituye cada hallazgo por su marcador y los declara', () => {
    const map = new RedactionMap()
    const result = redactText(PARAGRAPH, map)
    expect(result.findings.map(finding => finding.type)).toEqual([
      'DNI', 'NIE', 'CARD', 'IBAN', 'TEL', 'TEL', 'EMAIL', 'SS', 'PLATE', 'RECORD',
    ])
    expect(result.findings.every(finding => result.text.includes(finding.placeholder))).toBe(true)
    expect(result.text).not.toContain('12345678Z')
    expect(result.text).not.toContain('ES9121000418450200051332')
    expect(result.text).toContain('[DNI_1]')
    expect(result.text).toContain('[NIE_1]')
    expect(result.text).toContain('[CARD_1]')
    expect(result.text).toContain('[IBAN_1]')
    expect(result.text).toContain('[TEL_2]')
    expect(result.text).toContain('[EMAIL_1]')
    expect(result.text).toContain('[SS_1]')
    expect(result.text).toContain('[PLATE_1]')
    expect(result.text).toContain('[RECORD_1]')
  })

  it('es determinista: dos pasadas dan el mismo texto y los mismos marcadores', () => {
    const first = new RedactionMap()
    const second = new RedactionMap()
    expect(redactText(PARAGRAPH, first).text).toBe(redactText(PARAGRAPH, second).text)
    expect(first.toJSON()).toBe(second.toJSON())
  })

  it('no cambia un texto sin PII ni produce hallazgos', () => {
    const map = new RedactionMap()
    const result = redactText('El cliente llamo por la manana y no dejo nada mas.', map)
    expect(result.findings).toEqual([])
    expect(result.text).toBe('El cliente llamo por la manana y no dejo nada mas.')
    expect(map.toJSON()).toBe(`${JSON.stringify({ entries: [] }, null, 2)}\n`)
  })
})

describe('restoreText', () => {
  it('devuelve el parrafo original entero', () => {
    const map = new RedactionMap()
    const redacted = redactText(PARAGRAPH, map)
    const restored = restoreText(redacted.text, map)
    expect(restored.text).toBe(PARAGRAPH)
    expect(restored.restored).toBe(redacted.findings.length)
    expect(restored.unresolved).toEqual([])
  })

  it('declara en unresolved los marcadores desconocidos sin tocarlos', () => {
    const map = new RedactionMap()
    map.assign('DNI', '12345678Z')
    const restored = restoreText('Firma [DNI_1], testigo [DNI_7] y referencia [EXPEDIENTE_3].', map)
    expect(restored.text).toBe('Firma 12345678Z, testigo [DNI_7] y referencia [EXPEDIENTE_3].')
    expect(restored.restored).toBe(1)
    expect(restored.unresolved).toEqual(['[DNI_7]', '[EXPEDIENTE_3]'])
  })

  it('declara en unresolved los marcadores caducados en el instante dado', () => {
    const map = new RedactionMap()
    map.assign('DNI', '12345678Z', { expiresAt: new Date('2024-02-01T00:00:00.000Z') })
    map.assign('TEL', '612345678')
    const restored = restoreText('[DNI_1] y [TEL_1]', map, new Date('2024-03-01T00:00:00.000Z'))
    expect(restored.text).toBe('[DNI_1] y 612345678')
    expect(restored.restored).toBe(1)
    expect(restored.unresolved).toEqual(['[DNI_1]'])
  })

  it('deja pasar intacto un texto que no lleva marcadores', () => {
    const restored = restoreText('Sin marcadores, con corchetes [y esto] suelto.', new RedactionMap())
    expect(restored.text).toBe('Sin marcadores, con corchetes [y esto] suelto.')
    expect(restored.restored).toBe(0)
    expect(restored.unresolved).toEqual([])
  })

  it('sobrevive al viaje completo: mapa serializado, cifrado y vuelto a cargar', () => {
    const map = new RedactionMap()
    const redacted = redactText(PARAGRAPH, map)
    const reloaded = RedactionMap.parse(map.toJSON())
    expect(restoreText(redacted.text, reloaded).text).toBe(PARAGRAPH)
  })
})
