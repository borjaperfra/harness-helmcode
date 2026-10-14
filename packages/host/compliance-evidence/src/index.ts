/**
 * Superficie pública del paquete: la función pura del informe y las secciones,
 * más los tipos del contrato de entrada.
 *
 * La CLI no forma parte de esta superficie: se publica como `bin` y se apoya en
 * estas mismas funciones.
 *
 * @module @deepseek-ai/dsh-compliance-evidence/index
 */

export { buildEvidenceReport, GENERATOR_NAME, REPORT_TITLE } from './report.ts'
export {
  SECTION_TITLES,
  buildSections,
  declaredExternalSubagents,
  declaredMcpServers,
  declaredProviders,
  declaredWebSearch,
  dumpRows,
  isVerbatimJs,
  renderValue,
  residencyOf,
  rowLabel,
  sectionAttribution,
  sectionDeploymentRequirement,
  sectionEgressChannels,
  sectionFingerprint,
  sectionInferenceRoutes,
  sectionLocalDataSurface,
  sectionPluginInventory,
  sectionRedactionChannel,
  sectionResidencyMode,
  sectionWhatThisIs,
  TELEMETRY_PLUGIN_NAME,
} from './sections.ts'
export type {
  DeclaredExternalSubagent,
  DeclaredMcpServer,
  DeclaredModel,
  DeclaredProvider,
  DeclaredWebSearch,
  DumpRecord,
  DumpRow,
  EvidenceInput,
  RedactionEvidence,
  Residency,
  ResidencyTable,
  TelemetryEvidence,
  VerbatimJs,
} from './sections.ts'
