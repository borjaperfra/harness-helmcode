import { describe, expect, it } from 'vitest'

import {
  CorruptMapError,
  ExpiredEntryError,
  PLACEHOLDER_PREFIX,
  PrivacyMapError,
  RedactionMap,
  UnknownPlaceholderError,
} from '../src/map.ts'

/** Un mapa poblado con un valor de cada tipo, en orden de declaracion. */
const populated = (): RedactionMap => {
  const map = new RedactionMap()
  map.assign('DNI', '12345678Z')
  map.assign('NIE', 'X1234567L')
  map.assign('IBAN', 'ES9121000418450200051332')
  map.assign('CARD', '4539578763621486')
  map.assign('SS', '281234567840')
  map.assign('TEL', '612345678')
  map.assign('EMAIL', 'ana@bufete.example')
  map.assign('PLATE', '1234BCD')
  map.assign('RECORD', 'HC-20240123')
  return map
}

describe('RedactionMap: marcadores deterministas', () => {
  it('acuna un contador por tipo con el prefijo de su tabla', () => {
    const map = populated()
    expect(map.lookup('12345678Z')?.placeholder).toBe('[DNI_1]')
    expect(map.lookup('X1234567L')?.placeholder).toBe('[NIE_1]')
    expect(map.lookup('ES9121000418450200051332')?.placeholder).toBe('[IBAN_1]')
    expect(map.lookup('4539578763621486')?.placeholder).toBe('[CARD_1]')
    expect(map.lookup('281234567840')?.placeholder).toBe('[SS_1]')
    expect(map.lookup('612345678')?.placeholder).toBe('[TEL_1]')
    expect(map.lookup('ana@bufete.example')?.placeholder).toBe('[EMAIL_1]')
    expect(map.lookup('1234BCD')?.placeholder).toBe('[PLATE_1]')
    expect(map.lookup('HC-20240123')?.placeholder).toBe('[RECORD_1]')
    expect(Object.values(PLACEHOLDER_PREFIX)).toHaveLength(9)
  })

  it('da el MISMO marcador al mismo valor y numera los distintos', () => {
    const map = new RedactionMap()
    expect(map.assign('DNI', '12345678Z')).toBe('[DNI_1]')
    expect(map.assign('DNI', '12345678Z')).toBe('[DNI_1]')
    expect(map.assign('DNI', '11111111H')).toBe('[DNI_2]')
    expect(map.assign('TEL', '612345678')).toBe('[TEL_1]')
    expect(map.assign('DNI', '12345678Z')).toBe('[DNI_1]')
  })

  it('no reescribe los sellos de una entrada ya presente', () => {
    const map = new RedactionMap()
    map.assign('DNI', '12345678Z')
    const again = map.assign('DNI', '12345678Z', { createdAt: new Date('2024-01-01T00:00:00.000Z') })
    expect(again).toBe('[DNI_1]')
    expect(map.lookup('12345678Z')?.createdAt).toBeUndefined()
  })

  it('sella createdAt y expiresAt cuando el llamante los acota', () => {
    const map = new RedactionMap()
    map.assign('DNI', '12345678Z', {
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      expiresAt: new Date('2024-02-01T00:00:00.000Z'),
    })
    expect(map.lookup('12345678Z')).toEqual({
      type: 'DNI',
      value: '12345678Z',
      placeholder: '[DNI_1]',
      createdAt: '2024-01-01T00:00:00.000Z',
      expiresAt: '2024-02-01T00:00:00.000Z',
    })
  })

  it('devuelve undefined para un valor que no esta en el mapa', () => {
    expect(new RedactionMap().lookup('12345678Z')).toBeUndefined()
  })
})

describe('RedactionMap: resolve niega lo que no puede demostrar', () => {
  it('resuelve un marcador vivo', () => {
    const map = new RedactionMap()
    map.assign('DNI', '12345678Z')
    expect(map.resolve('[DNI_1]', new Date('2024-01-01T00:00:00.000Z')).value).toBe('12345678Z')
  })

  it('niega un marcador desconocido con error tipado', () => {
    const map = new RedactionMap()
    const error = (() => {
      try {
        map.resolve('[DNI_9]', new Date('2024-01-01T00:00:00.000Z'))
        return undefined
      } catch (caught) {
        return caught
      }
    })()
    expect(error).toBeInstanceOf(UnknownPlaceholderError)
    expect(error).toBeInstanceOf(PrivacyMapError)
    expect((error as UnknownPlaceholderError).code).toBe('unknown-placeholder')
    expect((error as UnknownPlaceholderError).name).toBe('UnknownPlaceholderError')
    expect((error as UnknownPlaceholderError).placeholder).toBe('[DNI_9]')
    expect((error as UnknownPlaceholderError).message).toContain('[DNI_9]')
  })

  it('niega una entrada caducada, incluso en el instante exacto de caducidad', () => {
    const map = new RedactionMap()
    map.assign('DNI', '12345678Z', { expiresAt: new Date('2024-02-01T00:00:00.000Z') })
    const error = (() => {
      try {
        map.resolve('[DNI_1]', new Date('2024-02-01T00:00:00.000Z'))
        return undefined
      } catch (caught) {
        return caught
      }
    })()
    expect(error).toBeInstanceOf(ExpiredEntryError)
    expect((error as ExpiredEntryError).code).toBe('expired-entry')
    expect((error as ExpiredEntryError).name).toBe('ExpiredEntryError')
    expect((error as ExpiredEntryError).expiresAt).toBe('2024-02-01T00:00:00.000Z')
    expect(map.resolve('[DNI_1]', new Date('2024-01-31T23:59:59.999Z')).value).toBe('12345678Z')
  })
})

describe('RedactionMap: purge borra lo caducado', () => {
  it('elimina las entradas vencidas y deja las vivas y las que no caducan', () => {
    const map = new RedactionMap()
    map.assign('DNI', '12345678Z', { expiresAt: new Date('2024-02-01T00:00:00.000Z') })
    map.assign('TEL', '612345678', { expiresAt: new Date('2024-06-01T00:00:00.000Z') })
    map.assign('EMAIL', 'ana@bufete.example')

    // El instante de caducidad exacto ya cuenta como vencido, igual que en `resolve`.
    expect(map.purge(new Date('2024-02-01T00:00:00.000Z'))).toBe(1)
    expect(map.lookup('12345678Z')).toBeUndefined()
    expect(map.lookup('612345678')?.placeholder).toBe('[TEL_1]')
    expect(map.lookup('ana@bufete.example')?.placeholder).toBe('[EMAIL_1]')
  })

  it('deja el marcador sin restaurar y fuera del documento serializado', () => {
    const map = new RedactionMap()
    map.assign('DNI', '12345678Z', { expiresAt: new Date('2024-02-01T00:00:00.000Z') })
    const before = map.toJSON()
    expect(before).toContain('[DNI_1]')

    expect(map.purge(new Date('2024-03-01T00:00:00.000Z'))).toBe(1)

    // El marcador sigue en el historial del modelo, pero ya no vuelve a ningun valor:
    // la entrada no esta y el mapa NIEGA restaurarla.
    expect(map.toJSON()).not.toContain('[DNI_1]')
    expect(map.toJSON()).not.toContain('12345678Z')
    expect(() => map.resolve('[DNI_1]', new Date('2024-03-01T00:00:00.000Z'))).toThrow(UnknownPlaceholderError)
  })

  it('no reinicia los contadores: un marcador ya emitido no se reutiliza', () => {
    const map = new RedactionMap()
    map.assign('DNI', '12345678Z', { expiresAt: new Date('2024-02-01T00:00:00.000Z') })
    map.purge(new Date('2024-03-01T00:00:00.000Z'))

    expect(map.assign('DNI', '11111111H')).toBe('[DNI_2]')
  })

  it('sin nada vencido no borra nada, y por defecto usa el ahora', () => {
    const map = new RedactionMap()
    map.assign('DNI', '12345678Z', { expiresAt: new Date('2099-01-01T00:00:00.000Z') })
    expect(map.purge()).toBe(0)
    expect(map.lookup('12345678Z')?.placeholder).toBe('[DNI_1]')
  })
})

describe('RedactionMap: serializacion estable', () => {
  it('ordena las entradas por marcador y las claves siempre igual', () => {
    const map = populated()
    const json = map.toJSON()
    expect(json.endsWith('\n')).toBe(true)
    expect(JSON.parse(json)).toEqual({
      entries: [
        { type: 'CARD', value: '4539578763621486', placeholder: '[CARD_1]' },
        { type: 'DNI', value: '12345678Z', placeholder: '[DNI_1]' },
        { type: 'EMAIL', value: 'ana@bufete.example', placeholder: '[EMAIL_1]' },
        { type: 'IBAN', value: 'ES9121000418450200051332', placeholder: '[IBAN_1]' },
        { type: 'NIE', value: 'X1234567L', placeholder: '[NIE_1]' },
        { type: 'PLATE', value: '1234BCD', placeholder: '[PLATE_1]' },
        { type: 'RECORD', value: 'HC-20240123', placeholder: '[RECORD_1]' },
        { type: 'SS', value: '281234567840', placeholder: '[SS_1]' },
        { type: 'TEL', value: '612345678', placeholder: '[TEL_1]' },
      ],
    })
    expect(json.indexOf('[DNI_1]')).toBeLessThan(json.indexOf('[EMAIL_1]'))
  })

  it('produce el MISMO documento para mapas construidos en orden distinto', () => {
    const forward = new RedactionMap()
    forward.assign('DNI', '12345678Z')
    forward.assign('TEL', '612345678')
    const backward = new RedactionMap()
    backward.assign('TEL', '612345678')
    backward.assign('DNI', '12345678Z')
    expect(forward.toJSON()).toBe(backward.toJSON())
    expect(RedactionMap.parse(forward.toJSON()).toJSON()).toBe(forward.toJSON())
  })

  it('conserva los sellos al serializar', () => {
    const map = new RedactionMap()
    map.assign('DNI', '12345678Z', {
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      expiresAt: new Date('2024-02-01T00:00:00.000Z'),
    })
    expect(RedactionMap.parse(map.toJSON()).toJSON()).toBe(map.toJSON())
  })
})

describe('RedactionMap: parse reconstruye y rechaza lo corrupto', () => {
  it('reconstruye los contadores para que una entrada nueva no colisione', () => {
    const map = RedactionMap.parse(populated().toJSON())
    expect(map.assign('DNI', '11111111H')).toBe('[DNI_2]')
    expect(map.lookup('12345678Z')?.placeholder).toBe('[DNI_1]')
    expect(map.resolve('[TEL_1]', new Date('2024-01-01T00:00:00.000Z')).value).toBe('612345678')
  })

  it('rechaza un documento que no es JSON', () => {
    expect(() => RedactionMap.parse('{no soy json')).toThrow(CorruptMapError)
    expect(() => RedactionMap.parse('{no soy json')).toThrow('corrupt privacy map: document is not valid JSON')
  })

  it('rechaza un documento sin la forma declarada', () => {
    expect(() => RedactionMap.parse('[]')).toThrow('entries array')
    expect(() => RedactionMap.parse('null')).toThrow('entries array')
    expect(() => RedactionMap.parse('{"entries":{}}')).toThrow('entries array')
  })

  it('rechaza una entrada que no es un objeto', () => {
    expect(() => RedactionMap.parse('{"entries":["x"]}')).toThrow('entry must be an object')
    expect(() => RedactionMap.parse('{"entries":[null]}')).toThrow('entry must be an object')
  })

  it('rechaza un tipo desconocido o que no sea texto', () => {
    expect(() => RedactionMap.parse('{"entries":[{"type":"IBANX","value":"v","placeholder":"[IBANX_1]"}]}')).toThrow(/entry field type must be one of/)
    expect(() => RedactionMap.parse('{"entries":[{"type":7,"value":"v","placeholder":"[DNI_1]"}]}')).toThrow(/entry field type must be one of/)
  })

  it('rechaza una entrada a la que le falta value, placeholder o le sobra un sello no textual', () => {
    expect(() => RedactionMap.parse('{"entries":[{"type":"DNI","placeholder":"[DNI_1]"}]}')).toThrow('entry field value must be a string')
    expect(() => RedactionMap.parse('{"entries":[{"type":"DNI","value":"12345678Z"}]}')).toThrow('entry field placeholder must be a string')
    expect(() => RedactionMap.parse('{"entries":[{"type":"DNI","value":"v","placeholder":"[DNI_1]","createdAt":5}]}')).toThrow('entry field createdAt must be a string')
    expect(() => RedactionMap.parse('{"entries":[{"type":"DNI","value":"v","placeholder":"[DNI_1]","expiresAt":5}]}')).toThrow('entry field expiresAt must be a string')
  })

  it('acepta sellos opcionales y un marcador sin forma de contador', () => {
    const map = RedactionMap.parse('{"entries":[{"type":"DNI","value":"12345678Z","placeholder":"sin-forma","createdAt":"2024-01-01T00:00:00.000Z","expiresAt":"2024-02-01T00:00:00.000Z"}]}')
    expect(map.lookup('12345678Z')?.placeholder).toBe('sin-forma')
    expect(map.lookup('12345678Z')?.expiresAt).toBe('2024-02-01T00:00:00.000Z')
    // El marcador no tiene forma de contador: el contador del tipo arranca de cero.
    expect(map.assign('DNI', '11111111H')).toBe('[DNI_1]')
  })

  it('rechaza un valor o un marcador duplicado', () => {
    const entry = '{"type":"DNI","value":"12345678Z","placeholder":"[DNI_1]"}'
    expect(() => RedactionMap.parse(`{"entries":[${entry},${entry}]}`)).toThrow('duplicate entry [DNI_1]')
    const twin = '{"type":"DNI","value":"11111111H","placeholder":"[DNI_1]"}'
    expect(() => RedactionMap.parse(`{"entries":[${entry},${twin}]}`)).toThrow('duplicate entry [DNI_1]')
  })

  it('no baja el contador de un tipo cuando los indices llegan desordenados', () => {
    const first = '{"type":"DNI","value":"11111111H","placeholder":"[DNI_2]"}'
    const second = '{"type":"DNI","value":"12345678Z","placeholder":"[DNI_1]"}'
    const map = RedactionMap.parse(`{"entries":[${first},${second}]}`)
    expect(map.assign('DNI', '55555555K')).toBe('[DNI_3]')
    expect(map.toJSON().indexOf('[DNI_1]')).toBeLessThan(map.toJSON().indexOf('[DNI_2]'))
  })
})
