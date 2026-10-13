/**
 * Ensamblado del informe de evidencia: la función pura que convierte una entrada
 * tipada (volcado ya parseado, tabla de residencia, sello de tiempo, versión y
 * hash de entrada) en el Markdown del inventario.
 *
 * No importa nada del harness, no lee ficheros y no toca la red: parsear el
 * volcado y calcular el hash es trabajo de la CLI.
 *
 * @module @deepseek-ai/dsh-compliance-evidence
 */

import { buildSections } from './sections.ts'
import type { EvidenceInput } from './sections.ts'

export type {
  DeclaredExternalSubagent,
  DeclaredMcpServer,
  DeclaredModel,
  DeclaredProvider,
  DeclaredWebSearch,
  DumpRecord,
  DumpRow,
  EvidenceInput,
  Residency,
  ResidencyTable,
  TelemetryEvidence,
  VerbatimJs,
} from './sections.ts'

/** Nombre del paquete, tal como se firma en el encabezado del informe. */
export const GENERATOR_NAME = '@deepseek-ai/dsh-compliance-evidence'

/** Título del informe. */
export const REPORT_TITLE = 'Informe de evidencia: residencia de inferencia y canales de salida'

/**
 * Construye el informe completo en Markdown: encabezado más las ocho secciones
 * obligatorias, en orden.
 * @param input - el volcado ya parseado, la tabla de residencia y los metadatos.
 * @returns el Markdown del informe, terminado en salto de línea.
 */
export function buildEvidenceReport(input: EvidenceInput): string {
  return [
    `# ${REPORT_TITLE}`,
    '',
    `_Generado por \`${GENERATOR_NAME}\` v${input.generatorVersion} el ${input.generatedAt} a partir del volcado de configuración compuesta. Es un inventario: no es una prueba de egreso._`,
    '',
    buildSections(input).join('\n\n'),
    '',
  ].join('\n')
}
