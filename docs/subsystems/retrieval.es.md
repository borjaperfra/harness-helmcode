# Recuperación (Helmcode)

[English](retrieval.md) | Español

`ctx.retrieval` es el seam de recuperación local que declara y provee el [paquete retrieval-helmcode](../../packages/retrieval/helmcode/README.md): un índice SQLite bajo el home del harness y las dos operaciones que lo escriben y lo consultan. El paquete publica además las cuatro herramientas que el modelo maneja —`index_workspace`, `index_url`, `knowledge_search` y `export_audit`—, de modo que la capacidad es explícita: no hay interceptor, y ningún texto se indexa ni se recupera a espaldas del agente.

El seam existe porque el modelo necesita respuestas ancladas sobre documentos que el despliegue nombra, y porque el harness no tiene un seam de red por el que encaminar ese tráfico: el núcleo puro recibe un `fetch` inyectado y el cableado le pasa `globalThis.fetch` leído en cada operación, así que el egreso de esta capacidad es una decisión de la composición, no un accidente de los valores por defecto.

## Operaciones

| Operación | Qué hace | Qué cuesta |
|---|---|---|
| `indexSource(source, text, workspace?)` | Trocea el documento, embebe cada trozo por `/v1/embeddings` de Helmcode (`qwen3-embedding`) y REEMPLAZA las filas de esa fuente en el índice, de modo que reindexar un fichero editado no deja trozos viejos compitiendo en la búsqueda. | Una petición de embeddings por lote; ninguna para un documento sin texto utilizable, que es un no-op declarado. |
| `search(query, topN?, workspace?)` | Embebe la consulta, ordena los trozos indexados por coseno bruto sobre el índice local, reranquea los `topK` candidatos por `/v1/rerank` y devuelve los mejores `topN` (`8` y `4` por defecto). | Una petición de embeddings más una de rerank, y ninguna cuando el índice no guarda ningún trozo. |

Las dos operaciones resuelven la clave de la API en `ctx.credentials` al PRINCIPIO de la llamada, así que una clave ausente o rotada es un fallo en la llamada siguiente y no un valor cacheado obsoleto; el índice se abre perezosamente en el primer uso, de modo que un perfil que nunca indexa nunca crea el fichero. La clave, la raíz de la API, la ruta del índice, la tabla de fuentes y los dos tamaños salen del `Config` del plugin; la referencia `HELMCODE_API_KEY` y `<DSH_HOME>/retrieval/index.sqlite` son los valores por defecto.

**El índice se particiona por workspace.** Cada fila lleva el hash del cwd de la sesión y la clave primaria es `(workspace, source, position)`, así que dos proyectos que declaren una fuente con el mismo nombre nunca se pisan los embeddings y una búsqueda solo ve el workspace que la pidió. Una llamada sin cwd cae en su propia partición.

## Qué NO hace

- **Ni búsqueda híbrida ni léxica.** El orden es coseno bruto sobre los vectores guardados más el rerank del proveedor; no hay BM25, ni fusión de rangos recíprocos, ni expansión de consulta, así que una búsqueda por término exacto puede quedar por debajo de un trozo semánticamente próximo.
- **Sin contrato de cita.** Un resultado lleva el nombre lógico `source` y el texto del trozo; el seam no resuelve una ruta de fichero, un rango de líneas ni un identificador estable de documento, y nunca verifica que el texto indexado siga coincidiendo con el fichero en disco.
- **Una sola ruta de embeddings.** Los trozos y las consultas los embebe el mismo modelo de Helmcode; mezclar un segundo embedder compararía en silencio vectores de espacios distintos, así que el seam se niega a adivinarlo.
- **Sin respaldo cuando falta la clave.** Una credencial ausente, un transporte rechazado o un `401`/`402` de Helmcode fallan la llamada con su propio código en vez de degradar a una lista vacía: una respuesta vacía debe significar «el índice no tenía nada», nunca «faltaba la clave».
- **Sin promesa de cobertura.** `index_workspace` informa filas `indexed`, `empty` y `failed` por fuente, y una fuente que falla deja intacto el resto de la ejecución; el seam nunca afirma un corpus exhaustivo.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.es.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxretrieval--retrievalservice"></a>

### `ctx.retrieval` — `RetrievalService`

El seam `ctx.retrieval`: el indice local de recuperacion y las dos operaciones que lo usan, construidas sobre el nucleo puro con la clave resuelta por `ctx.credentials` y el `fetch` inyectado.

El indice se abre PEREZOSAMENTE sobre `indexPath` y se cierra con el plugin. La clave NO se cachea: se resuelve al principio de cada operacion, asi que una clave rotada llega a la siguiente llamada sin reiniciar nada.

```ts cordis-catalog
/**
 * Cuantos trozos guarda el indice local de un workspace.
 *
 * @param workspace - particion del workspace (ver `./workspace.ts`); ausente,
 * la de las llamadas sin cwd.
 * @returns el total de trozos indexados en esa particion; 0 cuando aun no se
 * ha indexado nada ahi.
 */
count(workspace: string = DEFAULT_WORKSPACE_ID): number

/**
 * Trocea, embebe y guarda un documento en el indice local de un workspace.
 *
 * El documento se REEMPLAZA entero DENTRO de su particion: reindexar un
 * fichero editado no deja sus trozos viejos compitiendo en la busqueda, y no
 * toca la fuente del mismo nombre en otro workspace. Un documento sin texto
 * utilizable es un no-op declarado —no se embebe nada, no se toca el indice y
 * no se gasta ninguna peticion—, y la clave se resuelve ANTES de mirar el
 * texto: sin clave esta operacion falla en vez de fingir que indexo.
 *
 * @param source - nombre logico del documento, el que la busqueda cita.
 * @param text - el documento completo.
 * @param workspace - particion del workspace; ausente, la de las llamadas sin cwd.
 * @returns los trozos guardados y las peticiones enviadas a Helmcode.
 * @throws {RetrievalToolError} MISSING_CREDENTIAL sin clave utilizable,
 * NO_TRANSPORT sin `globalThis.fetch`, o el codigo del nucleo (AUTH, CREDITS,
 * RATE_LIMIT, PROVIDER, MALFORMED, DIMENSION) cuando Helmcode rechaza la llamada.
 */
async indexSource(source: string, text: string, workspace: string = DEFAULT_WORKSPACE_ID): Promise<SourceIndexOutcome>

/**
 * Ejecuta `embed → coseno → rerank` sobre el indice local de un workspace.
 *
 * Sin trozos indexados en esa particion no hay recuperacion que hacer y no se
 * manda nada: se DICE. Con trozos, la clave se resuelve antes de embeber la
 * consulta, asi que un fallo de credencial sale como fallo y nunca como una
 * lista vacia.
 *
 * @param query - la consulta del usuario.
 * @param topN - cuantos resultados devolver; ausente, el `topN` de la configuracion.
 * @param workspace - particion del workspace; ausente, la de las llamadas sin cwd.
 * @returns los trozos que tenia esa particion y los resultados reranqueados.
 * @throws {RetrievalToolError} MISSING_CREDENTIAL sin clave utilizable,
 * NO_TRANSPORT sin `globalThis.fetch`, o el codigo del nucleo cuando Helmcode
 * rechaza la llamada.
 */
async search(query: string, topN?: number, workspace: string = DEFAULT_WORKSPACE_ID): Promise<SearchOutcome>
```

Source: [`packages/retrieval/helmcode/src/index.ts`](../../packages/retrieval/helmcode/src/index.ts)
<!-- END GENERATED cordis-surface -->
