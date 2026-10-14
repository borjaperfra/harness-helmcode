# Identidad local del operador

[English](identity.md) | Español

`ctx.identityLocal` es la atribución durable de operador que declara y provee el [paquete identity-local](../../packages/identity/identity-local/README.md). ESTO ES ATRIBUCIÓN, NO AUTENTICACIÓN: el seam nombra a la persona a la que pertenece una sesión, y no añade credencial, ni sección de prompt, ni puerta, de modo que quien tiene la URL de arranque sigue siendo el dueño del harness.

El seam existe para que las sesiones, las exportaciones y el informe de evidencia puedan atribuir trabajo a una persona en un nodo compartido, y para que el estado sin atribuir sea una ausencia declarada en vez de un valor por defecto adivinado.

## Qué hace el seam

- **Registra la atribución en el log.** El comando host `/operator <nombre>` añade un evento de sesión `identity/operator` con el nombre y el instante ISO. El evento es durable y SOLO-LOG: no es un evento de superficie, así que nunca entra en el transcript del modelo.
- **Siembra desde el perfil.** `defaultOperator` es la semilla de toda sesión cuyo log no registre un evento propio, y es semilla y no respaldo: un evento que registra `null` limpia la sesión para siempre, así que un valor por defecto de despliegue no puede volver a atribuir una sesión que el usuario desatribuyó.
- **Pliega la proyección `operator`.** `ctx.sessionProjections` registra la unidad `operator`, cuyo estado es la última atribución registrada o la semilla del perfil; `operator(session)` lo lee por `ctx.identityLocal` y contesta `undefined` cuando no hay nada atribuido.
- **Avisa de un operador ausente sin bloquear.** `requireOperator: true` escribe un aviso en el log del proceso cuando una sesión nace sin operador; no abre turno, no añade evento de sesión y nunca rechaza la sesión.
- **Mantiene el log honesto.** Un nombre vacío o solo con espacios no registra nada, y reafirmar el operador efectivo no añade nada, de modo que el log conserva el instante del cambio y no el de cada clic.

## Qué NO hace

- **No es autenticación.** Sin credencial, sin puerta de sesión y sin autorización por petición: cualquier llamante que alcance el harness puede atribuir una sesión, y la atribución por sí sola nunca restringe lo que esa sesión puede hacer.
- **No separa usuarios en un nodo.** La unidad atribuye sesiones; dos personas que comparten un home del harness comparten el credential store, el workspace y cualquier otra capacidad exactamente igual que antes.
- **Nunca inventa un operador.** Una sesión sin atribuir sigue sin atribuir (`operator()` devuelve `undefined`) en vez de heredar un nombre que nadie registró, y el aviso de `requireOperator` es una línea de log, no un mensaje visible para el modelo.
- **No posee política propia.** No hay censo de operadores, ni lista blanca, ni validación más allá de un nombre no vacío tras recortar espacios; un despliegue que necesite autorización compone un componente que la imponga.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.es.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxidentitylocal--identitylocalservice"></a>

### `ctx.identityLocal` — `IdentityLocalService`

Owns the deployment's local operator attribution: the durable log-only `identity/operator` event, the `operator` session projection, the `/operator` command, and the `ctx.identityLocal` read face the export and the evidence report use. Requires `ctx.sessionProjections`; the command child activates only when a command registry is composed.

```ts cordis-catalog
/**
 * The operator one session is attributed to.
 * @param session - the session whose attribution is read.
 * @returns the attributed operator and its instant, or `undefined` when the
 * session has none (never recorded, or cleared by the log).
 * @throws when the `operator` session projection is not registered.
 */
operator(session: Session): OperatorIdentity | undefined

/**
 * Record a session's operator as durable, log-only attribution. An empty or
 * whitespace-only name records NOTHING (fail-soft: a caller gets no event
 * carrying an empty operator instead of a broken attribution), and
 * re-asserting the effective operator appends nothing, so the log keeps the
 * instant of the change rather than of every click.
 * @param session - the session the attribution belongs to.
 * @param name - the operator name to record.
 * @returns `true` when an `identity/operator` event was appended.
 * @throws when the `operator` session projection is not registered.
 */
set(session: Session, name: string): boolean

/**
 * Clear a session's attribution by RECORDING the clear, so the profile default
 * cannot re-attribute a session the user un-attributed. A session with nothing
 * attributed appends nothing.
 * @param session - the session to clear.
 * @returns `true` when the clearing `identity/operator` event was appended.
 * @throws when the `operator` session projection is not registered.
 */
clear(session: Session): boolean
```

Types: [Session](session.es.md)

Source: [`packages/identity/identity-local/src/index.ts`](../../packages/identity/identity-local/src/index.ts)
<!-- END GENERATED cordis-surface -->
