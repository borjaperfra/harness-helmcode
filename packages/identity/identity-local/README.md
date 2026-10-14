---
description: "Durable session-to-operator attribution for the Helmcode layer: the /operator command, the log-only identity/operator event and the operator session projection behind the ctx.identityLocal read face, with no authentication layer."
kind: "package-reference"
---

# @deepseek-ai/dsh-identity-local

## Summary

This package attributes each session to a local operator. The `/operator <name>` host command appends one durable, log-only `identity/operator` event, the `operator` session projection folds that event into a state seeded by the profile's `defaultOperator`, and `ctx.identityLocal` is the read face the export and the evidence report use. THIS IS ATTRIBUTION, NOT AUTHENTICATION: the plugin adds no credential, no gate and no prompt, so whoever holds the launch URL still owns the harness. An unattributed session stays unattributed — a declared absence, never a guessed default.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin, optionally seed a deployment-wide operator, and attribute sessions with the `/operator` command.

### When to choose it

Choose it when a deployment must record who each session belongs to — for an export, an audit trail or an evidence report — on a machine that may serve more than one person. Avoid it as access control: it never restricts who may use the harness, and it cannot separate two people who share one harness home.

### Setting it up

The operator of a deployment is a deployment fact, so the profile supplies it and a shared bundle does not.

```yaml
- id: identity-local
  name: '@deepseek-ai/dsh-identity-local'
  config:
    defaultOperator: 'ana'
    requireOperator: true
```

`defaultOperator` is the seed of every session whose log records no event of its own; `requireOperator` writes one process-log warning when a session starts with no operator and never blocks the session. The command child activates only when a command registry is composed.

### What you get

`/operator <name>` attributes the session and `/operator clear` records a clear; `/operator` with no argument answers the current attribution and whether it came from the profile seed or from a recorded event. `ctx.identityLocal.operator(session)` answers the name and the instant the log recorded it, or `undefined` when the session has none.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains how the event, the projection and the read face compose and points at the code that realizes them; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

The package copies the permission-preset pattern for three reasons:

- **The event is the record.** Attribution is one durable `identity/operator` event, not a mutable field, so the log owns the instant and the history of every change.
- **The event stays out of the transcript.** It is not a surface event, so the model never sees who the operator is; attribution is metadata for the deployment, not context for the model.
- **The clear is recorded, not omitted.** A `null` operator is a recorded clear, so the profile seed cannot re-attribute a session the user un-attributed.
- **Fail-soft on input, strict on composition.** An empty name records nothing and re-asserting the effective operator appends nothing, while a composition without the `operator` projection throws instead of inventing an attribution.

### How the state is read

The service registers the `operator` unit with a versioned schema, seeds it with `defaultOperator` or `null`, and folds each committed event through `applyOperatorEvent`. `operator(session)` reads that state and answers `undefined` for `null`; `set` and `clear` append only when the effective value changes. `session/created` triggers the `requireOperator` warning, which is a process-log write with no turn, no session event and no block.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | The whole package: `identity/operator` declaration, `Config`, the `operator` projection unit, the `/operator` command and the `IdentityLocalService` read face |
| — | No runtime invariant companion is published because the package owns no mutable data relation of its own: the durable event it appends is checked by the session log, and the state it reads is the projection registry's. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They move from the seam this package provides to the projection registry it registers on and the command registry that mounts its command.

- [Local operator identity subsystem reference](../../../docs/subsystems/identity.md) — the seam, its read face and its honest limits.
- [Session projection subsystem reference](../../../docs/subsystems/session-projection.md) — the registry the `operator` unit is registered with.
- [Commands subsystem reference](../../../docs/subsystems/commands.md) — the command registry the `/operator` command is mounted through.
- [identity group map](../README.md) — the group this package belongs to.

-----

<a id="model-experience"></a>
## Model Experience

None, as the attribution event is log-only: it never enters the model transcript, and the package registers no prompt section, tool, schema or session event the model can see.

#### KV Cache effect

The package adds no request content, so it neither creates nor invalidates cache entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when attribution is a poor fit. They are current package constraints, not a task backlog.

- **It is attribution, not authentication.** No credential, no session gate and no per-request authorization: any caller that reaches the harness can attribute a session, and a recorded name never restricts what that session may do.
- **It does not separate users on one node.** Two people sharing a harness home share the credential store, the workspace and every other capability exactly as before; the package only names sessions.
- **It never invents an operator.** An unattributed session stays unattributed, and `requireOperator` writes a process-log line rather than a model-visible message or a refusal.
- **There is no roster, allow-list or name validation.** Any non-empty trimmed name is accepted, so a deployment that needs authorized operators composes a component that enforces that.
- **The projection must exist.** A composition without `ctx.sessionProjections` does not mount the plugin, and a session whose `operator` unit is missing makes the read face throw instead of answering `undefined`.
- **The model is never told.** Attribution is deliberately invisible to the agent, so a model cannot report who the session belongs to.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
