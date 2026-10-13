/**
 * Redaccion reversible de PII espanola para Helmcode: detectores con checksum
 * real, mapa determinista persistible y cifrado con fallo cerrado.
 *
 * **Sin `apply()` ni `tools` en este corte; el cableado llega despues.** Este
 * paquete es hoy una CAPACIDAD explicita —un nucleo puro que el llamante
 * invoca— y no un interceptor del runtime: el waterfall `llm/stream` prohibe
 * reescribir la peticion y no hay gancho global de admision de contenido, asi
 * que la version honesta es esta (plan §18). El registro del plugin en el
 * perfil y las herramientas `anonymize` / `workspace_read_anonymized` son la
 * parte B.
 *
 * @module @deepseek-ai/dsh-privacy-helmcode
 */

export * from './detect.ts'
export * from './map.ts'
export * from './redact.ts'
export * from './seal.ts'
