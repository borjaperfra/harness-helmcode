/**
 * Cobertura de la CLI del generador: la decodificación tolerante del volcado
 * (UTF-16LE/BE, BOM UTF-8, preámbulo de PowerShell), los dos formatos del
 * catálogo de residencia, el barrido de telemetría, los argumentos, la versión
 * del generador, la ejecución completa sobre el fixture y el glue de invocación
 * directa.
 *
 * El glue de entrada se ejecuta importando una instancia nueva del módulo con
 * `process.argv[1]` apuntando al propio fichero (o ausente), que es la única
 * forma de recorrerlo desde el proceso de pruebas; la query saca al módulo de la
 * caché sin duplicar la instrumentación.
 *
 * @module @deepseek-ai/dsh-compliance-evidence/tests/cli
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  decodeDumpBytes,
  generatorVersion,
  main,
  parseArguments,
  parseConfigDump,
  residencyFromCatalog,
  telemetryEvidence,
  USAGE,
} from '../src/cli.ts'
import { dumpRows } from '../src/index.ts'

type CliModule = typeof import('../src/cli.ts')

const DUMP_TEXT = readFileSync(new URL('./fixtures/dump.fixture.yml', import.meta.url), 'utf8')

/** Versión declarada por el `package.json` del paquete, leída sin mocks. */
const PACKAGE_VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string
}).version

/** La ruta del módulo, que es lo que `argv[1]` trae cuando él es el entry. */
const CLI_ENTRY = fileURLToPath(new URL('../src/cli.ts', import.meta.url))

const WORK = mkdtempSync(join(tmpdir(), 'dsh-compliance-evidence-'))
const DUMP_PATH = join(WORK, 'dump.yml')
const CATALOG_PATH = join(WORK, 'catalog.json')
writeFileSync(DUMP_PATH, DUMP_TEXT)
writeFileSync(CATALOG_PATH, JSON.stringify({ provider: 'helmcode', models: [{ id: 'deepseek-v4-flash', residency: 'eu' }] }))

afterAll(() => {
  rmSync(WORK, { recursive: true, force: true })
})

/** Una instancia nueva del módulo: la query la saca de la caché del runner. */
async function freshCli(suffix: string): Promise<CliModule> {
  const specifier = `../src/cli.ts?${suffix}`
  return (await import(specifier)) as CliModule
}

/** Captura stdout y stderr para no ensuciar la salida del lane. */
function capture(): { out: string[]; err: string[]; restore: () => void } {
  const out: string[] = []
  const err: string[] = []
  const sink = (target: string[]) => (chunk: string | Uint8Array): boolean => {
    target.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'))
    return true
  }
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(sink(out))
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(sink(err))
  return { out, err, restore: () => { stdout.mockRestore(); stderr.mockRestore() } }
}

describe('decodeDumpBytes: tolerancias medidas sobre volcados reales', () => {
  const YAML_TEXT = '# == capa\n- id: a\n  name: b\n'

  it('decodifica UTF-16BE con BOM y lo dice', () => {
    const body = Buffer.from(YAML_TEXT, 'utf16le')
    body.swap16() // UTF-16LE ⇄ UTF-16BE: mismos pares de bytes, otro orden.
    const decoded = decodeDumpBytes(Buffer.concat([Buffer.from([0xfe, 0xff]), body]))
    expect(decoded.warnings.join(' | ')).toContain('UTF-16BE')
    expect(parseConfigDump(decoded.text)).toEqual([{ id: 'a', name: 'b' }])
  })

  it('descarta el BOM UTF-8 y lo dice', () => {
    const decoded = decodeDumpBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(YAML_TEXT, 'utf8')]),
    )
    expect(decoded.warnings.join(' | ')).toContain('BOM UTF-8')
    expect(parseConfigDump(decoded.text)).toEqual([{ id: 'a', name: 'b' }])
  })

  it('no busca preámbulo cuando la primera línea ya es YAML', () => {
    const decoded = decodeDumpBytes(Buffer.from('clave: 1\n', 'utf8'))
    expect(decoded.warnings).toEqual([])
    expect(decoded.text).toBe('clave: 1\n')
  })
})

describe('parseConfigDump', () => {
  it('conserva un `!!js` sin texto como marcador nulo, sin evaluarlo', () => {
    expect(parseConfigDump('- id: a\n  name: b\n  disabled: !!js\n')).toEqual([
      { id: 'a', name: 'b', disabled: { $js: 'null' } },
    ])
  })
})

describe('residencyFromCatalog: catálogos que no se pueden leer', () => {
  it('falla cuando el catálogo no es un objeto JSON', () => {
    expect(() => residencyFromCatalog(null, {})).toThrow(/objeto JSON/)
    expect(() => residencyFromCatalog(['no-es-un-catálogo'], {})).toThrow(/objeto JSON/)
  })

  it('ignora las entradas de modelo que no declaran `id` de cadena', () => {
    const table = residencyFromCatalog(
      { provider: 'p', models: ['no-es-un-modelo', { residency: 'us' }, { id: 'ok', residency: 'eu' }] },
      {},
    )
    expect(table).toEqual({ 'p/ok': 'eu' })
  })
})

describe('telemetryEvidence', () => {
  it('distingue la fila activa (`disabled: false`) de la condicional (`!!js`)', () => {
    const activa = telemetryEvidence(
      dumpRows([{ id: 'session-telemetry-otel', name: '@deepseek-ai/dsh-session-telemetry-otel', disabled: false }]),
      't0',
    )
    expect(activa.mounted).toBe(true)
    expect(activa.method).not.toContain('no la evalúa')

    const condicional = telemetryEvidence(
      dumpRows([
        {
          id: 'session-telemetry-otel',
          name: '@deepseek-ai/dsh-session-telemetry-otel',
          disabled: { $js: "process.env.DSH_TELEMETRY_MODE !== 'DISABLED'" },
        },
      ]),
      't1',
    )
    expect(condicional.rows).toEqual(['session-telemetry-otel'])
    expect(condicional.method).toContain('1 fila(s) traen un `disabled` que es una expresión `!!js`')
  })
})

describe('generatorVersion', () => {
  it('lee la versión del `package.json` del paquete', () => {
    expect(generatorVersion()).toBe(PACKAGE_VERSION)
  })

  it('falla si el documento no declara una versión de cadena', async () => {
    // Dos formas de documento ilegible: un JSON que no es objeto y uno que sí lo
    // es pero sin `version` de cadena. Ambas acaban en el mismo error declarado.
    for (const contents of ['[]', '{"version": 7}']) {
      vi.doMock('node:fs', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:fs')>()
        return { ...actual, readFileSync: () => contents }
      })
      try {
        const fresh = await freshCli(`version-ilegible-${contents.length}`)
        expect(() => fresh.generatorVersion()).toThrow(/no se pudo leer la versión/)
      } finally {
        vi.doUnmock('node:fs')
      }
    }
  })
})

describe('parseArguments: errores declarados en vez de adivinados', () => {
  it('rechaza un `--provider` sin valor, un argumento desconocido y los sobrantes', () => {
    expect(() => parseArguments(['a.yml', 'b.json', '--provider'])).toThrow(/--provider necesita un valor/)
    expect(() => parseArguments(['a.yml', '--wat', 'b.json'])).toThrow(/argumento no reconocido: --wat/)
    expect(() => parseArguments(['a.yml', 'b.json', 'c.json'])).toThrow(/sobran argumentos: c.json/)
  })

  it('ignora un hueco sin valor en argv', () => {
    const argv = ['a.yml', undefined, 'b.json'] as string[]
    expect(parseArguments(argv)).toEqual({ dumpPath: 'a.yml', catalogPath: 'b.json' })
  })
})

describe('main: la CLI completa sobre el fixture', () => {
  it('escribe el informe en stdout y devuelve 0', () => {
    const io = capture()
    try {
      expect(main([DUMP_PATH, CATALOG_PATH])).toBe(0)
      const report = io.out.join('')
      expect(report).toContain('# Informe de evidencia')
      expect(report).toContain('## 10. Huella')
      expect(io.err).toEqual([])
    } finally {
      io.restore()
    }
  })

  it('acepta `--provider` y la forma mapa del catálogo', () => {
    const mapPath = join(WORK, 'map.json')
    writeFileSync(mapPath, JSON.stringify({ 'helmcode/deepseek-v4-flash': 'eu' }))
    const io = capture()
    try {
      expect(main([DUMP_PATH, mapPath, '--provider', 'helmcode'])).toBe(0)
      expect(io.out.join('')).toContain('residencia declarada: **eu**')
    } finally {
      io.restore()
    }
  })

  it('avisa por stderr de lo que toleró al leer el volcado', () => {
    const utf16 = join(WORK, 'dump-utf16le.yml')
    writeFileSync(utf16, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(DUMP_TEXT, 'utf16le')]))
    const io = capture()
    try {
      expect(main([utf16, CATALOG_PATH])).toBe(0)
      expect(io.err.join('')).toContain('UTF-16LE')
    } finally {
      io.restore()
    }
  })

  it('informa del error de entrada, con el uso, y devuelve 1', () => {
    const io = capture()
    try {
      expect(main([join(WORK, 'no-existe.yml'), CATALOG_PATH])).toBe(1)
      const err = io.err.join('')
      expect(err).toContain('no-existe.yml')
      expect(err).toContain(USAGE)
    } finally {
      io.restore()
    }
  })

  it('informa un fallo que no es `Error` con `String(error)`', async () => {
    vi.doMock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>()
      return {
        ...actual,
        readFileSync: () => {
          const thrown: unknown = 'fallo sin Error'
          throw thrown
        },
      }
    })
    const io = capture()
    try {
      const fresh = await freshCli('fallo-sin-error')
      expect(fresh.main(['a.yml', 'b.json'])).toBe(1)
      expect(io.err.join('')).toContain('fallo sin Error')
    } finally {
      io.restore()
      vi.doUnmock('node:fs')
    }
  })
})

describe('glue de invocación directa', () => {
  it('ejecuta la CLI cuando el módulo es el proceso que arranca', async () => {
    const savedArgv = process.argv
    const savedExitCode = process.exitCode
    const io = capture()
    process.argv = ['node', CLI_ENTRY, DUMP_PATH, CATALOG_PATH]
    try {
      const fresh = await freshCli('entry-directo')
      expect(typeof fresh.main).toBe('function')
      expect(process.exitCode).toBe(0)
      expect(io.out.join('')).toContain('## 10. Huella')
    } finally {
      io.restore()
      process.argv = savedArgv
      process.exitCode = savedExitCode
    }
  })

  it('no arranca nada cuando argv no trae script de entrada', async () => {
    const savedArgv = process.argv
    const savedExitCode = process.exitCode
    process.argv = ['node']
    try {
      await freshCli('entry-ausente')
      expect(process.exitCode).toBeUndefined()
    } finally {
      process.argv = savedArgv
      process.exitCode = savedExitCode
    }
  })
})
