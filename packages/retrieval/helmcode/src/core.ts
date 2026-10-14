/**
 * El nucleo puro de recuperacion de Helmcode, reexportado en un solo modulo: el
 * troceador consciente de parrafos, el embedder, el reranker, el indice local y
 * el pipeline `embed → coseno → rerank`.
 *
 * Vive aparte de `./index.ts` porque `index.ts` es el CABLEADO —el seam
 * `ctx.retrieval` y las dos herramientas—: este fichero mantiene la superficie
 * publica del nucleo en un sitio que el cableado no ensucia, y `index.ts` lo
 * reexporta entero. Nada de lo que hay aqui conoce el harness: no hay `apply()`,
 * ni seam, ni herramienta, y todo se prueba sin clave de API y sin red, porque
 * el `fetch` es inyectable, el reloj y la espera tambien, y el indice acepta un
 * fichero `:memory:`.
 *
 * @module @deepseek-ai/dsh-retrieval-helmcode/core
 */

export * from './chunk.ts'
export * from './embed.ts'
export * from './errors.ts'
export * from './http.ts'
export * from './rerank.ts'
export * from './search.ts'
export * from './store.ts'
