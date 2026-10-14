/**
 * El exportador del log de la sesion en Markdown, con la redaccion APLICADA.
 *
 * Por que existe: un DPO o el propio operador necesita el rastro de lo que paso
 * en una sesion, y ese rastro no puede salir en crudo —el log local guarda el
 * contenido original, que es justo el que lleva los datos personales—. Este
 * modulo es la parte PURA de `export_audit`: compone el Markdown y, si hay un
 * redactor montado, lo pasa por el (una sola vez, sobre el documento entero)
 * para que los marcadores del mapa (`[DNI_1]`) aparezcan en el sitio del dato.
 *
 * Dos decisiones que el render declara en vez de esconder:
 *
 * 1. **Si no hay mapa montado, se dice.** El encabezado nombra esa ausencia y
 *    avisa de que el cuerpo va verbatim: un export sin redactar que no lo diga
 *    seria la peor forma de filtrar datos personales.
 * 2. **El orden y el formato son deterministas.** Un evento por seccion, con su
 *    `seq`, su tipo y su hora ISO, y su cuerpo como JSON indentado. El mismo log
 *    produce el mismo Markdown, que es lo que permite compararlo entre sesiones.
 *
 * Nucleo PURO: sin `ctx`, sin herramientas y sin ficheros. El redactor entra
 * como funcion, asi que se prueba sin mapa y sin credenciales.
 *
 * @module @deepseek-ai/dsh-retrieval-helmcode/audit
 */

/** Una entrada del log tal como el exportador la necesita. */
export interface AuditEntry {
  /** Numero de secuencia del evento dentro de la sesion. */
  readonly seq: number
  /** Marca de tiempo del evento, en milisegundos. */
  readonly time: number
  /** El tipo de evento (`user/message`, `tool/call`, ...). */
  readonly type: string
  /** El cuerpo del evento, tal cual se registro. */
  readonly data: unknown
}

/** La cabecera del export: de que sesion es y sobre que workspace corrio. */
export interface AuditSession {
  /** Identificador de la sesion. */
  readonly id: string
  /** El cwd de la sesion, si lo declara. */
  readonly cwd: string | undefined
}

/** El redactor que el export aplica cuando hay un mapa montado. */
export type AuditRedactor = (text: string) => Promise<string>

/**
 * Serializa el cuerpo de un evento para el bloque de codigo.
 *
 * `data ?? null` no es decorativo: `JSON.stringify(undefined)` no devuelve texto,
 * y un cuerpo ausente tiene que salir como `null` en vez de dejar el bloque
 * abierto a medias.
 *
 * @param data - el cuerpo del evento.
 * @returns el JSON indentado.
 */
function serialize(data: unknown): string {
  return JSON.stringify(data ?? null, null, 2)
}

/**
 * Compone el Markdown del log y le aplica la redaccion si hay redactor.
 *
 * @param session - la sesion exportada.
 * @param entries - las entradas del log, en orden.
 * @param redact - el redactor del mapa montado, o `undefined` cuando no hay
 * ninguno: entonces el encabezado lo declara y el cuerpo sale verbatim.
 * @returns el Markdown del log, ya redactado cuando hay mapa.
 * @throws lo que lance el redactor: un mapa que no se puede abrir o sellar es un
 * fallo cerrado, nunca un export sin redactar devuelto en silencio.
 */
export async function renderAuditMarkdown(
  session: AuditSession,
  entries: readonly AuditEntry[],
  redact?: AuditRedactor,
): Promise<string> {
  const redaction = redact === undefined
    ? 'NOT APPLIED — no redaction map is mounted in this composition, so the log below is verbatim'
    : 'applied through the mounted redaction map (markers such as [DNI_1] are stable and restorable by the operator)'
  const lines = [
    '# Session audit export',
    '',
    `- Session: ${session.id}`,
    `- Workspace: ${session.cwd ?? '(unset)'}`,
    `- Events: ${String(entries.length)}`,
    `- Redaction: ${redaction}`,
    '',
  ]
  for (const entry of entries) {
    lines.push(`## ${String(entry.seq)} · ${entry.type} · ${new Date(entry.time).toISOString()}`)
    lines.push('')
    lines.push('```json')
    lines.push(serialize(entry.data))
    lines.push('```')
    lines.push('')
  }
  const markdown = lines.join('\n')
  return redact === undefined ? markdown : redact(markdown)
}
