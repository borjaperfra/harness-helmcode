import { describe, expect, it } from 'vitest'

import { open, seal, SEAL_VERSION, SealError } from '../src/seal.ts'

/** El sobre sellado, en la forma versionada del brief. */
const FIELDS = 4

/** Los campos de un sobre, para reescribir uno solo en las pruebas de manipulacion. */
const fieldsOf = (sealed: string): string[] => sealed.split(':')

describe('seal/open: ida y vuelta', () => {
  it('sella con el formato versionado y abre con la clave correcta', () => {
    const sealed = seal('{"entries":[]}', 'clave-del-perfil')
    expect(fieldsOf(sealed)).toHaveLength(FIELDS)
    expect(fieldsOf(sealed)[0]).toBe(SEAL_VERSION)
    expect(open(sealed, 'clave-del-perfil')).toBe('{"entries":[]}')
  })

  it('no repite el criptograma entre sellados del mismo contenido', () => {
    expect(seal('mismo texto', 'clave')).not.toBe(seal('mismo texto', 'clave'))
  })

  it('abre un texto vacio y un texto con acentos', () => {
    expect(open(seal('', 'clave'), 'clave')).toBe('')
    expect(open(seal('Doña Ana Pérez: 12345678Z', 'clave'), 'clave')).toBe('Doña Ana Pérez: 12345678Z')
  })
})

describe('open: fallo cerrado', () => {
  /** Ejecuta `open` y devuelve lo que lanzo (o undefined si no lanzo). */
  const failure = (sealed: string, password: string): unknown => {
    try {
      open(sealed, password)
      return undefined
    } catch (caught) {
      return caught
    }
  }

  it('niega con error tipado cuando la clave no es la buena', () => {
    const sealed = seal('{"entries":[]}', 'clave-del-perfil')
    const error = failure(sealed, 'clave-equivocada')
    expect(error).toBeInstanceOf(SealError)
    expect((error as SealError).name).toBe('SealError')
    expect((error as SealError).code).toBe('seal-open-failed')
    expect((error as SealError).message).toContain('wrong password or tampered ciphertext')
  })

  it('niega cuando el criptograma fue manipulado', () => {
    const fields = fieldsOf(seal('{"entries":[]}', 'clave'))
    const ciphertext = Buffer.from(fields[3] as string, 'base64')
    ciphertext[0] = (ciphertext[0] as number) ^ 0xff
    fields[3] = ciphertext.toString('base64')
    expect(failure(fields.join(':'), 'clave')).toBeInstanceOf(SealError)
  })

  it('niega cuando la etiqueta de autenticacion fue manipulada', () => {
    const fields = fieldsOf(seal('{"entries":[]}', 'clave'))
    const tag = Buffer.from(fields[2] as string, 'base64')
    tag[0] = (tag[0] as number) ^ 0xff
    fields[2] = tag.toString('base64')
    expect(failure(fields.join(':'), 'clave')).toBeInstanceOf(SealError)
  })

  it('niega un sobre con un numero de campos distinto', () => {
    expect(failure('v1:aaa:bbb', 'clave')).toBeInstanceOf(SealError)
    expect(failure('v1:aaa:bbb:ccc:ddd', 'clave')).toBeInstanceOf(SealError)
    expect(failure('v1:aaa:bbb:ccc', 'clave')).toBeInstanceOf(SealError)
    expect((failure('v1:aaa:bbb', 'clave') as SealError).message).toContain('must have 4 fields, got 3')
  })

  it('niega una version de formato desconocida', () => {
    const fields = fieldsOf(seal('{"entries":[]}', 'clave'))
    fields[0] = 'v2'
    const error = failure(fields.join(':'), 'clave')
    expect(error).toBeInstanceOf(SealError)
    expect((error as SealError).message).toContain('unsupported seal version v2')
  })
})
