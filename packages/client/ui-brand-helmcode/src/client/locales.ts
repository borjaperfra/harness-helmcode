/**
 * The `helmcode` namespace dictionaries: the brand owns its own voice.
 *
 * The Helmcode surfaces speak a vocabulary no upstream namespace carries —
 * residency, plan quota, session operator, the recovery index, the API-key
 * onboarding — and the two namespaces that could hold it are single-occupant:
 * `common` belongs to the locale plugin and `settings.locale` to its settings
 * row, so a second writer would be a duplicate registration. A product voice
 * that lives in someone else's dictionary also cannot change without editing
 * that owner, which is the reason this package ships its own namespace.
 *
 * Spanish is the source of truth (the language this deployment speaks) and the
 * English dictionary is checked complete against its key set, so a key added to
 * one language is a compile error until it exists in the other.
 */

/** Spanish dictionary (the key-set source of truth). */
export const es = {
  // Residencia: la etiqueta corta que el selector de modelos pinta junto a la ruta.
  'residency.eu': 'Residencia UE',
  'residency.us': 'Residencia EE. UU.',
  'residency.unknown': 'Residencia desconocida',
  // Cuota: lo que cubre el plan y lo que se estima en local.
  'quota.plan': 'Cuota del plan',
  'quota.localEstimate': 'Estimación local',
  'quota.sota': 'SOTA',
  // Operador: a quien pertenece la sesion, para el export y el informe.
  'operator.session': 'Operador de la sesión',
  // Indice de recuperacion local.
  'index.recovery': 'Índice de recuperación',
  'index.workspace': 'Indexar workspace',
  'index.search': 'Buscar en el conocimiento',
  // Onboarding de la clave.
  'onboarding.createKey': 'Crea tu API key',
  'onboarding.pasteKey': 'Pégala aquí',
  'onboarding.chooseModel': 'Elige el modelo',
  // Eyebrows: el titulo en `//` de las secciones propias de Helmcode.
  'eyebrow.plan': '// plan',
  'eyebrow.residency': '// residencia',
  'eyebrow.identity': '// identidad',
} satisfies Record<string, string>

/** The `helmcode` namespace key union. */
export type HelmcodeKey = keyof typeof es

/** English dictionary, checked complete against the es key set. */
export const en = {
  'residency.eu': 'EU residency',
  'residency.us': 'US residency',
  'residency.unknown': 'Unknown residency',
  'quota.plan': 'Plan quota',
  'quota.localEstimate': 'Local estimate',
  'quota.sota': 'SOTA',
  'operator.session': 'Session operator',
  'index.recovery': 'Recovery index',
  'index.workspace': 'Index workspace',
  'index.search': 'Search knowledge',
  'onboarding.createKey': 'Create your API key',
  'onboarding.pasteKey': 'Paste it here',
  'onboarding.chooseModel': 'Choose the model',
  'eyebrow.plan': '// plan',
  'eyebrow.residency': '// residency',
  'eyebrow.identity': '// identity',
} satisfies Record<HelmcodeKey, string>

/** Locale namespace owned by this package; `common` and `settings.locale` have exactly one occupant. */
export const NS = 'helmcode'
