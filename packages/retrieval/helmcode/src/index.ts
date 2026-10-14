/**
 * La recuperacion de Helmcode como capacidad del agente: el seam `ctx.retrieval`,
 * que este plugin declara y provee, y las dos herramientas con las que el modelo
 * lo usa.
 *
 * El nucleo puro —troceador, embedder, reranker, indice local y pipeline— vive en
 * los otros modulos del paquete y se reexporta desde `./core.ts`; este fichero es
 * el CABLEADO, y sus tres decisiones no son intercambiables:
 *
 * 1. **El seam lo declara ESTE plugin.** `declare module '@deepseek-ai/cordis'`
 *    anade `ctx.retrieval`, que es el patron de todos los plugins del arbol: un
 *    servicio nuevo no exige tocar `packages/core`.
 * 2. **El transporte se inyecta EXPLICITAMENTE.** El nucleo exige un `fetch` y no
 *    tiene valor por defecto, asi que aqui se pasa `globalThis.fetch`, leido en
 *    cada operacion. No existe un camino que salga a la red sin que la
 *    composicion lo haya decidido, y los tests sustituyen ese global por un doble.
 * 3. **Fallo cerrado.** La clave se resuelve en el credential store al PRINCIPIO
 *    de cada operacion del servicio: sin clave, las dos herramientas fallan con su
 *    codigo y su causa aunque el indice este vacio o el documento no tenga texto,
 *    y jamas se devuelven resultados sin recuperacion real. Con clave, un documento
 *    sin texto y un indice sin trozos son no-ops DECLARADOS, no errores.
 *
 * El indice vive en `<DSH_HOME>/retrieval/index.sqlite` por defecto y se abre
 * perezosamente: un perfil que nunca indexa no crea el fichero.
 *
 * @module @deepseek-ai/dsh-retrieval-helmcode
 */

import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { FileSystem } from '@deepseek-ai/dsh-fs'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import { chunkText } from './chunk.ts'
import { HelmcodeEmbedder } from './embed.ts'
import type { Embedding } from './embed.ts'
import { RetrievalError } from './errors.ts'
import type { RetrievalErrorCode } from './errors.ts'
import { HelmcodeHttp } from './http.ts'
import type { FetchLike } from './http.ts'
import { HelmcodeReranker } from './rerank.ts'
import { search as runRetrievalSearch } from './search.ts'
import type { SearchHit } from './search.ts'
import { RetrievalIndex } from './store.ts'

export * from './core.ts'

/** Nombre del plugin para los diagnosticos del loader. */
export const name = 'retrieval-helmcode'

/**
 * Los dos seams que hay que inyectar: `tools` (el registro por el que se publican
 * las dos herramientas) y `credentials` (de donde sale la clave de Helmcode, que
 * NO viaja en el patch del bundle).
 *
 * `fs` no esta aqui a proposito: `index_workspace` lee sus fuentes por el seam de
 * ficheros cuando la composicion lo monta, pero exigirlo en `inject` desmontaria
 * el plugin entero —incluida `knowledge_search`, que no lee ficheros— en una
 * composicion sin filesystem. La herramienta lo resuelve en cada llamada
 * (`ctx.get('fs')`) y se niega si no esta.
 */
export const inject = ['tools', 'credentials']

/** La referencia de credencial por defecto de la clave de Helmcode. */
export const DEFAULT_API_KEY_REF = 'HELMCODE_API_KEY'

/**
 * La raiz por defecto de la API de Helmcode, SIN `/v1`: el nucleo anade
 * `/v1/embeddings` y `/v1/rerank` a esta raiz.
 */
export const DEFAULT_BASE_URL = 'https://api.helmcode.com'

/** Candidatos que la busqueda pide al coseno por defecto. */
export const DEFAULT_TOP_K = 8

/** Resultados que la busqueda devuelve tras el rerank por defecto. */
export const DEFAULT_TOP_N = 4

/** Los segmentos, bajo el home del harness, de la ruta por defecto del indice. */
export const DEFAULT_INDEX_SEGMENTS: readonly string[] = ['retrieval', 'index.sqlite']

/**
 * La ruta por defecto del indice bajo el home del harness.
 *
 * @param home - el home ya resuelto; por defecto, el de esta maquina.
 * @returns la ruta absoluta `<home>/retrieval/index.sqlite`.
 */
export function defaultIndexPath(home: string = resolveDshHome()): string {
  return join(home, ...DEFAULT_INDEX_SEGMENTS)
}

/** La configuracion del plugin, tal como la declara el perfil. */
export interface Config {
  /**
   * Ruta del fichero del indice. Ausente: `<DSH_HOME>/retrieval/index.sqlite`,
   * resuelto con `resolveDshHome` en el momento de montar el plugin.
   */
  indexPath?: string
  /**
   * Referencia de credencial que guarda la clave de Helmcode. Ausente:
   * `HELMCODE_API_KEY`. La clave no se declara aqui: vive en el credential store.
   */
  apiKeyRef?: string
  /**
   * Raiz de la API de Helmcode, SIN `/v1` (el nucleo anade `/v1/embeddings` y
   * `/v1/rerank`). Ausente: `https://api.helmcode.com`, la ruta europea.
   */
  baseURL?: string
  /**
   * Los documentos que `index_workspace` indexa cuando el modelo no limita la
   * lista: nombre logico (el que la busqueda cita como `source`) → ruta relativa
   * al workspace de la sesion. Ausente: ninguno.
   */
  sources?: Record<string, string>
  /** Candidatos que la busqueda pide al coseno. Ausente: {@link DEFAULT_TOP_K}. */
  topK?: number
  /** Resultados que la busqueda devuelve tras el rerank. Ausente: {@link DEFAULT_TOP_N}. */
  topN?: number
}

/**
 * Esquema de configuracion NATIVO de Schemastery, que es el unico que el
 * validador de config del harness reconoce. Los seis campos son opcionales; sin
 * ninguno, el plugin usa sus valores por defecto (ver {@link Config}).
 */
export const Config: z<Config> = z.object({
  indexPath: z.string(),
  apiKeyRef: z.string(),
  baseURL: z.string(),
  sources: z.dict(z.string()),
  topK: z.number(),
  topN: z.number(),
})

/**
 * Los codigos con los que fallan las herramientas: los del nucleo de recuperacion
 * mas los dos que solo existen en el cableado (el credential store y el
 * transporte global).
 */
export type RetrievalToolErrorCode = RetrievalErrorCode | 'MISSING_CREDENTIAL' | 'NO_TRANSPORT'

/**
 * El fallo de recuperacion tal como lo ve el agente.
 *
 * Extiende `HarnessError` para que su `code` viaje como identidad estructurada del
 * fallo (`error.info` de un resultado de herramienta), no como texto que haya que
 * parsear: el runtime enruta por el y el modelo lee el mismo codigo en el mensaje.
 */
export class RetrievalToolError extends HarnessError {
  /**
   * @param code - la clase de fallo, la del nucleo o una del cableado.
   * @param message - mensaje con el contexto suficiente para diagnosticar.
   * @param options - causa original, para no perder el error de debajo.
   */
  constructor(code: RetrievalToolErrorCode, message: string, options?: ErrorOptions) {
    super(message, code, options)
  }
}

/** El transporte doble de peticiones: cuanto se ha pedido a Helmcode. */
interface RequestCounter {
  requests: number
}

/** Lo que devuelve {@link RetrievalService.indexSource}. */
export interface SourceIndexOutcome {
  /** Trozos que quedaron indexados; 0 cuando el documento no tenia texto. */
  readonly chunks: number
  /** Peticiones HTTP que se enviaron al endpoint de embeddings. */
  readonly requests: number
}

/** Lo que devuelve {@link RetrievalService.search}. */
export interface SearchOutcome {
  /** Trozos que el indice tenia cuando se busco. */
  readonly indexed: number
  /** Los resultados, ya reranqueados y sin el indice interno del pipeline. */
  readonly hits: readonly SearchHit[]
}

/** La configuracion efectiva del servicio, con los valores por defecto aplicados. */
export interface RetrievalServiceOptions {
  /** Ruta del fichero del indice. */
  readonly indexPath: string
  /** Referencia de credencial de la clave de Helmcode. */
  readonly apiKeyRef: string
  /** Raiz de la API, sin `/v1`. */
  readonly baseURL: string
  /** Candidatos que la busqueda pide al coseno. */
  readonly topK: number
  /** Resultados que la busqueda devuelve tras el rerank. */
  readonly topN: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    retrieval: RetrievalService
  }
}

/**
 * El seam `ctx.retrieval`: el indice local de recuperacion y las dos operaciones
 * que lo usan, construidas sobre el nucleo puro con la clave resuelta por
 * `ctx.credentials` y el `fetch` inyectado.
 *
 * El indice se abre PEREZOSAMENTE sobre `indexPath` y se cierra con el plugin. La
 * clave NO se cachea: se resuelve al principio de cada operacion, asi que una
 * clave rotada llega a la siguiente llamada sin reiniciar nada.
 */
export class RetrievalService extends Service {
  private readonly options: RetrievalServiceOptions

  /** El indice vigente; `undefined` hasta la primera operacion que lo necesita. */
  private index: RetrievalIndex | undefined

  /**
   * @param ctx - contexto del plugin, que pasa a ser el dueno del servicio.
   * @param options - ruta del indice, referencia de la clave, raiz de la API y tamanos.
   */
  constructor(ctx: Context, options: RetrievalServiceOptions) {
    super(ctx, 'retrieval')
    this.options = options
    ctx.effect(() => () => {
      this.closeIndex()
    }, 'retrieval-helmcode index')
  }

  /**
   * Cuantos trozos guarda el indice local.
   *
   * @returns el total de trozos indexados; 0 cuando aun no se ha indexado nada.
   */
  count(): number {
    return this.openIndex().count()
  }

  /**
   * Trocea, embebe y guarda un documento en el indice local.
   *
   * El documento se REEMPLAZA entero: reindexar un fichero editado no deja sus
   * trozos viejos compitiendo en la busqueda. Un documento sin texto utilizable es
   * un no-op declarado —no se embebe nada, no se toca el indice y no se gasta
   * ninguna peticion—, y la clave se resuelve ANTES de mirar el texto: sin clave
   * esta operacion falla en vez de fingir que indexo.
   *
   * @param source - nombre logico del documento, el que la busqueda cita.
   * @param text - el documento completo.
   * @returns los trozos guardados y las peticiones enviadas a Helmcode.
   * @throws {RetrievalToolError} MISSING_CREDENTIAL sin clave utilizable,
   * NO_TRANSPORT sin `globalThis.fetch`, o el codigo del nucleo (AUTH, CREDITS,
   * RATE_LIMIT, PROVIDER, MALFORMED, DIMENSION) cuando Helmcode rechaza la llamada.
   */
  async indexSource(source: string, text: string): Promise<SourceIndexOutcome> {
    const apiKey = await this.resolveApiKey()
    const chunks = chunkText(text)
    if (chunks.length === 0) return { chunks: 0, requests: 0 }
    const counter: RequestCounter = { requests: 0 }
    const embeddings = await this.embedder(apiKey, counter).embed(chunks.map(chunk => chunk.text))
    this.openIndex().upsertSource(source, chunks.map((chunk, position) => ({
      text: chunk.text,
      start: chunk.start,
      end: chunk.end,
      // El contrato de `Embedder.embed` es un vector por texto, en el mismo orden,
      // y el nucleo lo cumple (`parseEmbeddings` valida la cuenta antes de
      // devolver): aqui no hay nada que decidir, solo que afirmar.
      embedding: embeddings[position] as Embedding,
    })))
    return { chunks: chunks.length, requests: counter.requests }
  }

  /**
   * Ejecuta `embed → coseno → rerank` sobre el indice local.
   *
   * Sin trozos indexados no hay recuperacion que hacer y no se manda nada: se
   * DICE. Con trozos, la clave se resuelve antes de embeber la consulta, asi que
   * un fallo de credencial sale como fallo y nunca como una lista vacia.
   *
   * @param query - la consulta del usuario.
   * @param topN - cuantos resultados devolver; ausente, el `topN` de la configuracion.
   * @returns los trozos que tenia el indice y los resultados reranqueados.
   * @throws {RetrievalToolError} MISSING_CREDENTIAL sin clave utilizable,
   * NO_TRANSPORT sin `globalThis.fetch`, o el codigo del nucleo cuando Helmcode
   * rechaza la llamada.
   */
  async search(query: string, topN?: number): Promise<SearchOutcome> {
    const apiKey = await this.resolveApiKey()
    const index = this.openIndex()
    const indexed = index.count()
    if (indexed === 0) return { indexed: 0, hits: [] }
    const hits = await runRetrievalSearch(
      index,
      this.embedder(apiKey, { requests: 0 }),
      this.reranker(apiKey),
      query,
      { topK: this.options.topK, topN: topN ?? this.options.topN },
    )
    return { indexed, hits }
  }

  /** El embedder del nucleo, con la clave resuelta y el `fetch` global contado. */
  private embedder(apiKey: string, counter: RequestCounter): HelmcodeEmbedder {
    return new HelmcodeEmbedder({ http: this.http(apiKey, counter) })
  }

  /** El reranker del nucleo, con la clave resuelta. */
  private reranker(apiKey: string): HelmcodeReranker {
    return new HelmcodeReranker(this.http(apiKey, { requests: 0 }))
  }

  /** El cliente HTTP con la raiz configurada y el transporte inyectado. */
  private http(apiKey: string, counter: RequestCounter): HelmcodeHttp {
    return new HelmcodeHttp({ baseUrl: this.options.baseURL, apiKey, fetch: this.transport(counter) })
  }

  /**
   * El transporte explicito: `globalThis.fetch`, leido en CADA operacion para que
   * la composicion —y un test con su doble— decidan por donde sale el trafico.
   *
   * @param counter - donde anotar cada peticion enviada.
   * @returns el `fetch` global, envuelto para contar.
   * @throws {RetrievalToolError} NO_TRANSPORT si no hay un `fetch` global llamable.
   */
  private transport(counter: RequestCounter): FetchLike {
    const impl = globalThis.fetch
    if (typeof impl !== 'function') {
      throw new RetrievalToolError(
        'NO_TRANSPORT',
        'retrieval-helmcode: globalThis.fetch is unavailable, so no Helmcode request can be made; '
        + 'the tools refuse instead of retrieving without a transport',
      )
    }
    return (url, init) => {
      counter.requests += 1
      return impl(url, init)
    }
  }

  /**
   * La clave de Helmcode, resuelta en el credential store.
   *
   * @returns el valor de la credencial.
   * @throws {RetrievalToolError} MISSING_CREDENTIAL cuando la referencia no tiene
   * la forma de una credencial o cuando no hay valor: sin clave no se abre
   * ninguna peticion, y el fallo nombra la referencia y la ruta del indice.
   */
  private async resolveApiKey(): Promise<string> {
    let ref: CredentialRef
    try {
      ref = credentialRef(this.options.apiKeyRef)
    } catch (error) {
      throw new RetrievalToolError(
        'MISSING_CREDENTIAL',
        `retrieval-helmcode: "${this.options.apiKeyRef}" is not a valid credential reference (${String(error)}), `
        + 'so no Helmcode request can be authorized',
        { cause: error },
      )
    }
    const credential = await this.ctx.credentials.resolve(ref)
    if (credential === undefined) {
      throw new RetrievalToolError(
        'MISSING_CREDENTIAL',
        `retrieval-helmcode: no credential is configured for ${this.options.apiKeyRef}, so the tools refuse `
        + 'instead of retrieving without a key; store the Helmcode API key in the credential store and retry',
      )
    }
    return credential.value
  }

  /** Abre el indice en `indexPath` la primera vez que se usa. */
  private openIndex(): RetrievalIndex {
    if (this.index === undefined) {
      mkdirSync(dirname(this.options.indexPath), { recursive: true })
      this.index = new RetrievalIndex(this.options.indexPath)
    }
    return this.index
  }

  /** Cierra el indice con el plugin; cerrar dos veces no falla (el nucleo es idempotente). */
  private closeIndex(): void {
    this.index?.close()
    this.index = undefined
  }
}

/** El estado de una fuente en el informe de `index_workspace`. */
type SourceStatus = 'indexed' | 'empty' | 'failed'

/** Una fuente del informe de `index_workspace`. */
interface SourceRow {
  readonly source: string
  readonly path: string
  readonly status: SourceStatus
  readonly chunks: number
  readonly requests: number
  readonly detail: string
}

/** El valor canonico de `index_workspace`. */
interface IndexWorkspaceValue {
  readonly indexedSources: number
  readonly emptySources: number
  readonly failedSources: number
  readonly sources: readonly SourceRow[]
}

/** La configuracion ya resuelta, tal como la comparten el servicio y las herramientas. */
interface EffectiveConfig extends RetrievalServiceOptions {
  readonly sources: Readonly<Record<string, string>>
}

/** Los argumentos validados de `index_workspace`. */
interface IndexWorkspaceArgs {
  readonly sources?: readonly string[]
}

/**
 * Convierte un fallo del nucleo en el fallo de la herramienta.
 *
 * @param error - el fallo tipado del nucleo.
 * @returns el mismo codigo, el mensaje ya marcado con el y la causa original.
 */
function asToolFailure(error: RetrievalError): RetrievalToolError {
  return new RetrievalToolError(error.code, `retrieval-helmcode: [${error.code}] ${error.message}`, { cause: error })
}

/**
 * Comprueba que un tamano de la configuracion es un entero positivo.
 *
 * @param field - nombre del campo, para el mensaje.
 * @param value - el valor declarado.
 * @returns el valor, ya comprobado.
 * @throws cuando no es un entero positivo.
 */
function requirePositiveInteger(field: string, value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`retrieval-helmcode: ${field} must be a positive integer`)
  }
  return value
}

/**
 * Los pares nombre → ruta relativa que esta llamada tiene que indexar.
 *
 * @param configured - las fuentes de la configuracion del perfil.
 * @param requested - las que pide el modelo, o `undefined` para indexar todas.
 * @returns los pares, en el orden pedido (o en el de la configuracion).
 * @throws cuando el modelo nombra una fuente que el perfil no declara.
 */
function resolveTargets(
  configured: Readonly<Record<string, string>>,
  requested: readonly string[] | undefined,
): ReadonlyArray<readonly [string, string]> {
  if (requested === undefined) return Object.entries(configured)
  return requested.map((source) => {
    const relative = configured[source]
    if (relative === undefined) {
      throw new Error(
        `retrieval-helmcode: "${source}" is not one of the profile's configured sources `
        + `(${JSON.stringify(Object.keys(configured))}), so nothing was indexed`,
      )
    }
    return [source, relative] as const
  })
}

/**
 * Lee una fuente por el seam de ficheros, con la ruta resuelta en el mundo de
 * ejecucion del backend (el cwd de la sesion cuando lo hay).
 *
 * @param fs - el backend de ficheros montado.
 * @param relative - la ruta relativa que declara el perfil.
 * @param cwd - el cwd de la sesion, si la llamada trae una.
 * @param signal - la cancelacion de la llamada.
 * @returns la ruta presentable y el texto del fichero.
 * @throws cuando el backend no encuentra la ruta o cuando no es un fichero regular.
 */
async function readSource(
  fs: FileSystem,
  relative: string,
  cwd: string | undefined,
  signal: AbortSignal,
): Promise<{ path: string; text: string }> {
  const target = await fs.resolve(relative, { ...(cwd === undefined ? {} : { cwd }), signal })
  const info = await fs.stat(target, signal)
  if (info === undefined) throw new Error(`"${target.displayPath}" does not exist`)
  if (info.type !== 'file') throw new Error(`"${target.displayPath}" is not a regular file`)
  return { path: target.displayPath, text: await fs.readText(target, signal) }
}

/**
 * Cablea la recuperacion: el servicio del seam y las dos herramientas que lo usan.
 *
 * @param ctx - contexto del plugin.
 * @param config - configuracion ya validada por {@link Config}.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const effective: EffectiveConfig = {
    indexPath: config.indexPath ?? defaultIndexPath(),
    apiKeyRef: config.apiKeyRef ?? DEFAULT_API_KEY_REF,
    baseURL: config.baseURL ?? DEFAULT_BASE_URL,
    sources: config.sources ?? {},
    topK: requirePositiveInteger('topK', config.topK ?? DEFAULT_TOP_K),
    topN: requirePositiveInteger('topN', config.topN ?? DEFAULT_TOP_N),
  }
  const service = new RetrievalService(ctx, effective)

  ctx.tools.register(defineTool({
    name: 'index_workspace',
    description:
      'Index the workspace documents this profile configures (its `sources`) into the local retrieval index, so '
      + '`knowledge_search` can find them: every file is read through the filesystem seam, chunked by paragraph and '
      + 'embedded. EGRESS: each chunk is sent to the Helmcode embeddings endpoint at https://api.helmcode.com/v1 '
      + '(model qwen3-embedding, EU residency). Fail-closed: without a usable key in the credential store, or when '
      + 'Helmcode answers 401/402, this tool fails with the code and the cause instead of reporting an index that '
      + 'was never built. A document with no text is a declared no-op, and a source that fails does not undo the '
      + 'sources already indexed: the outcome is declared per source.',
    parameters: {
      sources: {
        type: 'array',
        items: { type: 'string' },
        description: 'Names of configured sources to index; omit to index every source the profile declares.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          indexedSources: { type: 'integer', required: true },
          emptySources: { type: 'integer', required: true },
          failedSources: { type: 'integer', required: true },
          sources: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                source: { type: 'string', required: true },
                path: { type: 'string', required: true },
                status: { type: 'string', required: true, enum: ['indexed', 'empty', 'failed'] },
                chunks: { type: 'integer', required: true },
                requests: { type: 'integer', required: true },
                detail: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render(_args, value) {
        // Presupuesto de acento (brandbook): el informe por fuente es TEXTO
        // PLANO, sin estilo, de modo que no gasta momentos indigo. Si algun
        // corte lo pinta, los nombres de fuente y los contadores tecnicos van en
        // `accent-text` o en gris —nunca en el indigo base— y el acento no se
        // usa en texto de cuerpo ni en separadores.
        if (value.sources.length === 0) {
          return [{
            type: 'text',
            text: 'No sources are configured for this profile (config `sources`), so there was nothing to index.',
          }]
        }
        const lines = [
          `Indexed ${String(value.indexedSources)} of ${String(value.sources.length)} source(s) into the local `
          + `retrieval index (${String(value.emptySources)} empty, ${String(value.failedSources)} failed). `
          + `Chunks were embedded with Helmcode at ${effective.baseURL} (EU residency).`,
        ]
        for (const row of value.sources) {
          lines.push(
            `- ${row.source} (${row.path}): ${row.status}, ${String(row.chunks)} chunk(s), `
            + `${String(row.requests)} request(s) — ${row.detail}`,
          )
        }
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args: IndexWorkspaceArgs, exec: ToolExecution) {
      const fs = ctx.get('fs')
      if (fs === undefined) {
        throw new Error(
          'retrieval-helmcode: index_workspace reads its sources through the filesystem seam (ctx.fs), which this '
          + 'composition does not mount; the read is refused rather than done outside the seam',
        )
      }
      const targets = resolveTargets(effective.sources, args.sources)
      const cwd = exec.agent?.session.header.cwd
      const rows: SourceRow[] = []
      for (const [source, relative] of targets) {
        let path = relative
        let text: string
        try {
          const read = await readSource(fs, relative, cwd, exec.signal)
          path = read.path
          text = read.text
        } catch (error) {
          rows.push({
            source, path, status: 'failed', chunks: 0, requests: 0,
            detail: `the source could not be read: ${String(error)}`,
          })
          continue
        }
        try {
          const outcome = await service.indexSource(source, text)
          rows.push(outcome.chunks === 0
            ? {
              source, path, status: 'empty', chunks: 0, requests: 0,
              detail: 'the document has no text to chunk, so nothing was embedded: a declared no-op',
            }
            : {
              source, path, status: 'indexed',
              chunks: outcome.chunks, requests: outcome.requests,
              detail: `${String(outcome.chunks)} chunk(s) embedded in ${String(outcome.requests)} request(s) to `
                  + effective.baseURL,
            })
        } catch (error) {
          // Un 401/402 no es un fallo "de esta fuente": la clave entera es
          // inservible, asi que la llamada falla en vez de declarar un informe
          // que invitaria a reintentar fuente por fuente. Cualquier otro fallo
          // del nucleo si es de la fuente: se declara y se sigue con las demas.
          if (error instanceof RetrievalError) {
            if (error.code === 'AUTH' || error.code === 'CREDITS') throw asToolFailure(error)
            rows.push({
              source, path, status: 'failed', chunks: 0, requests: 0,
              detail: `[${error.code}] ${error.message}`,
            })
            continue
          }
          // La clave ausente y el transporte ausente NO son fallos por fuente:
          // suben tal cual y la herramienta falla con su codigo.
          throw error
        }
      }
      if (rows.length > 0 && rows.every(row => row.status === 'failed')) {
        throw new Error(
          `retrieval-helmcode: index_workspace could not index any of its ${String(rows.length)} source(s): `
          + rows.map(row => `${row.source}: ${row.detail}`).join('; '),
        )
      }
      return {
        indexedSources: rows.filter(row => row.status === 'indexed').length,
        emptySources: rows.filter(row => row.status === 'empty').length,
        failedSources: rows.filter(row => row.status === 'failed').length,
        sources: rows,
      } satisfies IndexWorkspaceValue
    },
  }))

  ctx.tools.register(defineTool({
    name: 'knowledge_search',
    description:
      'Search the local retrieval index and return the best fragments with their source and score. EGRESS: the '
      + 'query is embedded and the candidates are reranked through the Helmcode API at https://api.helmcode.com/v1 '
      + '(`/v1/embeddings` and `/v1/rerank`, EU residency). Fail-closed: without a usable key, or when Helmcode '
      + 'answers 401/402, this tool fails with the code and the cause instead of returning fragments that were '
      + 'never retrieved. With an empty index it says so, and it never invents a result: it returns only what the '
      + 'index and the rerank actually produced.',
    parameters: {
      query: {
        type: 'string',
        required: true,
        description: 'What to look for, in natural language; it is embedded and reranked against the indexed fragments.',
      },
      topN: {
        type: 'integer',
        description: `How many fragments to return (default ${String(DEFAULT_TOP_N)}).`,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          indexed: { type: 'integer', required: true },
          hits: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                source: { type: 'string', required: true },
                score: { type: 'number', required: true },
                text: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render(_args, value) {
        // Presupuesto de acento: este resultado tambien es TEXTO PLANO y no
        // gasta acento. Un corte que lo estilice pone la fuente, la puntuacion y
        // el nombre de `index_workspace` en `accent-text` o en gris, jamas en el
        // indigo base, y mantiene el acento fuera del texto de cuerpo.
        if (value.indexed === 0) {
          return [{
            type: 'text',
            text: 'The retrieval index holds no chunks, so nothing was searched and no Helmcode request was sent. '
              + 'Run index_workspace (or declare the profile `sources`) and search again.',
          }]
        }
        const lines = [
          `Helmcode reranked ${String(value.hits.length)} fragment(s) out of the ${String(value.indexed)} chunk(s) `
          + `indexed (egress: ${effective.baseURL}, EU residency).`,
        ]
        for (const [position, hit] of value.hits.entries()) {
          lines.push('')
          lines.push(`${String(position + 1)}. ${hit.source} — score ${String(hit.score)}`)
          lines.push(hit.text)
        }
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args, _exec: ToolExecution) {
      const topN = args.topN === undefined ? undefined : requirePositiveInteger('topN', args.topN)
      try {
        const outcome = await service.search(args.query, topN)
        return {
          indexed: outcome.indexed,
          hits: outcome.hits.map(hit => ({ source: hit.source, score: hit.score, text: hit.text })),
        }
      } catch (error) {
        if (error instanceof RetrievalError) throw asToolFailure(error)
        throw error
      }
    },
  }))
}
