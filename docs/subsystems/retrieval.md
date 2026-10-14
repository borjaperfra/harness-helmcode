# Retrieval (Helmcode)

English | [Español](retrieval.es.md)

`ctx.retrieval` is the local retrieval seam the [retrieval-helmcode package](../../packages/retrieval/helmcode/README.md) declares and provides: one SQLite index under the harness home plus the two operations that write it and query it. The package also publishes the two tools the model drives, so the capability is explicit — there is no interceptor, and no text is indexed or retrieved behind the agent's back.

The seam exists because the model needs grounded answers over documents the deployment names, and because the harness has no network seam it could route that traffic through: the pure core takes an injected `fetch` and the wiring passes `globalThis.fetch` read on every operation, so the egress of this capability is a composition decision, not a defaults accident.

## Operations

| Operation | What it does | What it costs |
|---|---|---|
| `indexSource(source, text)` | Chunks the document, embeds every chunk through Helmcode `/v1/embeddings` (`qwen3-embedding`) and REPLACES that source's rows in the index, so re-indexing an edited file never leaves stale fragments competing in search. | One embeddings request per batch; zero for a document with no usable text, which is a declared no-op. |
| `search(query, topN?)` | Embeds the query, ranks the indexed fragments by raw cosine over the local index, then reranks the `topK` candidates through `/v1/rerank` and returns the best `topN` (`8` and `4` by default). | One embeddings request plus one rerank request, and nothing at all when the index holds no fragment. |

Both operations resolve the API key from `ctx.credentials` at the START of the call, so a missing or rotated key is a failure on the next call rather than a stale cached value; the index itself is opened lazily on first use, so a profile that never indexes never creates the file. The key, the base URL, the index path, the source table and the two sizes come from the plugin's `Config`; the reference `HELMCODE_API_KEY` and `<DSH_HOME>/retrieval/index.sqlite` are the defaults.

## What it does not do

- **No hybrid or lexical search.** Ranking is raw cosine over the stored vectors plus the provider rerank; there is no BM25, no reciprocal-rank fusion and no query expansion, so an exact-term lookup can rank below a semantically close fragment.
- **No citation contract.** A hit carries the logical `source` name and the fragment text; the seam does not resolve a file path, a line range or a stable document id, and it never verifies that the indexed text still matches the file on disk.
- **One embedding route.** Fragments and queries are embedded by the same Helmcode model; mixing a second embedder would silently compare vectors from different spaces, so the seam refuses to guess one.
- **No fallback without a key.** Missing credentials, a refused transport or a `401`/`402` from Helmcode fail the call with its own code instead of degrading to an empty result list: an empty answer must mean "the index had nothing", never "the key was missing".
- **No coverage claim.** `index_workspace` reports per-source `indexed`, `empty` and `failed` rows, and a source that failed leaves the rest of the run intact; the seam never claims an exhaustive corpus.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxretrieval--retrievalservice"></a>

### `ctx.retrieval` — `RetrievalService`

El seam `ctx.retrieval`: el indice local de recuperacion y las dos operaciones que lo usan, construidas sobre el nucleo puro con la clave resuelta por `ctx.credentials` y el `fetch` inyectado.

El indice se abre PEREZOSAMENTE sobre `indexPath` y se cierra con el plugin. La clave NO se cachea: se resuelve al principio de cada operacion, asi que una clave rotada llega a la siguiente llamada sin reiniciar nada.

```ts cordis-catalog
/**
 * Cuantos trozos guarda el indice local.
 *
 * @returns el total de trozos indexados; 0 cuando aun no se ha indexado nada.
 */
count(): number

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
async indexSource(source: string, text: string): Promise<SourceIndexOutcome>

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
async search(query: string, topN?: number): Promise<SearchOutcome>
```

Source: [`packages/retrieval/helmcode/src/index.ts`](../../packages/retrieval/helmcode/src/index.ts)
<!-- END GENERATED cordis-surface -->
