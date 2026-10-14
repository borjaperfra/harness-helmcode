import { describe, expect, it } from 'vitest'

import { detectPii, type PiiType } from '../src/detect.ts'

/** Los tipos de un conjunto de hallazgos, en orden de aparicion. */
const typesOf = (text: string): PiiType[] => detectPii(text).map(finding => finding.type)

/** El unico valor hallado, o una explosion si hubo mas de uno. */
const onlyValue = (text: string): string => {
  const findings = detectPii(text)
  expect(findings).toHaveLength(1)
  return findings[0]?.value ?? ''
}

describe('detectPii: documento nacional con mod-23', () => {
  it('acepta los DNI cuya letra calcula el mod-23', () => {
    expect(detectPii('Titular 12345678Z.')).toEqual([
      { type: 'DNI', value: '12345678Z', start: 8, end: 17 },
    ])
    expect(onlyValue('11111111H')).toBe('11111111H')
    expect(typesOf('11111111H y 55555555K')).toEqual(['DNI', 'DNI'])
  })

  it('rechaza un DNI con la letra cambiada', () => {
    expect(detectPii('12345678A')).toEqual([])
    expect(detectPii('11111111A y 55555555A')).toEqual([])
  })

  it('rechaza un DNI sin la letra o con un digito de menos', () => {
    expect(detectPii('12345678')).toEqual([])
    expect(detectPii('1234567Z')).toEqual([])
  })
})

describe('detectPii: NIE con X/Y/Z convertidas a 0/1/2', () => {
  it('acepta los NIE validos de las tres series', () => {
    expect(typesOf('X1234567L Y1234567X Z1234567R')).toEqual(['NIE', 'NIE', 'NIE'])
    expect(onlyValue('X1234567L')).toBe('X1234567L')
  })

  it('rechaza un NIE con la letra mal', () => {
    expect(detectPii('X1234567A')).toEqual([])
    expect(detectPii('Z1234567A')).toEqual([])
  })
})

describe('detectPii: IBAN espanol con mod-97', () => {
  it('acepta los IBAN cuyo resto modulo 97 es 1', () => {
    expect(typesOf('Cuenta ES9121000418450200051332 del cliente')).toEqual(['IBAN'])
    expect(typesOf('Otra ES7620770024003102575766')).toEqual(['IBAN'])
  })

  it('rechaza un IBAN con el digito de control mal', () => {
    expect(detectPii('ES9121000418450200051333')).toEqual([])
    expect(detectPii('ES0021000418450200051332')).toEqual([])
  })

  it('rechaza un IBAN de 22 caracteres (le faltan digitos)', () => {
    expect(detectPii('ES912100041845020005133')).toEqual([])
  })
})

describe('detectPii: tarjeta con Luhn', () => {
  it('acepta las tarjetas que pasan Luhn', () => {
    expect(typesOf('4539578763621486')).toEqual(['CARD'])
    expect(typesOf('5500005555555559 y 4111111111111111')).toEqual(['CARD', 'CARD'])
  })

  it('rechaza una tarjeta con el ultimo digito mal', () => {
    expect(detectPii('4539578763621487')).toEqual([])
    expect(detectPii('5500005555555558')).toEqual([])
  })
})

describe('detectPii: numeros desnudos y demas tipos', () => {
  it('acepta los 12 digitos del NUSS', () => {
    expect(typesOf('Afiliacion 281234567840')).toEqual(['SS'])
  })

  it('acepta moviles 6/7 y fijos 8/9, y rechaza el resto', () => {
    expect(typesOf('612345678')).toEqual(['TEL'])
    expect(typesOf('712345678')).toEqual(['TEL'])
    expect(typesOf('812345678')).toEqual(['TEL'])
    expect(typesOf('912345678')).toEqual(['TEL'])
    expect(detectPii('112345678')).toEqual([])
    expect(detectPii('61234567')).toEqual([])
  })

  it('acepta un correo electronico', () => {
    expect(onlyValue('Escribe a ana.perez+legal@bufete-ibanez.example.com hoy')).toBe('ana.perez+legal@bufete-ibanez.example.com')
  })

  it('acepta matriculas del formato 2000 y rechaza las que llevan vocal', () => {
    expect(typesOf('Matricula 1234BCD')).toEqual(['PLATE'])
    expect(detectPii('1234ABC')).toEqual([])
    expect(detectPii('1234BC')).toEqual([])
  })

  it('acepta el numero de historia clinica con su etiqueta', () => {
    expect(onlyValue('Historia HC-20240123 abierta')).toBe('HC-20240123')
    expect(typesOf('HC-1234')).toEqual(['RECORD'])
    expect(detectPii('HC-123')).toEqual([])
  })

  it('no propone candidatos dentro de una tirada mas larga de digitos', () => {
    // El cuerpo del IBAN contiene tiradas de 12, 13-19 y 9 digitos que solo
    // serian candidatas si el patron no exigiera frontera.
    expect(typesOf('ES9121000418450200051332')).toEqual(['IBAN'])
  })
})

describe('detectPii: separadores reales dentro del dato', () => {
  it('acepta el DNI con guion y con puntos, y guarda el literal original', () => {
    expect(detectPii('Titular 12345678-Z.')).toEqual([
      { type: 'DNI', value: '12345678-Z', start: 8, end: 18 },
    ])
    expect(onlyValue('Titular 12.345.678-Z.')).toBe('12.345.678-Z')
    expect(typesOf('12.345.678-Z y 12345678Z')).toEqual(['DNI', 'DNI'])
  })

  it('valida el checksum sobre los digitos, no sobre el literal', () => {
    // La letra sigue saliendo del mod-23 de los ocho digitos: el separador no
    // la cambia, y una letra equivocada no se redacta.
    expect(detectPii('12.345.678-A')).toEqual([])
    expect(detectPii('12345678-A')).toEqual([])
  })

  it('acepta el telefono con prefijo internacional, con o sin espacios', () => {
    expect(onlyValue('Llamar al +34600123456 ahora')).toBe('+34600123456')
    expect(onlyValue('Llamar al +34 600 123 456 ahora')).toBe('+34 600 123 456')
    expect(onlyValue('Llamar al 0034 600 123 456 ahora')).toBe('0034 600 123 456')
    expect(onlyValue('Llamar al 0034600123456 ahora')).toBe('0034600123456')
    expect(onlyValue('Llamar al 600-123-456 ahora')).toBe('600-123-456')
  })

  it('no inventa un telefono detras de un prefijo sin numero espanol', () => {
    // El 5 no es movil ni fijo: el prefijo no basta para declarar un hallazgo.
    expect(detectPii('+34 512 345 678')).toEqual([])
    expect(detectPii('+34 512345678')).toEqual([])
  })

  it('acepta el IBAN con los espacios de sus grupos de cuatro', () => {
    expect(detectPii('Cuenta ES91 2100 0418 4502 0005 1332 del cliente')).toEqual([
      { type: 'IBAN', value: 'ES91 2100 0418 4502 0005 1332', start: 7, end: 36 },
    ])
  })

  it('rechaza el IBAN con espacios si el digito de control no valida', () => {
    expect(detectPii('ES91 2100 0418 4502 0005 1333')).toEqual([])
  })

  it('acepta el NUSS con barras y valida su digito de control', () => {
    expect(onlyValue('Afiliacion 28/12345678/40')).toBe('28/12345678/40')
    expect(onlyValue('Afiliacion 281234567840')).toBe('281234567840')
    expect(detectPii('Afiliacion 28/12345678/41')).toEqual([])
    expect(detectPii('Afiliacion 281234567841')).toEqual([])
  })

  it('acepta el numero de historia clinica con etiqueta NHC', () => {
    expect(onlyValue('Historia NHC: 1234567 abierta')).toBe('NHC: 1234567')
    expect(onlyValue('Historia NHC 1234567 abierta')).toBe('NHC 1234567')
    expect(onlyValue('Historia NHC:1234567 abierta')).toBe('NHC:1234567')
    expect(detectPii('Historia NHC: 123 abierta')).toEqual([])
  })

  it('acepta la tarjeta agrupada de cuatro en cuatro y la rechaza si Luhn falla', () => {
    expect(typesOf('Tarjeta 4539 5787 6362 1486')).toEqual(['CARD'])
    expect(detectPii('Tarjeta 4539 5787 6362 1487')).toEqual([])
  })

  it('no declara una tarjeta de 12 ni de 20 digitos', () => {
    // Doce digitos no son tarjeta (y sin digito de control valido tampoco son
    // NUSS); veinte se salen del rango de las tarjetas.
    expect(detectPii('281234567841')).toEqual([])
    expect(detectPii('12345678901234567890')).toEqual([])
  })
})

describe('detectPii: solapes por precedencia y posicion', () => {
  it('deja ganar al correo sobre el DNI que lo precede', () => {
    const findings = detectPii('12345678Z@bufete.example')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.type).toBe('EMAIL')
    expect(findings[0]?.value).toBe('12345678Z@bufete.example')
  })

  it('desempata por longitud cuando dos candidatos empiezan en el mismo sitio', () => {
    // Un IBAN valido y un correo que empieza con ese mismo IBAN comparten
    // precedencia y posicion de inicio: gana el mas largo (el correo).
    const findings = detectPii('ES9121000418450200051332@x.es')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.type).toBe('EMAIL')
    expect(findings[0]?.value).toBe('ES9121000418450200051332@x.es')
  })

  it('ordena los hallazgos por posicion', () => {
    const findings = detectPii('612345678 y 12345678Z y HC-9999')
    expect(findings.map(finding => finding.type)).toEqual(['TEL', 'DNI', 'RECORD'])
    expect(findings.map(finding => finding.start)).toEqual([0, 12, 24])
    expect(findings.map(finding => finding.end)).toEqual([9, 21, 31])
  })

  it('devuelve una lista vacia cuando no hay PII', () => {
    expect(detectPii('El cliente llamo por la manana y no dejo nada mas.')).toEqual([])
  })
})
