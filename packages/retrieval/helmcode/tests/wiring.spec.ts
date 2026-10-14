/**
 * Suite de CABLEADO de la recuperacion, contra un `Context` de verdad con el
 * `ToolRuntime` real: el seam `ctx.retrieval`, las CUATRO herramientas por el
 * pipeline de `ctx.tools`, el indice en un fichero de verdad y la clave en el
 * credential store local.
 *
 * Lo que se prueba aqui y no en el nucleo puro:
 * - el egreso declarado: las descripciones dicen a que API se llama;
 * - fallo cerrado: sin clave, con una referencia invalida, sin transporte global,
 *   sin seam web o con AUTH/CREDITS las herramientas fallan con su codigo y su
 *   causa, y no devuelven resultados;
 * - los no-ops declarados: un documento sin texto, un indice sin trozos, un
 *   perfil sin fuentes y una URL sin texto se DICEN, no se convierten en errores;
 * - el informe por fuente de `index_workspace`, que no revierte lo ya indexado;
 * - la particion por workspace: dos proyectos con la MISMA fuente no se pisan;
 * - `index_url` por el seam web y `export_audit` con y sin mapa de redaccion.
 *
 * NINGUNA prueba abre un socket: `globalThis.fetch` se sustituye por un doble que
 * responde a los dos endpoints (embeddings de 4096 dimensiones y rerank), se
 * restaura al terminar cada prueba y se puede cambiar entre dos llamadas, porque
 * el servicio lo lee en CADA operacion. El seam web y el de privacidad se
 * proveen como dobles minimos en las pruebas que los necesitan.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
import * as retrieval from '../src/index.ts'

/** La referencia y el valor de la clave que usan las pruebas. */
const KEY_REF = 'HELMCODE_API_KEY'
const KEY = 'clave-de-helmcode'

/** Un vector de 4096 dimensiones, como el que declara `qwen3-embedding`. */
const EMBEDDING: readonly number[] = Array.from({ length: 4096 }, (_value, index) => (index === 0 ? 1 : 0))

/** Un parrafo de mas de un trozo: 60 repeticiones de 27 caracteres. */
const LONG_PARAGRAPH = 'lorem ipsum dolor sit amet '.repeat(60)

/** La particion de un cwd, tal como la calcula el cableado. */
const workspaceOf = (path: string): string => retrieval.workspaceIdOf(path)

let callCounter = 0

const roots: string[] = []
const contexts: Context[] = []
const originalFetch: typeof fetch = globalThis.fetch

afterEach(async () => {
  globalThis.fetch = originalFetch
  for (const ctx of contexts.splice(0)) {
    try {
      await ctx.fiber.dispose()
    } catch (error) {
      // Un montaje que falla a proposito puede dejar el arbol a medias; el arnes
      // no convierte ese fallo en un fallo del test que lo provoco.
      void error
    }
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** El doble de transporte y las llamadas que ha visto. */
interface TransportDouble {
  /** El `fetch` instalable como global. */
  readonly fetch: typeof fetch
  /** Las URLs pedidas, en orden. */
  readonly calls: string[]
}

/**
 * Un `fetch` doble para los dos endpoints de Helmcode, sin abrir un socket.
 *
 * @param options - estado HTTP de cada llamada de embeddings (el ultimo se
 * repite), si el rerank contesta vacio y las puntuaciones por documento.
 * @returns el doble y las URLs que ha visto.
 */
function helmcodeDouble(options: {
  embedStatuses?: readonly number[]
  rerankScores?: readonly number[]
  rerankEmpty?: true
} = {}): TransportDouble {
  const calls: string[] = []
  const statuses = options.embedStatuses ?? [200]
  let embeddings = 0
  const fetchImpl: typeof fetch = (input, init) => {
    const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
    calls.push(url)
    const rawBody = init?.body
    const body = JSON.parse(typeof rawBody === 'string' ? rawBody : '{}') as {
      input?: readonly string[]
      documents?: readonly string[]
    }
    if (url.endsWith('/v1/embeddings')) {
      const status = statuses[Math.min(embeddings, statuses.length - 1)] ?? 200
      embeddings += 1
      if (status !== 200) return Promise.resolve(new Response('{"error":"rechazado"}', { status }))
      return Promise.resolve(Response.json({
        data: (body.input ?? []).map((_text, index) => ({ index, embedding: EMBEDDING })),
      }))
    }
    if (url.endsWith('/v1/rerank')) {
      const documents = body.documents ?? []
      const scores = options.rerankScores ?? []
      return Promise.resolve(Response.json({
        results: options.rerankEmpty === true
          ? []
          : documents.map((_document, index) => ({ index, relevance_score: scores[index] ?? 0 })),
      }))
    }
    return Promise.resolve(new Response('no manejado por el doble', { status: 404 }))
  }
  return { fetch: fetchImpl, calls }
}

/** El resultado del arnes: contexto montado, rutas y el doble del transporte. */
interface Harness {
  ctx: Context
  root: string
  workspace: string
  indexPath: string
  transport: TransportDouble
}

/**
 * Monta los servicios reales (prompt, tools, credenciales locales y filesystem
 * local), instala el doble de transporte y luego el plugin.
 */
async function harness(options: {
  key?: string | undefined
  keyRef?: string
  sources?: Record<string, string>
  indexPath?: string
  withoutIndexPath?: true
  topK?: number
  topN?: number
  withoutFs?: boolean
  transport?: TransportDouble
  workspace?: string
} = {}): Promise<Harness> {
  const root = mkdtempSync(join(tmpdir(), 'dsh-retrieval-'))
  roots.push(root)
  const home = join(root, 'home')
  // Un workspace se puede REUTILIZAR (persistencia) o nacer con el arnes.
  const workspace = options.workspace ?? join(root, 'workspace')
  const indexPath = options.indexPath ?? join(root, 'index.sqlite')
  mkdirSync(workspace, { recursive: true })

  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(LocalCredentialProvider, { dshHome: home, watch: false, debounceMs: 0 })
  if (options.withoutFs !== true) await ctx.plugin(LocalFileSystem, { cwd: workspace })
  if (options.key !== undefined) await ctx.credentials.set(credentialRef(KEY_REF), options.key)
  const transport = options.transport ?? helmcodeDouble()
  globalThis.fetch = transport.fetch
  await ctx.plugin(retrieval, {
    ...(options.withoutIndexPath === true ? {} : { indexPath }),
    ...(options.keyRef === undefined ? {} : { apiKeyRef: options.keyRef }),
    ...(options.sources === undefined ? {} : { sources: options.sources }),
    ...(options.topK === undefined ? {} : { topK: options.topK }),
    ...(options.topN === undefined ? {} : { topN: options.topN }),
  })
  return { ctx, root, workspace, indexPath, transport }
}

/**
 * Ejecuta una herramienta por el pipeline real, con o sin sesion (cwd).
 *
 * @param h - el arnes montado.
 * @param name - nombre de la herramienta.
 * @param args - argumentos.
 * @param withSession - si la llamada lleva una sesion con el cwd del workspace.
 * @param session - una sesion explicita (el log de `export_audit`), que sustituye
 * a la del cwd.
 */
function call(
  h: Harness,
  name: string,
  args: unknown,
  withSession = false,
  session?: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const agent = session !== undefined
    ? { session }
    : withSession ? { session: { header: { cwd: h.workspace } } } : undefined
  return h.ctx.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId(`call-${++callCounter}`),
    name,
    arguments: args,
    ...(agent === undefined ? {} : { agent: agent as never }),
  })
}

/** El texto model-facing de un resultado. */
function textOf(result: ToolExecutionResult): string {
  return result.content.map(block => ('text' in block ? block.text : '')).join('')
}

/** Escribe una fuente del workspace y la devuelve por su nombre logico. */
function writeSource(workspace: string, name: string, text: string): void {
  const nested = name.includes('/')
  if (nested) mkdirSync(join(workspace, name.slice(0, name.lastIndexOf('/'))), { recursive: true })
  writeFileSync(join(workspace, name), text)
}

/** Una sesion doble: lo unico que `export_audit` necesita de ella es su id. */
function sessionDouble(id = 'session-1'): Record<string, unknown> {
  return { id }
}

describe('registro de las herramientas', () => {
  it('publica las cuatro herramientas, y las que salen a la red declaran su egreso', async () => {
    const h = await harness({ key: KEY })
    const schemas = h.ctx.tools.schemas()
    const index = schemas.find(schema => schema.name === 'index_workspace')
    const search = schemas.find(schema => schema.name === 'knowledge_search')
    const url = schemas.find(schema => schema.name === 'index_url')
    const audit = schemas.find(schema => schema.name === 'export_audit')

    expect(index).toBeDefined()
    expect(search).toBeDefined()
    expect(url).toBeDefined()
    expect(audit).toBeDefined()
    // El egreso se declara en la descripcion, que es lo que lee el modelo.
    expect(index?.description).toContain('https://api.helmcode.com/v1')
    expect(search?.description).toContain('https://api.helmcode.com/v1')
    expect(url?.description).toContain('https://api.helmcode.com/v1')
    expect(index?.description).toContain('EU residency')
    expect(search?.description).toContain('EU residency')
    expect(url?.description).toContain('EU residency')
    // El export es local y lo dice: no hay egreso que declarar.
    expect(audit?.description).toContain('makes no network request')
    const indexProperties = (index?.parameters as { properties?: Record<string, unknown> }).properties ?? {}
    const searchProperties = (search?.parameters as { properties?: Record<string, unknown> }).properties ?? {}
    const urlProperties = (url?.parameters as { properties?: Record<string, unknown> }).properties ?? {}
    const auditProperties = (audit?.parameters as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(indexProperties)).toEqual(['sources'])
    expect(Object.keys(searchProperties).sort()).toEqual(['query', 'topN'])
    expect(Object.keys(urlProperties)).toEqual(['url', 'source'])
    expect(Object.keys(auditProperties)).toEqual([])
  })

  it('rechaza un topK o un topN que no es un entero positivo', async () => {
    const h = await harness({ key: KEY })
    // `apply` valida antes de proveer el servicio: un tamano sin sentido no deja
    // el seam a medias con un pipeline que nadie pidio.
    expect(() => { retrieval.apply(h.ctx, { topK: 0 }) }).toThrow(/topK must be a positive integer/)
    expect(() => { retrieval.apply(h.ctx, { topN: 1.5 }) }).toThrow(/topN must be a positive integer/)
    expect(() => { retrieval.apply(h.ctx, { topK: Number.NaN }) }).toThrow(/topK must be a positive integer/)
  })

  it('provee el seam `ctx.retrieval` y arranca con un indice vacio', async () => {
    const h = await harness({ key: KEY })
    expect(h.ctx.retrieval).toBeInstanceOf(retrieval.RetrievalService)
    expect(h.ctx.retrieval.count()).toBe(0)
    expect(existsSync(h.indexPath)).toBe(true)
  })
})

describe('index_workspace', () => {
  it('indexa las fuentes del perfil por el seam de ficheros y lo declara por fuente', async () => {
    const h = await harness({
      key: KEY,
      sources: { nota: 'notas/nota.md', largo: 'largo.md' },
      topK: 8,
    })
    writeSource(h.workspace, 'notas/nota.md', 'Nota corta con texto suficiente.')
    writeSource(h.workspace, 'largo.md', `${LONG_PARAGRAPH}\n\n${LONG_PARAGRAPH}\n`)

    const result = await call(h, 'index_workspace', {}, true)

    expect(result.isError).toBe(false)
    const text = textOf(result)
    expect(text).toContain('Indexed 2 of 2 source(s)')
    expect(text).toContain('nota (')
    expect(text).toContain('1 chunk(s), 1 request(s)')
    expect(text).toContain('largo (')
    expect(text).toContain('4 chunk(s), 1 request(s)')
    expect(text).toContain('EU residency')
    // El indice quedo con los cinco trozos EN LA PARTICION de la sesion y cada
    // fuente gasto una peticion.
    expect(h.ctx.retrieval.count(workspaceOf(h.workspace))).toBe(5)
    expect(h.transport.calls.filter(url => url.endsWith('/v1/embeddings'))).toHaveLength(2)
  })

  it('sin sesion deja la resolucion de la fuente al backend, que tiene su propio cwd', async () => {
    const h = await harness({ key: KEY, sources: { suelta: 'suelta.md' } })
    writeSource(h.workspace, 'suelta.md', 'Nota sin sesion con texto suficiente.')

    const result = await call(h, 'index_workspace', {})

    expect(result.isError).toBe(false)
    expect(textOf(result)).toContain('Indexed 1 of 1 source(s)')
    // Una llamada sin cwd tiene su PROPIA particion, que es la que cuenta
    // `count()` sin argumento.
    expect(h.ctx.retrieval.count()).toBe(1)
    expect(h.ctx.retrieval.count(workspaceOf(h.workspace))).toBe(0)
  })

  it('limita la indexacion con el parametro `sources` y luego completa el resto', async () => {
    const h = await harness({ key: KEY, sources: { a: 'a.md', b: 'b.md' } })
    writeSource(h.workspace, 'a.md', 'Primera nota con texto suficiente.')
    writeSource(h.workspace, 'b.md', 'Segunda nota con texto suficiente.')

    const limited = await call(h, 'index_workspace', { sources: ['b'] }, true)
    expect(limited.isError).toBe(false)
    expect(textOf(limited)).toContain('Indexed 1 of 1 source(s)')
    expect(h.ctx.retrieval.count(workspaceOf(h.workspace))).toBe(1)

    const all = await call(h, 'index_workspace', {}, true)
    expect(all.isError).toBe(false)
    expect(textOf(all)).toContain('Indexed 2 of 2 source(s)')
    expect(h.ctx.retrieval.count(workspaceOf(h.workspace))).toBe(2)
  })

  it('falla si el modelo nombra una fuente que el perfil no declara', async () => {
    const h = await harness({ key: KEY, sources: { a: 'a.md' } })
    writeSource(h.workspace, 'a.md', 'Primera nota con texto suficiente.')

    const result = await call(h, 'index_workspace', { sources: ['no-existe'] }, true)

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('is not one of the profile')
    expect(textOf(result)).toContain('["a"]')
    expect(h.ctx.retrieval.count(workspaceOf(h.workspace))).toBe(0)
  })

  it('un documento sin texto es un no-op declarado, no un error', async () => {
    const h = await harness({ key: KEY, sources: { vacio: 'vacio.md' } })
    writeFileSync(join(h.workspace, 'vacio.md'), '   \n\n')

    const result = await call(h, 'index_workspace', {}, true)

    expect(result.isError).toBe(false)
    expect(textOf(result)).toContain('Indexed 0 of 1 source(s)')
    expect(textOf(result)).toContain('empty')
    expect(textOf(result)).toContain('declared no-op')
    expect(h.ctx.retrieval.count()).toBe(0)
    // Un no-op no gasta peticiones: no hay nada que embeber.
    expect(h.transport.calls).toEqual([])
  })

  it('sin fuentes configuradas lo dice en vez de fallar', async () => {
    const h = await harness({ key: KEY })

    const result = await call(h, 'index_workspace', {}, true)

    expect(result.isError).toBe(false)
    expect(textOf(result)).toContain('No sources are configured for this profile')
    expect(h.transport.calls).toEqual([])
  })

  it('declara por fuente lo que no pudo leer y falla si no pudo indexar ninguna', async () => {
    const only = await harness({ key: KEY, sources: { roto: 'no-existe.md' } })
    const failed = await call(only, 'index_workspace', {}, true)

    expect(failed.isError).toBe(true)
    expect(textOf(failed)).toContain('could not index any of its 1 source(s)')
    expect(textOf(failed)).toContain('could not be read')
    expect(textOf(failed)).toContain('does not exist')

    const mixed = await harness({ key: KEY, sources: { ok: 'ok.md', roto: 'no-existe.md' } })
    writeSource(mixed.workspace, 'ok.md', 'Nota legible con texto suficiente.')
    const partial = await call(mixed, 'index_workspace', {}, true)

    expect(partial.isError).toBe(false)
    expect(textOf(partial)).toContain('Indexed 1 of 2 source(s)')
    expect(textOf(partial)).toContain('1 failed')
    expect(textOf(partial)).toContain('roto (')
    expect(textOf(partial)).toContain(': failed')
    expect(mixed.ctx.retrieval.count(workspaceOf(mixed.workspace))).toBe(1)
  })

  it('se niega a leer una ruta que no es un fichero regular', async () => {
    const h = await harness({ key: KEY, sources: { dir: '.' } })

    const result = await call(h, 'index_workspace', {}, true)

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('is not a regular file')
  })

  it('declara el fallo de API por fuente sin revertir lo ya indexado', async () => {
    const h = await harness({
      key: KEY,
      sources: { ok: 'ok.md', roto: 'roto.md' },
      transport: helmcodeDouble({ embedStatuses: [200, 503] }),
    })
    writeSource(h.workspace, 'ok.md', 'Nota que si se indexa.')
    writeSource(h.workspace, 'roto.md', 'Nota que el proveedor rechaza.')

    const result = await call(h, 'index_workspace', {}, true)

    expect(result.isError).toBe(false)
    expect(textOf(result)).toContain('Indexed 1 of 2 source(s)')
    expect(textOf(result)).toContain('roto (')
    expect(textOf(result)).toContain(': failed')
    expect(textOf(result)).toContain('[PROVIDER]')
    expect(textOf(result)).toContain('503')
    // Lo que ya estaba indexado sigue ahi: un fallo de API no revierte nada.
    expect(h.ctx.retrieval.count(workspaceOf(h.workspace))).toBe(1)
  })
})

describe('fallo cerrado', () => {
  it('sin credencial configurada las herramientas fallan con su codigo y no indexan nada', async () => {
    const h = await harness({ sources: { a: 'a.md' } })
    writeSource(h.workspace, 'a.md', 'Nota que no se debe indexar.')

    const indexing = await call(h, 'index_workspace', {}, true)
    const searching = await call(h, 'knowledge_search', { query: 'nota' })

    for (const result of [indexing, searching]) {
      expect(result.isError).toBe(true)
      expect(textOf(result)).toContain('no credential is configured for HELMCODE_API_KEY')
      expect(result.error?.info).toEqual({ name: 'RetrievalToolError', code: 'MISSING_CREDENTIAL' })
    }
    expect(h.ctx.retrieval.count()).toBe(0)
    expect(h.transport.calls).toEqual([])
  })

  it('con una referencia de credencial invalida falla y lo dice', async () => {
    const h = await harness({ keyRef: 'no es una referencia', sources: { a: 'a.md' } })
    writeSource(h.workspace, 'a.md', 'Nota que no se debe indexar.')

    const result = await call(h, 'index_workspace', {}, true)

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('is not a valid credential reference')
    expect(result.error?.info?.code).toBe('MISSING_CREDENTIAL')
  })

  it('sin un `fetch` global llamable se niega en vez de recuperar sin transporte', async () => {
    const h = await harness({ key: KEY, sources: { a: 'a.md' } })
    writeSource(h.workspace, 'a.md', 'Nota que no se debe indexar.')
    Reflect.deleteProperty(globalThis, 'fetch')

    const result = await call(h, 'index_workspace', {}, true)

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('globalThis.fetch is unavailable')
    expect(result.error?.info).toEqual({ name: 'RetrievalToolError', code: 'NO_TRANSPORT' })
  })

  it('un AUTH de la API hace fallar la llamada entera con el codigo', async () => {
    const auth = await harness({
      key: 'clave-equivocada',
      sources: { a: 'a.md', b: 'b.md' },
      transport: helmcodeDouble({ embedStatuses: [401] }),
    })
    writeSource(auth.workspace, 'a.md', 'Nota con clave rechazada.')
    writeSource(auth.workspace, 'b.md', 'Otra nota con clave rechazada.')

    const indexing = await call(auth, 'index_workspace', {}, true)

    expect(indexing.isError).toBe(true)
    expect(textOf(indexing)).toContain('[AUTH]')
    expect(textOf(indexing)).toContain('401')
    expect(indexing.error?.info).toEqual({ name: 'RetrievalToolError', code: 'AUTH' })
    expect(auth.ctx.retrieval.count()).toBe(0)
  })

  it('un CREDITS de la API hace fallar la llamada entera con el codigo', async () => {
    const credits = await harness({
      key: KEY,
      sources: { a: 'a.md' },
      transport: helmcodeDouble({ embedStatuses: [402] }),
    })
    writeSource(credits.workspace, 'a.md', 'Nota sin creditos.')

    const result = await call(credits, 'index_workspace', {}, true)

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('[CREDITS]')
    expect(textOf(result)).toContain('402')
    expect(result.error?.info?.code).toBe('CREDITS')
  })
})

describe('knowledge_search', () => {
  it('busca de extremo a extremo y cita fuente, fragmento y puntuacion del rerank', async () => {
    const h = await harness({
      key: KEY,
      sources: { a: 'a.md', b: 'b.md' },
      topK: 5,
      transport: helmcodeDouble({ rerankScores: [0.1, 0.2, 0.3, 0.4, 0.9] }),
    })
    writeSource(h.workspace, 'a.md', 'Nota corta de la fuente A.')
    writeSource(h.workspace, 'b.md', `${LONG_PARAGRAPH}\n\n${LONG_PARAGRAPH}\n`)
    expect((await call(h, 'index_workspace', {}, true)).isError).toBe(false)

    const result = await call(h, 'knowledge_search', { query: 'lorem ipsum', topN: 2 }, true)

    expect(result.isError).toBe(false)
    const text = textOf(result)
    expect(text).toContain('Helmcode reranked 2 fragment(s) out of the 5 chunk(s)')
    expect(text).toContain('1. b — score 0.9')
    expect(text).toContain('2. b — score 0.4')
    // Las dos peticiones del pipeline: embeddings de la consulta y rerank.
    const urls = h.transport.calls.filter(url => url.endsWith('/v1/embeddings') || url.endsWith('/v1/rerank'))
    expect(urls[urls.length - 2]?.endsWith('/v1/embeddings')).toBe(true)
    expect(urls[urls.length - 1]?.endsWith('/v1/rerank')).toBe(true)
  })

  it('sin indice lo dice en vez de fallar, y no manda nada a la API', async () => {
    const h = await harness({ key: KEY, sources: { a: 'a.md' } })

    const result = await call(h, 'knowledge_search', { query: 'lo que sea' })

    expect(result.isError).toBe(false)
    expect(textOf(result)).toContain('holds no chunks')
    expect(textOf(result)).toContain('Run index_workspace')
    expect(h.transport.calls).toEqual([])
  })

  it('un rerank sin resultados se declara sin inventar fragmentos', async () => {
    const h = await harness({ key: KEY, sources: { a: 'a.md' } })
    writeSource(h.workspace, 'a.md', 'Nota que el rerank deja fuera.')
    expect((await call(h, 'index_workspace', {}, true)).isError).toBe(false)
    globalThis.fetch = helmcodeDouble({ rerankEmpty: true }).fetch

    const result = await call(h, 'knowledge_search', { query: 'nota' }, true)

    expect(result.isError).toBe(false)
    expect(textOf(result)).toContain('reranked 0 fragment(s) out of the 1 chunk(s)')
  })

  it('falla cerrado cuando el proveedor rechaza la clave de la consulta', async () => {
    const h = await harness({ key: KEY, sources: { a: 'a.md' } })
    writeSource(h.workspace, 'a.md', 'Nota indexada antes de rotar la clave.')
    expect((await call(h, 'index_workspace', {}, true)).isError).toBe(false)
    // La clave se resuelve y el `fetch` se lee en CADA operacion: cambiar el
    // doble aqui demuestra que no hay cache de ninguno de los dos.
    globalThis.fetch = helmcodeDouble({ embedStatuses: [401] }).fetch

    const result = await call(h, 'knowledge_search', { query: 'nota' }, true)

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('[AUTH]')
    expect(textOf(result)).not.toContain('Nota indexada')
    expect(result.error?.info?.code).toBe('AUTH')
  })

  it('no ve los trozos de otro workspace aunque el indice sea el mismo fichero', async () => {
    const first = await harness({ key: KEY, sources: { manual: 'manual.md' } })
    writeSource(first.workspace, 'manual.md', 'Manual del proyecto uno.')
    expect((await call(first, 'index_workspace', {}, true)).isError).toBe(false)

    // Mismo fichero de indice, otro cwd y la MISMA fuente: la busqueda de la
    // segunda sesion no puede citar el manual de la primera.
    const second = await harness({
      key: KEY,
      sources: { manual: 'manual.md' },
      indexPath: first.indexPath,
      transport: first.transport,
    })
    writeSource(second.workspace, 'manual.md', 'Manual del proyecto dos.')
    expect(second.ctx.retrieval.count(workspaceOf(second.workspace))).toBe(0)
    // La particion de la primera sigue intacta: nadie la piso.
    expect(second.ctx.retrieval.count(workspaceOf(first.workspace))).toBe(1)

    const empty = await call(second, 'knowledge_search', { query: 'manual' }, true)
    expect(empty.isError).toBe(false)
    expect(textOf(empty)).toContain('holds no chunks')

    expect((await call(second, 'index_workspace', {}, true)).isError).toBe(false)
    const own = await call(second, 'knowledge_search', { query: 'manual' }, true)
    expect(own.isError).toBe(false)
    expect(textOf(own)).toContain('Manual del proyecto dos')
    expect(textOf(own)).not.toContain('Manual del proyecto uno')
    expect(second.ctx.retrieval.count(workspaceOf(first.workspace))).toBe(1)
  })

  it('rechaza un topN que no es un entero positivo', async () => {
    const h = await harness({ key: KEY })

    const zero = await call(h, 'knowledge_search', { query: 'nota', topN: 0 })
    const huge = await call(h, 'knowledge_search', { query: 'nota', topN: 1e21 })

    expect(zero.isError).toBe(true)
    expect(textOf(zero)).toContain('topN must be a positive integer')
    expect(huge.isError).toBe(true)
    expect(textOf(huge)).toContain('topN must be a positive integer')
  })

  /** Los dos valores que el doble del mapa sabe marcar. */
  const MARKED_DNI = '12345678Z'
  const MARKED_TEL = '612345678'

  it('con el mapa de privacidad montado devuelve los fragmentos YA redactados', async () => {
    const h = await harness({ key: KEY, sources: { ficha: 'ficha.md' } })
    writeSource(h.workspace, 'ficha.md', `Titular con DNI ${MARKED_DNI} y movil ${MARKED_TEL}.`)
    expect((await call(h, 'index_workspace', {}, true)).isError).toBe(false)
    const redacted: string[] = []
    h.ctx.provide('privacy', {
      redact: (text: string) => {
        redacted.push(text)
        return Promise.resolve(text.replaceAll(MARKED_DNI, '[DNI_1]').replaceAll(MARKED_TEL, '[TEL_1]'))
      },
    })

    const result = await call(h, 'knowledge_search', { query: 'titular' }, true)

    expect(result.isError).toBe(false)
    // El fragmento sale con marcadores: el resultado de una busqueda no es una
    // puerta trasera al texto en crudo del documento.
    expect(textOf(result)).toContain('[DNI_1]')
    expect(textOf(result)).toContain('[TEL_1]')
    expect(textOf(result)).not.toContain(MARKED_DNI)
    expect(textOf(result)).not.toContain(MARKED_TEL)
    // Se redacta el fragmento, no la consulta ni el informe entero.
    expect(redacted).toHaveLength(1)
    expect(redacted[0]).toContain(MARKED_DNI)
  })

  it('si el mapa no se puede abrir la busqueda FALLA en vez de devolver el fragmento en crudo', async () => {
    const h = await harness({ key: KEY, sources: { ficha: 'ficha.md' } })
    writeSource(h.workspace, 'ficha.md', `Titular con DNI ${MARKED_DNI}.`)
    expect((await call(h, 'index_workspace', {}, true)).isError).toBe(false)
    h.ctx.provide('privacy', {
      redact: () => Promise.reject(new Error('privacy-helmcode: cannot decrypt the sealed map')),
    })

    const result = await call(h, 'knowledge_search', { query: 'titular' }, true)

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('cannot decrypt the sealed map')
    expect(textOf(result)).not.toContain(MARKED_DNI)
  })
})

describe('index_url', () => {
  /** El doble del seam web: la descarga entra por aqui y no abre ningun socket. */
  function webDouble(result: {
    url?: string
    statusCode?: number
    kind?: string
    content?: string
    truncated?: boolean
  } = {}) {
    return {
      fetch: (request: { url: string }) => Promise.resolve({
        url: result.url ?? request.url,
        statusCode: result.statusCode ?? 200,
        body: { kind: result.kind ?? 'text', content: result.content ?? 'Guia con texto suficiente para trocear.' },
        truncated: result.truncated ?? false,
      }),
    }
  }

  it('descarga por el seam web, trocea, indexa y lo declara', async () => {
    const h = await harness({ key: KEY })
    const seen: string[] = []
    h.ctx.provide('web', {
      fetch: (request: { url: string }) => {
        seen.push(request.url)
        return webDouble().fetch(request)
      },
    })

    const result = await call(h, 'index_url', { url: 'https://ejemplo.es/guia' }, true)

    expect(result.isError).toBe(false)
    // El egreso va al seam y no a un `fetch` propio de la herramienta.
    expect(seen).toEqual(['https://ejemplo.es/guia'])
    expect(textOf(result)).toContain('Indexed 1 chunk(s) of https://ejemplo.es/guia as "https://ejemplo.es/guia"')
    expect(textOf(result)).toContain('EU residency')
    expect(h.ctx.retrieval.count(workspaceOf(h.workspace))).toBe(1)
    expect(h.transport.calls.filter(url => url.endsWith('/v1/embeddings'))).toHaveLength(1)

    const found = await call(h, 'knowledge_search', { query: 'guia' }, true)
    expect(textOf(found)).toContain('https://ejemplo.es/guia')
  })

  it('cita el nombre logico que el modelo declara', async () => {
    const h = await harness({ key: KEY })
    h.ctx.provide('web', webDouble())

    const result = await call(h, 'index_url', { url: 'https://ejemplo.es/guia', source: 'guia-web' }, true)

    expect(result.isError).toBe(false)
    expect(textOf(result)).toContain('as "guia-web"')
    const found = await call(h, 'knowledge_search', { query: 'guia' }, true)
    expect(textOf(found)).toContain('1. guia-web — score')
  })

  it('declara el cuerpo recortado por el proveedor y una URL sin texto', async () => {
    const h = await harness({ key: KEY })
    h.ctx.provide('web', webDouble({ truncated: true, kind: 'html' }))

    const truncated = await call(h, 'index_url', { url: 'https://ejemplo.es/larga' }, true)
    expect(truncated.isError).toBe(false)
    expect(textOf(truncated)).toContain('content kind: html')
    expect(textOf(truncated)).toContain('body truncated by the provider')

    const empty = await harness({ key: KEY })
    empty.ctx.provide('web', webDouble({ content: '   \n\n' }))
    const noop = await call(empty, 'index_url', { url: 'https://ejemplo.es/vacia' }, true)

    expect(noop.isError).toBe(false)
    expect(textOf(noop)).toContain('no text to chunk')
    expect(textOf(noop)).toContain('declared no-op')
    // Un no-op no gasta peticiones de embeddings.
    expect(empty.transport.calls).toEqual([])
  })

  it('un estado que no es 2xx falla con su causa en vez de indexar la pagina de error', async () => {
    const h = await harness({ key: KEY })
    h.ctx.provide('web', webDouble({ statusCode: 404, content: 'no encontrado' }))

    const result = await call(h, 'index_url', { url: 'https://ejemplo.es/falta' }, true)

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('404')
    expect(textOf(result)).toContain('nothing was indexed')
    expect(h.ctx.retrieval.count(workspaceOf(h.workspace))).toBe(0)
    expect(h.transport.calls).toEqual([])
  })

  it('sin el seam web se niega en vez de descargar por fuera', async () => {
    const h = await harness({ key: KEY })

    const result = await call(h, 'index_url', { url: 'https://ejemplo.es/guia' }, true)

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('web seam')
    expect(textOf(result)).toContain('refused')
    expect(h.transport.calls).toEqual([])
  })

  it('un AUTH de la API hace fallar la indexacion de la URL con su codigo', async () => {
    const h = await harness({ key: KEY, transport: helmcodeDouble({ embedStatuses: [401] }) })
    h.ctx.provide('web', webDouble())

    const result = await call(h, 'index_url', { url: 'https://ejemplo.es/guia' }, true)

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('[AUTH]')
    expect(result.error?.info?.code).toBe('AUTH')
    expect(h.ctx.retrieval.count(workspaceOf(h.workspace))).toBe(0)
  })

  it('sin credencial falla con su codigo y no indexa nada', async () => {
    const h = await harness({})
    h.ctx.provide('web', webDouble())

    const result = await call(h, 'index_url', { url: 'https://ejemplo.es/guia' }, true)

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('no credential is configured for HELMCODE_API_KEY')
    expect(result.error?.info).toEqual({ name: 'RetrievalToolError', code: 'MISSING_CREDENTIAL' })
    expect(h.transport.calls).toEqual([])
  })
})

describe('export_audit', () => {
  const DNI = '12345678Z'
  const TEL = '612345678'

  /** Un evento del log, en la forma que el exportador lee. */
  function event(seq: number, type: string, data: unknown): Record<string, unknown> {
    return { seq, time: 1_700_000_000_000 + seq, type, data }
  }

  /**
   * El doble del seam de persistencia: entrega el log comprometido que se le da
   * y anota como se abrio y si se cerro. Es el unico camino por el que el export
   * lee la sesion, asi que aqui se ve el contrato entero.
   */
  function persistenceDouble(
    events: readonly Record<string, unknown>[],
    header: { id: string; cwd?: string },
  ): {
    opens: string[]
    state: { closes: number }
    open: (id: string, access: 'read') => Promise<{
      header: { id: string; cwd?: string }
      read: () => Promise<{ events: readonly Record<string, unknown>[] }>
      close: () => Promise<void>
    }>
  } {
    const opens: string[] = []
    const state = { closes: 0 }
    return {
      opens,
      state,
      open: (id: string, access: 'read') => {
        opens.push(`${id}/${access}`)
        return Promise.resolve({
          header,
          read: () => Promise.resolve({ events }),
          close: () => {
            state.closes += 1
            return Promise.resolve()
          },
        })
      },
    }
  }

  it('exporta el log comprometido en Markdown y lo redacta con el mapa montado', async () => {
    const h = await harness({ key: KEY })
    const texts: string[] = []
    h.ctx.provide('privacy', {
      redact: (text: string) => {
        texts.push(text)
        return Promise.resolve(text.replaceAll(DNI, '[DNI_1]').replaceAll(TEL, '[TEL_1]'))
      },
    })
    const persistence = persistenceDouble([
      event(1, 'user/message', { text: `Mi DNI es ${DNI}` }),
      event(2, 'tool/call', { name: 'read', arguments: { file_path: 'nota.txt' }, telefono: TEL }),
    ], { id: 'session-1', cwd: h.workspace })
    h.ctx.provide('sessionPersistence', persistence)

    const result = await call(h, 'export_audit', {}, false, sessionDouble())

    expect(result.isError).toBe(false)
    const text = textOf(result)
    expect(text).toContain('# Session audit export')
    expect(text).toContain('- Session: session-1')
    expect(text).toContain(`- Workspace: ${h.workspace}`)
    expect(text).toContain('- Events: 2')
    expect(text).toContain('Redaction: applied through the mounted redaction map')
    expect(text).toContain('## 1 · user/message · 2023-11-14T22:13:20.001Z')
    expect(text).toContain('## 2 · tool/call ·')
    expect(text).toContain('[DNI_1]')
    expect(text).toContain('[TEL_1]')
    // El original NO viaja: el export sale redactado o no sale.
    expect(text).not.toContain(DNI)
    expect(text).not.toContain(TEL)
    // Una sola pasada por el mapa, sobre el documento entero.
    expect(texts).toHaveLength(1)
    expect(texts[0]).toContain('# Session audit export')
    // El log se abre en modo lectura y el canal se cierra siempre.
    expect(persistence.opens).toEqual(['session-1/read'])
    expect(persistence.state.closes).toBe(1)
  })

  it('sin mapa montado DICE que no ha redactado y devuelve el log verbatim', async () => {
    const h = await harness({ key: KEY })
    h.ctx.provide('sessionPersistence', persistenceDouble(
      [event(1, 'user/message', { text: `DNI ${DNI}` })],
      { id: 'session-1', cwd: h.workspace },
    ))

    const result = await call(h, 'export_audit', {}, false, sessionDouble())

    expect(result.isError).toBe(false)
    const text = textOf(result)
    expect(text).toContain('Redaction: NOT APPLIED')
    expect(text).toContain('verbatim')
    expect(text).toContain(DNI)
  })

  it('un cuerpo ausente se serializa como null y una sesion sin cwd lo declara', async () => {
    const h = await harness({ key: KEY })
    h.ctx.provide('sessionPersistence', persistenceDouble([event(1, 'step/end', undefined)], { id: 'session-1' }))

    const result = await call(h, 'export_audit', {}, false, sessionDouble())

    expect(result.isError).toBe(false)
    const text = textOf(result)
    expect(text).toContain('- Workspace: (unset)')
    expect(text).toContain('```json\nnull\n```')
  })

  it('sin sesion falla en vez de exportar otra cosa', async () => {
    const h = await harness({ key: KEY })

    const result = await call(h, 'export_audit', {})

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('carries no session')
  })

  it('sin seam de persistencia se niega en vez de leer el log por fuera', async () => {
    const h = await harness({ key: KEY })

    const result = await call(h, 'export_audit', {}, false, sessionDouble())

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('persistence seam')
    expect(textOf(result)).toContain('refused')
  })

  it('un mapa que no puede redactar hace fallar el export, no lo devuelve en crudo', async () => {
    const h = await harness({ key: KEY })
    h.ctx.provide('privacy', {
      redact: () => Promise.reject(new Error('privacy-helmcode: cannot decrypt the sealed map')),
    })
    const persistence = persistenceDouble(
      [event(1, 'user/message', { text: `DNI ${DNI}` })],
      { id: 'session-1', cwd: h.workspace },
    )
    h.ctx.provide('sessionPersistence', persistence)

    const result = await call(h, 'export_audit', {}, false, sessionDouble())

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('cannot decrypt the sealed map')
    expect(textOf(result)).not.toContain(DNI)
    // El canal se cierra tambien cuando el export falla.
    expect(persistence.state.closes).toBe(1)
  })
})

describe('el servicio como seam', () => {
  it('indexa y busca por el seam, y un documento sin texto es un no-op', async () => {
    const h = await harness({ key: KEY })

    const empty = await h.ctx.retrieval.indexSource('nota', '   ')

    expect(empty).toEqual({ chunks: 0, requests: 0 })
    expect(h.ctx.retrieval.count()).toBe(0)
    expect(h.transport.calls).toEqual([])

    const indexed = await h.ctx.retrieval.indexSource('nota', 'Una nota con texto suficiente.')
    expect(indexed.chunks).toBe(1)
    expect(indexed.requests).toBe(1)
    expect(h.ctx.retrieval.count()).toBe(1)
    expect((await h.ctx.retrieval.search('nota')).hits).toHaveLength(1)
  })

  it('el seam acota la busqueda al workspace que le piden', async () => {
    const h = await harness({ key: KEY })
    await h.ctx.retrieval.indexSource('manual', 'Manual del proyecto uno.', 'ws-uno')

    expect(h.ctx.retrieval.count('ws-uno')).toBe(1)
    expect(h.ctx.retrieval.count('ws-dos')).toBe(0)
    expect((await h.ctx.retrieval.search('manual', undefined, 'ws-dos')).indexed).toBe(0)
    expect((await h.ctx.retrieval.search('manual', undefined, 'ws-uno')).hits).toHaveLength(1)
  })

  it('resuelve el indice por defecto bajo DSH_HOME cuando el perfil no declara ruta', async () => {
    const previousHome = process.env.DSH_HOME
    const root = mkdtempSync(join(tmpdir(), 'dsh-retrieval-home-'))
    roots.push(root)
    process.env.DSH_HOME = root
    try {
      const h = await harness({ key: KEY, sources: { a: 'a.md' }, withoutIndexPath: true })
      writeSource(h.workspace, 'a.md', 'Nota del home por defecto.')

      const result = await call(h, 'index_workspace', {}, true)

      expect(result.isError).toBe(false)
      expect(existsSync(join(root, 'retrieval', 'index.sqlite'))).toBe(true)
      expect(h.ctx.retrieval.count(workspaceOf(h.workspace))).toBe(1)
    } finally {
      if (previousHome === undefined) Reflect.deleteProperty(process.env, 'DSH_HOME')
      else process.env.DSH_HOME = previousHome
    }
  })

  it('sin seam de ficheros se niega en vez de leer por fuera', async () => {
    const h = await harness({ key: KEY, sources: { a: 'a.md' }, withoutFs: true })

    const result = await call(h, 'index_workspace', {}, true)

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('filesystem seam')
    expect(textOf(result)).toContain('refused')
  })
})

describe('persistencia entre instancias', () => {
  it('la segunda instancia con el mismo indexPath Y el mismo workspace ve el indice de la primera', async () => {
    const first = await harness({ key: KEY, sources: { a: 'a.md' } })
    writeSource(first.workspace, 'a.md', 'Nota que sobrevive al plugin.')
    expect((await call(first, 'index_workspace', {}, true)).isError).toBe(false)
    expect(first.ctx.retrieval.count(workspaceOf(first.workspace))).toBe(1)

    // El caso que el review senalo: la MISMA fuente en OTRO workspace del mismo
    // fichero ya no se ve (ni se pisa); con el mismo cwd, si.
    const second = await harness({
      key: KEY,
      sources: { a: 'a.md' },
      indexPath: first.indexPath,
      transport: first.transport,
    })
    expect(second.ctx.retrieval.count(workspaceOf(second.workspace))).toBe(0)
    expect(second.ctx.retrieval.count(workspaceOf(first.workspace))).toBe(1)

    const sameWorkspace = await harness({
      key: KEY,
      sources: { a: 'a.md' },
      indexPath: first.indexPath,
      workspace: first.workspace,
      transport: first.transport,
    })

    expect(sameWorkspace.ctx.retrieval.count(workspaceOf(first.workspace))).toBe(1)
    const result = await call(sameWorkspace, 'knowledge_search', { query: 'nota' }, true)

    expect(result.isError).toBe(false)
    expect(textOf(result)).toContain('1. a — score')
    expect(textOf(result)).toContain('Nota que sobrevive al plugin.')
  })
})
