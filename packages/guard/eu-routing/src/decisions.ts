/**
 * La decision de egreso: que ruta de modelo y que herramienta pueden salir fuera
 * de la UE.
 *
 * Modulo puro y sin imports: la decision es funcion de sus argumentos y de nada
 * mas. Se puede probar sin montar el harness y el mismo veredicto se reproduce
 * en el `apply()` cuando el paquete entre en el checkout, en lugar de depender de
 * una politica que alguien pueda desactivar en tiempo de ejecucion.
 *
 * Las tres reglas que este modulo materializa, y el porque de cada una:
 *
 * 1. **Default-deny, nunca fail-open.** En `eu-only` se veta CUALQUIER residencia
 *    que no sea exactamente `'eu'`, incluida la de un modelo que no este en la
 *    tabla. La tabla es una lista blanca cerrada, no una lista negra: la lectura
 *    es `table[clave] ?? 'unknown'` y `'unknown' !== 'eu'`, asi que ni lo que
 *    descubra `registerModelDiscovery` ni lo que Helmcode anada manana hereda un
 *    permiso que nadie le dio. El esqueleto anterior —`residency === 'us'`— era
 *    fail-open y es el hallazgo bloqueante de la auditoria (§17.1 del plan).
 * 2. **Hay egreso fuera del waterfall `llm/stream`.** Los subagentes externos son
 *    CLIs fuera de proceso que hablan con los endpoints de OpenAI y Anthropic por
 *    su cuenta, un servidor MCP abre su propio trafico y `web_fetch` sale a una
 *    URL arbitraria. Ningun waterfall del runtime los ve, de modo que la guardia
 *    por modelo no los cubre: por eso existe `decideTool`.
 * 3. **No se degrada ni se pregunta en silencio.** Cambiar de modelo o dejar pasar
 *    una llamada cambia el tratamiento del dato en un cliente regulado, y eso es
 *    decision del humano.
 *
 * **Que hace `ask`, y por que no pregunta.** El seam de aprobacion del harness es
 * por herramienta y fail-closed: `tools/pre-execute` sabe responder `ask`, pero la
 * aprobacion se pide para UNA herramienta y, sin servicio de aprobacion montado,
 * `ask` degrada a denegacion (`packages/core/tools/src/index.ts:143-148` y
 * `serviceAsk`, `:1716-1737`). **No hay** canal de consentimiento por llamada de
 * modelo en el que este nucleo pueda apoyarse, y el plan prohibe decidir en
 * silencio (§17.3). Prometer una pregunta que el codigo no puede hacer seria peor
 * que vetar, asi que `ask` veta con `RESIDENCY_REFUSED` todo lo que no sea
 * exactamente `eu`, y la razon explica que el consentimiento interactivo por
 * llamada de modelo todavia no existe (el seam de aprobacion es por herramienta y
 * fail-closed) y que `open` es la via para autorizar el egreso a sabiendas.
 *
 * La residencia `eu` si pasa en `ask`: vetarla no protegia nada —no hay egreso que
 * evitar— y dejaba a `ask` sin lectura util. Un `ask` que permitiese `us` o
 * `unknown` seria un `open` disfrazado, y eso es lo que se veta.
 *
 * La misma asimetria explica por que `decideTool` solo veta en `eu-only`: en el
 * seam de herramientas ya hay una aprobacion fail-closed, de modo que `ask` no
 * necesita duplicarla; en la ruta de modelo no hay ninguna, y por eso `ask` veta
 * cuando la residencia no es `eu`.
 *
 * @module @deepseek-ai/dsh-guard-eu-routing/decisions
 */

/**
 * El modo de la guardia, tal como lo declara el perfil.
 *
 * - `eu-only`: solo residencia `'eu'`. Es el modo del cliente regulado y el unico
 *   que promete algo por si mismo. Default-deny.
 * - `ask`: deja pasar la residencia `'eu'` y veta `'us'` y `'unknown'`. El harness
 *   no puede preguntar por llamada de modelo —el seam de aprobacion es por
 *   herramienta y fail-closed—, asi que veta y explica que `open` es la via para
 *   autorizar. Ver el docblock del modulo.
 * - `open`: uso interno y benchmarks. Permite siempre, tambien `'us'`.
 *
 * El modo por defecto del plugin es `open` y no `eu-only`: el modo es una
 * decision del perfil del cliente (es su despliegue, y su tratamiento del dato),
 * no de la maquina de desarrollo, que no es un despliegue regulado; y un
 * `eu-only` por defecto romperia rutas legitimas que no estan en la tabla de
 * residencia, empezando por las del propio perfil del usuario.
 */
export type ResidencyMode = 'eu-only' | 'ask' | 'open'

/**
 * Donde corre de verdad la inferencia.
 *
 * `'unknown'` no es `'eu'` ni un valor neutro: en `eu-only` es un veto. La
 * ausencia de entrada en la tabla se lee como `'unknown'`, nunca como permiso.
 */
export type Residency = 'eu' | 'us' | 'unknown'

/**
 * Residencia por ruta de modelo, con clave `provider + '/' + model`.
 *
 * La ausencia de clave es `'unknown'`: no hace falta enumerar los proveedores
 * ajenos para que queden vetados en `eu-only`, porque la lista es la blanca y no
 * la negra.
 */
export interface ResidencyTable {
  [providerModel: string]: Residency
}

/**
 * Las herramientas que abren su propio trafico de red, es decir las que no pasan
 * por el waterfall `llm/stream` y por tanto no las cubre la guardia por modelo.
 *
 * Una entrada que termina en `*` es una regla de prefijo y cubre a toda
 * herramienta cuyo nombre empiece por lo que hay antes del asterisco. Hace falta
 * porque los nombres de herramienta de un servidor MCP se construyen en tiempo de
 * ejecucion (`mcp__<serverName>__<rawName>`) y no se pueden enumerar de antemano.
 */
export interface EgressToolTable {
  readonly tools: readonly string[]
}

/**
 * El veredicto de la guardia.
 *
 * `deny` siempre lleva un `code` para que el consumidor enrute por el y no por el
 * texto, y una `reason` legible que dice que se ha vetado y como cambiarlo.
 *
 * `MODE_OPEN_BUT_UNCLASSIFIED` queda reservado: la logica de los tres modos de hoy
 * no lo emite, porque `open` permite siempre sin excepcion por clasificacion. Esta
 * en el tipo para que el cableado del plugin pueda distinguir "permitido por
 * politica abierta" de "permitido porque no habia clasificacion que lo prohibiera"
 * sin cambiar este contrato.
 */
export type EgressDecision =
  | { kind: 'allow' }
  | {
    kind: 'deny'
    reason: string
    code: 'EGRESS_TOOL_DENIED' | 'RESIDENCY_REFUSED' | 'MODE_OPEN_BUT_UNCLASSIFIED'
  }

/**
 * La clave de la tabla de residencia: `provider + '/' + model`.
 * @param provider - el id del proveedor de la ruta.
 * @param model - el id del modelo de la ruta.
 * @returns la clave con la que se consulta la tabla.
 */
export function routeKey(provider: string, model: string): string {
  return `${provider}/${model}`
}

/** El unico camino de permitido; se devuelve un objeto nuevo en cada llamada. */
function allow(): EgressDecision {
  return { kind: 'allow' }
}

/**
 * La residencia DECLARADA de una ruta, con la lectura default-deny de la tabla.
 *
 * Es la unica consulta a la tabla, compartida por la decision
 * ({@link decideModelRoute}) y por la cara de lectura que consume la interfaz
 * (`ctx.guardEuRouting`), de modo que la etiqueta que ve un humano y el veto no
 * puedan divergir. Un valor fuera de la tabla —o un valor que la tabla declare
 * pero no sea `'eu'` ni `'us'`, cosa que un fichero de perfil puede escribir—
 * se lee `'unknown'`, nunca como permiso.
 *
 * @param table - lista blanca de residencia por `provider/model`.
 * @param provider - Proveedor de la ruta, tal como lo registra el harness.
 * @param model - Id del modelo dentro de ese proveedor.
 * @returns la residencia declarada, o `'unknown'` cuando no hay entrada utilizable.
 */
export function declaredResidency(table: ResidencyTable, provider: string, model: string): Residency {
  const value = table[routeKey(provider, model)]
  return value === 'eu' || value === 'us' ? value : 'unknown'
}

/**
 * Decide si una ruta de modelo puede usarse en el modo dado.
 *
 * El `reason` del veto es TEXTO PLANO, como los renders de nuestras
 * herramientas: la superficie que lo muestre decide el color, y un nombre de
 * herramienta o una ruta tecnica irian alli en `accent-text` o en gris, nunca en
 * el indigo base (presupuesto de acento del brandbook).
 *
 * @param mode - Modo de la guardia.
 * @param table - Lista blanca de residencia por `provider/model`.
 * @param provider - Proveedor de la ruta, tal como lo registra el harness.
 * @param model - Id del modelo dentro de ese proveedor.
 * @returns `allow`, o `deny` con `RESIDENCY_REFUSED` y la razon del veto.
 */
export function decideModelRoute(
  mode: ResidencyMode,
  table: ResidencyTable,
  provider: string,
  model: string,
): EgressDecision {
  // Uso interno y benchmarks: no hay politica de residencia que aplicar.
  if (mode === 'open') return allow()

  const route = routeKey(provider, model)
  // Default-deny en una linea: lo que no esta declarado es 'unknown', y
  // 'unknown' no es 'eu'. No se consulta ninguna lista negra.
  const residency = declaredResidency(table, provider, model)

  if (mode === 'ask') {
    // `ask` deja pasar la ruta europea: no hay egreso que consentir. Todo lo
    // demas —`'us'` y `'unknown'`— se veta, porque preguntar por llamada de
    // modelo no es algo que este nucleo pueda hacer.
    if (residency === 'eu') return allow()

    return {
      kind: 'deny',
      code: 'RESIDENCY_REFUSED',
      reason:
        `la ruta "${route}" queda vetada en modo 'ask' (residencia declarada: '${residency}'). `
        + 'El consentimiento interactivo por llamada de modelo todavia no existe: el seam de '
        + 'aprobacion del harness es por herramienta y fail-closed, asi que la guardia no puede '
        + 'preguntar y no decide en silencio (§17.3). Las rutas con residencia \'eu\' si pasan en '
        + 'este modo; para autorizar el egreso de esta ruta, cambia el modo a \'open\' (o a '
        + '\'eu-only\' si lo que quieres es exigir la lista blanca de la UE sin preguntar).',
    }
  }

  // 'eu-only': lista blanca cerrada. Solo el valor exacto 'eu' pasa; 'us' y
  // 'unknown' (que incluye todo modelo ausente de la tabla) se vetan.
  if (residency === 'eu') return allow()

  return {
    kind: 'deny',
    code: 'RESIDENCY_REFUSED',
    reason:
      `la ruta "${route}" no tiene residencia 'eu' (declarada: '${residency}'). En modo 'eu-only' `
      + 'la tabla es una lista blanca cerrada: todo lo que no sea exactamente \'eu\' se veta, este '
      + 'o no en la tabla. Si el modelo corre de verdad en la UE, anadelo a la tabla con residencia '
      + '\'eu\'; si sale fuera, cambia el modo a \'open\' y asume el egreso.',
  }
}

/**
 * Decide si una herramienta puede ejecutarse en el modo dado.
 *
 * Solo `eu-only` veta: `ask` y `open` permiten, porque el seam de herramientas ya
 * es fail-closed por si mismo y este nucleo no duplica esa aprobacion. La razon
 * del veto viaja como texto sin formato, igual que el resto de nuestros informes
 * tecnicos: no gasta acento por si misma.
 *
 * @param mode - Modo de la guardia.
 * @param egressTools - Herramientas con egreso propio (nombre exacto o prefijo `*`).
 * @param toolName - Nombre con el que el modelo invoca la herramienta.
 * @returns `allow`, o `deny` con `EGRESS_TOOL_DENIED` y la razon del veto.
 */
export function decideTool(
  mode: ResidencyMode,
  egressTools: EgressToolTable,
  toolName: string,
): EgressDecision {
  if (mode !== 'eu-only') return allow()

  const rule = matchEgressRule(egressTools, toolName)
  if (rule === undefined) return allow()

  return {
    kind: 'deny',
    code: 'EGRESS_TOOL_DENIED',
    reason:
      `la herramienta "${toolName}" tiene egreso propio (regla "${rule}"): no pasa por el waterfall `
      + 'llm/stream ni por la guardia de residencia por modelo, de modo que un modelo europeo no la '
      + 'cubre ni la hace conforme. En modo \'eu-only\' se deniega. Cambia el modo a \'open\' si esta '
      + 'salida es deliberada, o sustituyela por una herramienta que no abra trafico propio.',
  }
}

/**
 * La primera regla de la tabla que cubre el nombre dado.
 *
 * Una entrada terminada en `*` es prefijo; cualquier otra es nombre exacto. El
 * orden de la tabla decide, y por eso la tabla se declara de lo concreto a lo
 * general.
 */
function matchEgressRule(egressTools: EgressToolTable, toolName: string): string | undefined {
  for (const entry of egressTools.tools) {
    if (entry.endsWith('*')) {
      if (toolName.startsWith(entry.slice(0, -1))) return entry
      continue
    }
    if (entry === toolName) return entry
  }
  return undefined
}
