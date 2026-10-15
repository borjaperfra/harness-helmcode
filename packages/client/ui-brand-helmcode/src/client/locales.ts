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
  // La rotulacion honesta de la tarjeta: el limite real es por key y por
  // organizacion, y quien lo conoce es la consola.
  'quota.estimate.notice': 'Estimación local — la verdad está en la consola de Helmcode',
  'quota.rpm': 'RPM {rpm}/{limit}',
  'quota.bucket.sota': 'SOTA',
  'quota.bucket.addon': 'Add-on GLM',
  'quota.bucket.unlimited': 'Ilimitado',
  'quota.status.ok': 'En orden',
  'quota.status.low': 'Queda poco',
  'quota.status.exhausted': 'Agotado',
  // Onboarding de la clave: tres pasos, del alta en la consola al modelo por defecto.
  'onboarding.createKey': 'Crea tu API key',
  'onboarding.pasteKey': 'Pégala aquí',
  'onboarding.chooseModel': 'Elige el modelo',
  'onboarding.title': 'Configura tu clave de Helmcode',
  'onboarding.stepLabel': 'Paso {step} de {total}',
  'onboarding.openConsole': 'Abrir cloud.helmcode.com',
  'onboarding.consoleHint': 'cloud.helmcode.com → API Keys',
  'onboarding.pastePlaceholder': 'Pega aquí tu API key',
  'onboarding.pasteHint': 'La clave se guarda en tu almacén de credenciales, nunca en el fichero de configuración.',
  'onboarding.modelsHint': 'Los cuatro modelos que sirve la ruta europea.',
  'onboarding.model.helmcode/deepseek-v4-flash': 'DeepSeek V4.1 Flash',
  'onboarding.model.helmcode/glm5.3-flash': 'GLM 5.3 Flash',
  'onboarding.model.helmcode/qwen3.6': 'Qwen 3.6',
  'onboarding.model.helmcode/gemma4': 'Gemma 4',
  'onboarding.next': 'Continuar',
  'onboarding.save': 'Guardar clave',
  'onboarding.finish': 'Terminar',
  'onboarding.saveError': 'La clave no se pudo guardar',
  'onboarding.saved': 'Clave guardada',
  'onboarding.saving': 'Guardando…',
  // Bienvenida: la primera pantalla de una sesion nueva. Una linea y la lista
  // de los cuatro modelos de la ruta europea; nada mas.
  'welcome.valueProposition': 'Inferencia europea. Tarifa plana. Cero registros.',
  'welcome.models': 'Los cuatro modelos de la ruta europea',
  // Operador: a quien pertenece la sesion, para el export y el informe.
  'operator.session': 'Operador de la sesión',
  // Indice de recuperacion local.
  'index.recovery': 'Índice de recuperación',
  'index.workspace': 'Indexar workspace',
  'index.search': 'Buscar en el conocimiento',
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
  'quota.estimate.notice': 'Local estimate — the truth lives in the Helmcode console',
  'quota.rpm': 'RPM {rpm}/{limit}',
  'quota.bucket.sota': 'SOTA',
  'quota.bucket.addon': 'GLM add-on',
  'quota.bucket.unlimited': 'Unlimited',
  'quota.status.ok': 'In order',
  'quota.status.low': 'Running low',
  'quota.status.exhausted': 'Exhausted',
  'welcome.valueProposition': 'European inference. Flat rate. Zero logs.',
  'welcome.models': 'The four models of the European route',
  'operator.session': 'Session operator',
  'index.recovery': 'Recovery index',
  'index.workspace': 'Index workspace',
  'index.search': 'Search knowledge',
  'onboarding.createKey': 'Create your API key',
  'onboarding.pasteKey': 'Paste it here',
  'onboarding.chooseModel': 'Choose the model',
  'onboarding.title': 'Set up your Helmcode key',
  'onboarding.stepLabel': 'Step {step} of {total}',
  'onboarding.openConsole': 'Open cloud.helmcode.com',
  'onboarding.consoleHint': 'cloud.helmcode.com → API Keys',
  'onboarding.pastePlaceholder': 'Paste your API key here',
  'onboarding.pasteHint': 'The key is stored in your credential store, never in the configuration file.',
  'onboarding.modelsHint': 'The four models the European route serves.',
  'onboarding.model.helmcode/deepseek-v4-flash': 'DeepSeek V4.1 Flash',
  'onboarding.model.helmcode/glm5.3-flash': 'GLM 5.3 Flash',
  'onboarding.model.helmcode/qwen3.6': 'Qwen 3.6',
  'onboarding.model.helmcode/gemma4': 'Gemma 4',
  'onboarding.next': 'Continue',
  'onboarding.save': 'Save key',
  'onboarding.finish': 'Finish',
  'onboarding.saveError': 'The key could not be stored',
  'onboarding.saved': 'Key stored',
  'onboarding.saving': 'Saving…',
  'eyebrow.plan': '// plan',
  'eyebrow.residency': '// residency',
  'eyebrow.identity': '// identity',
} satisfies Record<HelmcodeKey, string>

/** Locale namespace owned by this package; `common` and `settings.locale` have exactly one occupant. */
export const NS = 'helmcode'
