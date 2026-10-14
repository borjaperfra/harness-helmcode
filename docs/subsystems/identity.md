# Local Operator Identity

English | [Español](identity.es.md)

`ctx.identityLocal` is the durable operator attribution the [identity-local package](../../packages/identity/identity-local/README.md) declares and provides. THIS IS ATTRIBUTION, NOT AUTHENTICATION: the seam names the person a session belongs to, and it adds no credential, no prompt section and no gate, so whoever holds the launch URL still owns the harness.

The seam exists so that sessions, exports and the evidence report can attribute work to a person on a shared node, and so that the unattributed state is a declared absence rather than a guessed default.

## What the seam does

- **Records attribution in the log.** The `/operator <name>` host command appends one `identity/operator` session event carrying the name and the ISO instant. The event is durable and LOG-ONLY: it is not a surface event, so it never enters the model transcript.
- **Seeds from the profile.** `defaultOperator` is the seed of every session whose log records no event of its own, and it is a seed rather than a fallback: an event that records `null` clears the session for good, so a deployment-wide default cannot re-attribute a session the user un-attributed.
- **Folds the `operator` projection.** `ctx.sessionProjections` registers the `operator` unit, whose state is the latest recorded attribution or the profile-default seed; `operator(session)` reads it through `ctx.identityLocal` and answers `undefined` when nothing is attributed.
- **Reports a missing operator without blocking.** `requireOperator: true` writes one warning to the process log when a session starts with no operator; it opens no turn, appends no session event and never refuses the session.
- **Keeps the log honest.** An empty or whitespace-only name records nothing, and re-asserting the effective operator appends nothing, so the log keeps the instant of the change rather than the instant of every click.

## What it does not do

- **It is not authentication.** No credential, no session gate and no per-request authorization: any caller that reaches the harness can attribute a session, and attribution alone never restricts what that session may do.
- **It does not separate users on one node.** The unit attributes sessions; two people sharing one harness home share the credential store, the workspace and every other capability exactly as before.
- **It never invents an operator.** An unattributed session stays unattributed (`operator()` returns `undefined`) instead of inheriting a name nobody recorded, and the `requireOperator` notice is a log line, not a model-visible message.
- **It owns no policy of its own.** There is no operator roster, no allow-list and no validation beyond a non-empty trimmed name; a deployment that needs authorization composes a component that enforces it.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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

Types: [Session](session.md)

Source: [`packages/identity/identity-local/src/index.ts`](../../packages/identity/identity-local/src/index.ts)
<!-- END GENERATED cordis-surface -->
