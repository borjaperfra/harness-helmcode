/**
 * Suite de CABLEADO del canal de redaccion, contra un `Context` de verdad con el
 * `ToolRuntime` real: las dos herramientas se ejecutan por el pipeline de
 * `ctx.tools`, el mapa se sella en un fichero de verdad y la clave sale del
 * credential store local.
 *
 * Lo que se prueba aqui y no en el nucleo puro:
 * - fallo cerrado: clave incorrecta, credencial ausente, sobre corrupto o mapa
 *   ilegible hacen FALLAR la herramienta y no devuelven el texto sin redactar;
 * - determinismo: el mismo valor produce el mismo marcador entre llamadas;
 * - persistencia: dos instancias con el mismo `mapPath` comparten el mapa, y
 *   ninguna de las dos pisa lo que la otra acabo de acunar;
 * - la lectura del fichero va por el seam (`ctx.fs`), con sus errores tipados.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import * as privacy from '../src/index.ts'

/** El DNI de las pruebas: valida el mod-23 (12345678Z). */
const DNI = '12345678Z'
/** Un movil espanol valido. */
const TEL = '612345678'
/** Un correo corriente. */
const EMAIL = 'ana@example.es'

const KEY_REF = 'PRIVACY_MAP_KEY'
const KEY = 'clave-del-perfil'
const WRONG_KEY = 'clave-equivocada'

let callCounter = 0

const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) {
    try {
      await ctx.fiber.dispose()
    } catch (error) {
      // Un montaje que falla a proposito puede dejar el arbol a medias; el
      // arnes no convierte ese fallo en un fallo del test que lo provoco.
      void error
    }
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** El resultado del arnés: contexto montado, rutas y el mapa por defecto del test. */
interface Harness {
  ctx: Context
  root: string
  home: string
  workspace: string
  mapPath: string
}

/**
 * Monta los servicios reales (prompt, tools, credenciales locales y filesystem
 * local) y luego el plugin.
 */
async function harness(options: {
  key?: string | undefined
  mapPath?: string
  mapKeyRef?: string
  ttlDays?: number
  withoutFs?: boolean
} = {}): Promise<Harness> {
  const root = mkdtempSync(join(tmpdir(), 'dsh-privacy-'))
  roots.push(root)
  const home = join(root, 'home')
  const workspace = join(root, 'workspace')
  const mapPath = options.mapPath ?? join(root, 'map.v1')
  mkdirSync(workspace, { recursive: true })

  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(LocalCredentialProvider, { dshHome: home, watch: false, debounceMs: 0 })
  if (options.withoutFs !== true) await ctx.plugin(LocalFileSystem, { cwd: workspace })
  if (options.key !== undefined) await ctx.credentials.set(credentialRef(KEY_REF), options.key)
  await ctx.plugin(privacy, {
    mapPath,
    ...(options.mapKeyRef === undefined ? {} : { mapKeyRef: options.mapKeyRef }),
    ...(options.ttlDays === undefined ? {} : { ttlDays: options.ttlDays }),
  })
  return { ctx, root, home, workspace, mapPath }
}

/** Ejecuta una herramienta por el pipeline real, con o sin sesion (cwd). */
function call(h: Harness, name: string, args: unknown, withSession = false): Promise<ToolExecutionResult> {
  return h.ctx.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId(`call-${++callCounter}`),
    name,
    arguments: args,
    ...(withSession ? { agent: { session: { header: { cwd: h.workspace } } } as never } : {}),
  })
}

/** El texto model-facing de un resultado. */
function textOf(result: ToolExecutionResult): string {
  return result.content.map(block => ('text' in block ? block.text : '')).join('')
}

/** El contenido redactado de un resultado correcto (debajo de la cabecera). */
function bodyOf(result: ToolExecutionResult): string {
  expect(result.isError).toBe(false)
  return textOf(result).split('\n\n').slice(1).join('\n\n')
}

/** El mapa que hay en disco, abierto con la clave del test. */
function mapOnDisk(mapPath: string, key: string): privacy.RedactionMap {
  return privacy.RedactionMap.parse(privacy.open(readFileSync(mapPath, 'utf8'), key))
}

describe('registro de las herramientas', () => {
  it('publica `anonymize` y `workspace_read_anonymized` con sus parametros', async () => {
    const h = await harness({ key: KEY })
    const schemas = h.ctx.tools.schemas()
    const anonymize = schemas.find(schema => schema.name === 'anonymize')
    const read = schemas.find(schema => schema.name === 'workspace_read_anonymized')
    expect(anonymize).toBeDefined()
    expect(read).toBeDefined()
    // La descripcion declara el compromiso: el ORIGINAL se queda en el log local.
    expect(anonymize?.description).toContain('local session log')
    expect(read?.description).toContain('local session log')
    const properties = (read?.parameters as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(properties).sort()).toEqual(['maxBytes', 'path'])
  })

  it('rechaza un ttlDays que no es un numero de dias positivo', async () => {
    const h = await harness({ key: KEY })
    // `apply` valida antes de registrar: un ttlDays sin sentido no deja el canal
    // a medias con una caducidad que nadie pidio.
    expect(() => { privacy.apply(h.ctx, { ttlDays: 0 }) }).toThrow(/ttlDays must be a positive number of days/)
    expect(() => { privacy.apply(h.ctx, { ttlDays: Number.NaN }) }).toThrow(/ttlDays must be a positive number/)
  })
})

describe('anonymize', () => {
  it('redacta, cuenta por tipo, sella el mapa y lo deja restaurable', async () => {
    const h = await harness({ key: KEY })
    const result = await call(h, 'anonymize', { text: `DNI ${DNI}, movil ${TEL} y correo ${EMAIL}.` })

    expect(result.isError).toBe(false)
    expect(textOf(result)).toContain('Redacted 3 value(s)')
    expect(textOf(result)).toContain('DNI 1')
    expect(textOf(result)).toContain('TEL 1')
    expect(textOf(result)).toContain('EMAIL 1')
    expect(textOf(result)).toContain('Map sealed and saved')
    expect(bodyOf(result)).toBe('DNI [DNI_1], movil [TEL_1] y correo [EMAIL_1].')
    // El valor original NO viaja al modelo en el resultado.
    expect(textOf(result)).not.toContain(DNI)
    expect(textOf(result)).not.toContain(TEL)

    // El mapa quedo sellado en la ruta configurada y restaura el texto.
    const map = mapOnDisk(h.mapPath, KEY)
    expect(privacy.restoreText(bodyOf(result), map).text).toBe(`DNI ${DNI}, movil ${TEL} y correo ${EMAIL}.`)
    // El cerrojo se libera: no queda un `.lock` huerfano.
    expect(existsSync(`${h.mapPath}.lock`)).toBe(false)
  })

  it('dice que no ha visto PII, sin afirmar certeza, y no escribe mapa', async () => {
    const h = await harness({ key: KEY })
    const result = await call(h, 'anonymize', { text: 'Una frase sin datos personales.' })

    expect(result.isError).toBe(false)
    // El mensaje declara lo que NO se cubre en vez de afirmar que no hay PII.
    expect(textOf(result)).toContain('No se detectaron patrones de PII española')
    expect(textOf(result)).toContain('no se cubren automáticamente')
    expect(textOf(result)).not.toContain('No Spanish PII was detected')
    expect(bodyOf(result)).toBe('Una frase sin datos personales.')
    expect(existsSync(h.mapPath)).toBe(false)
  })

  it('es determinista: el mismo valor da el mismo marcador y no reescribe el mapa', async () => {
    const h = await harness({ key: KEY })
    const first = await call(h, 'anonymize', { text: `DNI ${DNI}.` })
    const second = await call(h, 'anonymize', { text: `DNI ${DNI}.` })
    const third = await call(h, 'anonymize', { text: `otra vez ${DNI} y el movil ${TEL}.` })

    expect(bodyOf(first)).toBe('DNI [DNI_1].')
    expect(bodyOf(second)).toBe('DNI [DNI_1].')
    expect(textOf(second)).toContain('Map unchanged')
    // El marcador de un valor ya visto se conserva aunque llegue con otro texto.
    expect(bodyOf(third)).toBe('otra vez [DNI_1] y el movil [TEL_1].')
    expect(mapOnDisk(h.mapPath, KEY).toJSON()).toContain('[DNI_1]')
  })

  it('acuna la caducidad declarada en las entradas nuevas', async () => {
    const h = await harness({ key: KEY, ttlDays: 30 })
    const before = Date.now()
    const result = await call(h, 'anonymize', { text: `DNI ${DNI}.` })
    const after = Date.now()

    expect(result.isError).toBe(false)
    const entry = mapOnDisk(h.mapPath, KEY).lookup(DNI)
    expect(entry?.createdAt).toBeDefined()
    expect(entry?.expiresAt).toBeDefined()
    const expiresAt = Date.parse(entry?.expiresAt as string)
    // 30 dias exactos desde la marca de creacion de la entrada.
    expect(expiresAt - Date.parse(entry?.createdAt as string)).toBe(30 * 86_400_000)
    expect(expiresAt).toBeGreaterThanOrEqual(before + 30 * 86_400_000)
    expect(expiresAt).toBeLessThanOrEqual(after + 30 * 86_400_000)
    // Una entrada ya presente conserva su caducidad original.
    const again = await call(h, 'anonymize', { text: `DNI ${DNI}.` })
    expect(textOf(again)).toContain('Map unchanged')
    expect(mapOnDisk(h.mapPath, KEY).lookup(DNI)?.expiresAt).toBe(entry?.expiresAt)
  })
})

describe('persistencia entre instancias', () => {
  it('la segunda instancia lee el mapa sellado y reproduce el mismo marcador', async () => {
    const first = await harness({ key: KEY })
    expect(bodyOf(await call(first, 'anonymize', { text: `DNI ${DNI}.` }))).toBe('DNI [DNI_1].')

    const second = await harness({ key: KEY, mapPath: first.mapPath })
    const result = await call(second, 'anonymize', { text: `DNI ${DNI}.` })
    expect(bodyOf(result)).toBe('DNI [DNI_1].')
    expect(textOf(result)).toContain('Map unchanged')
  })

  it('dos instancias vivas no se pisan lo que la otra acuno', async () => {
    const first = await harness({ key: KEY })
    const second = await harness({ key: KEY, mapPath: first.mapPath })

    expect(bodyOf(await call(first, 'anonymize', { text: `DNI ${DNI}.` }))).toBe('DNI [DNI_1].')
    // La segunda no habia cargado nada todavia: al usarse, adopta el sobre de
    // disco y anade lo suyo encima.
    expect(bodyOf(await call(second, 'anonymize', { text: `Correo ${EMAIL}.` }))).toBe('Correo [EMAIL_1].')
    // La primera relee el sobre cambiado antes de acunar: conserva ambos.
    expect(bodyOf(await call(first, 'anonymize', { text: `Movil ${TEL}.` }))).toBe('Movil [TEL_1].')

    const map = mapOnDisk(first.mapPath, KEY)
    expect(map.lookup(DNI)?.placeholder).toBe('[DNI_1]')
    expect(map.lookup(EMAIL)?.placeholder).toBe('[EMAIL_1]')
    expect(map.lookup(TEL)?.placeholder).toBe('[TEL_1]')
  })
})

describe('fallo cerrado', () => {
  it('con la clave incorrecta la herramienta falla y NO devuelve el texto', async () => {
    const first = await harness({ key: KEY })
    await call(first, 'anonymize', { text: `DNI ${DNI}.` })

    const second = await harness({ key: WRONG_KEY, mapPath: first.mapPath })
    const result = await call(second, 'anonymize', { text: `DNI ${DNI}.` })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('cannot decrypt the sealed map')
    expect(textOf(result)).toContain('refuse')
    // Ni el original ni un texto a medias: la herramienta se niega.
    expect(textOf(result)).not.toContain(DNI)
    expect(textOf(result)).not.toContain('[DNI_1]')
  })

  it('sin credencial configurada la herramienta falla y NO devuelve el texto', async () => {
    const h = await harness({})
    const result = await call(h, 'anonymize', { text: `DNI ${DNI}.` })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain(`no credential is configured for ${KEY_REF}`)
    expect(textOf(result)).not.toContain(DNI)
    expect(existsSync(h.mapPath)).toBe(false)
  })

  it('con una referencia de credencial invalida la herramienta falla y lo dice', async () => {
    const h = await harness({ key: KEY, mapKeyRef: 'no es una referencia' })
    const result = await call(h, 'anonymize', { text: `DNI ${DNI}.` })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('is not a valid credential reference')
    expect(textOf(result)).not.toContain(DNI)
  })

  it('un sobre que descifra pero no es un mapa falla cerrado', async () => {
    const h = await harness({ key: KEY })
    writeFileSync(h.mapPath, privacy.seal('{"no":"es un mapa"}', KEY))

    const result = await call(h, 'anonymize', { text: `DNI ${DNI}.` })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('does not hold a valid map document')
    expect(textOf(result)).not.toContain(DNI)
  })

  it('un mapa ilegible (la ruta es un directorio) falla cerrado', async () => {
    const h = await harness({ key: KEY })
    mkdirSync(h.mapPath, { recursive: true })

    const result = await call(h, 'anonymize', { text: `DNI ${DNI}.` })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('cannot read the sealed map')
    expect(textOf(result)).not.toContain(DNI)
  })
})

describe('el seam `privacy`', () => {
  /** El seam montado por el plugin, afirmado: sin el, la prueba no mide nada. */
  function seamOf(ctx: Context): privacy.PrivacySeam {
    const seam = ctx.privacy
    if (seam === undefined) throw new Error('el plugin no monto el seam `privacy`')
    return seam
  }

  it('redacta con el MISMO mapa y los mismos marcadores que `anonymize`', async () => {
    const h = await harness({ key: KEY })

    const throughTool = bodyOf(await call(h, 'anonymize', { text: `DNI ${DNI}.` }))
    const throughSeam = await seamOf(h.ctx).redact(`Movil ${TEL} y DNI ${DNI}.`)

    expect(throughTool).toBe('DNI [DNI_1].')
    // El marcador del DNI es el que acuno la herramienta: un solo mapa.
    expect(throughSeam).toBe('Movil [TEL_1] y DNI [DNI_1].')
    expect(mapOnDisk(h.mapPath, KEY).lookup(TEL)?.placeholder).toBe('[TEL_1]')
  })

  it('falla cerrado sin credencial en vez de devolver el texto sin redactar', async () => {
    const h = await harness({})

    const outcome = await seamOf(h.ctx).redact(`DNI ${DNI}.`).then(
      () => undefined,
      (error: unknown) => error,
    )

    expect(outcome).toBeInstanceOf(Error)
    expect((outcome as Error).message).toContain(`no credential is configured for ${KEY_REF}`)
    expect(String(outcome)).not.toContain(DNI)
  })
})

describe('workspace_read_anonymized', () => {
  it('lee por el seam, redacta y devuelve el mismo marcador que `anonymize`', async () => {
    const h = await harness({ key: KEY })
    writeFileSync(join(h.workspace, 'notas.txt'), `Titular: ${DNI}\nContacto: ${TEL}\n`)
    expect(bodyOf(await call(h, 'anonymize', { text: `DNI ${DNI}.` }))).toBe('DNI [DNI_1].')

    const result = await call(h, 'workspace_read_anonymized', { path: 'notas.txt' }, true)

    expect(result.isError).toBe(false)
    expect(bodyOf(result)).toBe('Titular: [DNI_1]\nContacto: [TEL_1]\n')
    expect(textOf(result)).toContain('Map sealed and saved')
    // El fichero en disco NO se toca.
    expect(readFileSync(join(h.workspace, 'notas.txt'), 'utf8')).toContain(DNI)
  })

  it('resuelve la ruta relativa contra el cwd de la sesion', async () => {
    const h = await harness({ key: KEY })
    mkdirSync(join(h.workspace, 'docs'))
    writeFileSync(join(h.workspace, 'docs', 'ficha.txt'), `DNI ${DNI}\n`)

    const result = await call(h, 'workspace_read_anonymized', { path: join('docs', 'ficha.txt') }, true)

    expect(result.isError).toBe(false)
    expect(bodyOf(result)).toBe('DNI [DNI_1]\n')
  })

  it('sin sesion deja la resolucion al backend, que es quien tiene un cwd por defecto', async () => {
    const h = await harness({ key: KEY })
    writeFileSync(join(h.workspace, 'suelto.txt'), `DNI ${DNI}\n`)

    const result = await call(h, 'workspace_read_anonymized', { path: 'suelto.txt' })

    expect(result.isError).toBe(false)
    expect(bodyOf(result)).toBe('DNI [DNI_1]\n')
  })

  it('informa de un fichero que no existe y de uno que no es regular', async () => {
    const h = await harness({ key: KEY })
    const missing = await call(h, 'workspace_read_anonymized', { path: 'no-existe.txt' }, true)
    const directory = await call(h, 'workspace_read_anonymized', { path: '.' }, true)

    expect(missing.isError).toBe(true)
    expect(textOf(missing)).toContain('not found')
    expect(directory.isError).toBe(true)
    expect(textOf(directory)).toContain('not a regular file')
  })

  it('se niega a leer por encima del limite en vez de truncar', async () => {
    const h = await harness({ key: KEY })
    writeFileSync(join(h.workspace, 'largo.txt'), `DNI ${DNI} y relleno hasta pasar el limite.`)

    const result = await call(h, 'workspace_read_anonymized', { path: 'largo.txt', maxBytes: 8 }, true)

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('exceed the 8-byte cap')
    expect(textOf(result)).toContain('cut a value in half')
    expect(textOf(result)).not.toContain(DNI)
  })

  it('rechaza un maxBytes que no es un entero positivo', async () => {
    const h = await harness({ key: KEY })
    writeFileSync(join(h.workspace, 'corto.txt'), `DNI ${DNI}\n`)

    const zero = await call(h, 'workspace_read_anonymized', { path: 'corto.txt', maxBytes: 0 }, true)
    // Un entero que no cabe en el rango seguro tampoco vale como limite.
    const huge = await call(h, 'workspace_read_anonymized', { path: 'corto.txt', maxBytes: 1e21 }, true)

    expect(zero.isError).toBe(true)
    expect(textOf(zero)).toContain('maxBytes must be a positive integer')
    expect(huge.isError).toBe(true)
    expect(textOf(huge)).toContain('maxBytes must be a positive integer')
  })

  it('sin seam de ficheros se niega en vez de leer por fuera', async () => {
    const h = await harness({ key: KEY, withoutFs: true })
    const result = await call(h, 'workspace_read_anonymized', { path: 'lo-que-sea.txt' }, true)

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('filesystem seam')
    expect(textOf(result)).toContain('refused')
  })

  it('comprueba el limite tambien cuando el backend no declara el tamano', async () => {
    // Un backend que no informa `size` en `stat`: el limite se comprueba sobre
    // los bytes ya leidos. Se sustituye el servicio por un doble minimo.
    const h = await harness({ key: KEY, withoutFs: true })
    h.ctx.provide('fs', {
      resolve: async (path: string) => ({ targetKey: path, displayPath: path }),
      stat: async () => ({ version: 'v1', type: 'file' }),
      readText: async () => `DNI ${DNI}\n`,
    } as never)

    const limited = await call(h, 'workspace_read_anonymized', { path: 'ficha.txt', maxBytes: 4 }, true)
    const allowed = await call(h, 'workspace_read_anonymized', { path: 'ficha.txt', maxBytes: 64 }, true)

    expect(limited.isError).toBe(true)
    expect(textOf(limited)).toContain('exceed the 4-byte cap')
    expect(allowed.isError).toBe(false)
    expect(bodyOf(allowed)).toBe('DNI [DNI_1]\n')
  })
})
