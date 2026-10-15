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
  // La politica del despliegue, no la residencia de un modelo: es lo que el chip
  // de la cabecera promete, y solo cuando la guardia corre en `eu-only`.
  'residency.chip': 'UE',
  'residency.chipTitle': 'Residencia europea: la guardia de este despliegue solo admite rutas con residencia en la UE',
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
  // Ajustes: los hechos del despliegue, de solo lectura. Cada fila dice donde se
  // cambia el hecho que muestra.
  'settings.nav': 'Helmcode',
  'settings.intro': 'El estado de tu despliegue de Helmcode. Esta pagina no cambia nada: solo lo muestra.',
  'settings.reading': 'Leyendo…',
  'settings.failed': 'No se pudo leer',
  'settings.apiKey': 'Clave de API',
  'settings.apiKey.configured': 'Configurada',
  'settings.apiKey.missing': 'Sin configurar',
  'settings.apiKey.where': 'La escribe el alta de Helmcode; vive en tu almacén de credenciales.',
  'settings.plan': 'Plan y cuota asumida',
  'settings.plan.value': 'Plan {plan} · {price} · {keys} claves',
  'settings.plan.custom': 'a medida',
  'settings.plan.where': 'El plan del despliegue; la cuota real la conoce la consola de Helmcode.',
  'settings.residency': 'Política de residencia',
  'settings.residency.eu-only': 'Solo UE (lista blanca cerrada)',
  'settings.residency.ask': 'Preguntar por rutas no europeas',
  'settings.residency.open': 'Sin restricción de residencia',
  'settings.residency.absent': 'Sin guardia de residencia montada',
  'settings.residency.where': 'La declara el perfil en la fila de la guardia de residencia.',
  'settings.retention': 'Retención del mapa de anonimización',
  'settings.retention.days': '{days} días',
  'settings.retention.never': 'Sin caducidad declarada',
  'settings.retention.absent': 'Sin canal de anonimización montado',
  'settings.retention.where': 'La declara el perfil en la fila de anonimización.',
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
  'residency.chip': 'EU',
  'residency.chipTitle': 'European residency: this deployment\'s guard only admits routes with EU residency',
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
  'settings.nav': 'Helmcode',
  'settings.intro': 'Your Helmcode deployment\'s state. This page changes nothing: it only shows it.',
  'settings.reading': 'Reading…',
  'settings.failed': 'Could not be read',
  'settings.apiKey': 'API key',
  'settings.apiKey.configured': 'Configured',
  'settings.apiKey.missing': 'Not configured',
  'settings.apiKey.where': 'The Helmcode onboarding writes it; it lives in your credential store.',
  'settings.plan': 'Plan and assumed quota',
  'settings.plan.value': '{plan} plan · {price} · {keys} keys',
  'settings.plan.custom': 'custom',
  'settings.plan.where': 'The deployment declares the plan; the real quota is the Helmcode console\'s to know.',
  'settings.residency': 'Residency policy',
  'settings.residency.eu-only': 'EU only (closed allowlist)',
  'settings.residency.ask': 'Ask about non-European routes',
  'settings.residency.open': 'No residency restriction',
  'settings.residency.absent': 'No residency guard mounted',
  'settings.residency.where': 'The profile declares it on the residency guard\'s row.',
  'settings.retention': 'Redaction map retention',
  'settings.retention.days': '{days} days',
  'settings.retention.never': 'No expiry declared',
  'settings.retention.absent': 'No redaction channel mounted',
  'settings.retention.where': 'The profile declares it on the privacy row.',
  'eyebrow.plan': '// plan',
  'eyebrow.residency': '// residency',
  'eyebrow.identity': '// identity',
} satisfies Record<HelmcodeKey, string>

/** Locale namespace owned by this package; `common` and `settings.locale` have exactly one occupant. */
export const NS = 'helmcode'
