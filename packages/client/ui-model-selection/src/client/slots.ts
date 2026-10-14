/**
 * ModelSelect's injected face. The target 'conversation.input.model' seat is
 * declared (children table) and typed by ui-conversation's composer-bar
 * entry; this package only contributes the single occupant, so no SlotMap
 * merge lives here.
 */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { ModelCatalogModel, ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ModelDirectoryState } from './directory.ts'

/**
 * La residencia que el catalogo declara para una ruta, derivada del cable para
 * que no exista una segunda tabla que pueda contradecir al veto.
 *
 * `'unknown'` no es un valor neutro: es lo que el modo `eu-only` de la guardia
 * veta, y es la lectura de una ruta que el despliegue no declara —incluida la
 * composicion sin guardia montada, donde nadie declaro nada.
 */
export type ResidencyKind = NonNullable<ModelCatalogModel['residency']>

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
   * Traduce la residencia que el modelo del catalogo declara al texto de la
   * etiqueta, en el vocabulario de la marca. La residencia NO se pregunta aqui:
   * viaja en el propio modelo, resuelta por el Host al servir el catalogo, de
   * modo que esta cara solo aporta el idioma.
   *
   * OPCIONAL: sin esta cara el asiento no pinta etiqueta (fail-soft), igual que
   * un modelo que no trae residencia.
   * @param kind - residencia declarada por el modelo del catalogo.
   * @returns el texto corto de la etiqueta, o undefined cuando el diccionario de
   * la marca no resuelve la clave.
   */
  residencyLabel?: (kind: ResidencyKind) => string | undefined
}
