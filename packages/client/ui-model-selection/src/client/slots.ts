/**
 * ModelSelect's injected face. The target 'conversation.input.model' seat is
 * declared (children table) and typed by ui-conversation's composer-bar
 * entry; this package only contributes the single occupant, so no SlotMap
 * merge lives here.
 */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ModelDirectoryState } from './directory.ts'

/**
 * La residencia declarada de una ruta de modelo, ya traducida para la etiqueta
 * que el selector pinta junto al nombre del modelo.
 *
 * La etiqueta es texto tecnico pequeño: su color lo lleva el punto de estado
 * (verde `eu`, ambar `us`, gris `unknown`) y el texto va en el tono de caption,
 * de modo que el indigo de acento quede para los pocos momentos fuertes que una
 * pantalla puede tener (presupuesto de acento del brandbook).
 */
export interface ModelResidency {
  /** La residencia declarada de la ruta. */
  readonly kind: 'eu' | 'us' | 'unknown'
  /** Texto corto del diccionario `helmcode` de la marca. */
  readonly label: string
}

/** Injected business face of the composer model seat. */
export interface ModelSelectInjected {
  /** Whether this session supports Agent-bound model inspection and selection. */
  available: boolean
  /** The session's shared directory store (same instance the /model popup reads). */
  directory: SnapshotStore<ModelDirectoryState>
  /** Ensure the shared advisory catalog is loaded (errors land on the store). */
  load: () => void
  /**
   * Select a complete provider/model/reasoning selection.
   * @param selection - model selection and optional adapter-owned effort.
   * @returns the Host outcome, or undefined when this Session cannot select a model.
   */
  select: (selection: ModelSelection) => Promise<RemoteResult<void> | undefined>
  /**
   * Residencia declarada de una ruta, o `undefined` cuando la guardia de
   * residencia no esta montada en este contexto: FAIL-SOFT, sin guardia no hay
   * etiqueta. Se pregunta al pintar —no al construir esta cara— para que una
   * guardia montada despues de la ultima seleccion de sesion tambien cuente.
   * @param provider - provider id of the row's route.
   * @param model - model id inside that provider.
   * @returns the badge to paint, or undefined without a mounted guard.
   */
  residency?: (provider: string, model: string) => ModelResidency | undefined
}
