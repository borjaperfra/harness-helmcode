---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-14-identity-operator

English | [Español](2026-10-14-identity-operator.es.md)

## Summary

Adds the log-only `identity/operator` event: the durable per-session operator attribution a local identity plugin writes, and the event the `operator` session projection folds (outside the model transcript).

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-14-identity-operator
baseline: false
changes:
  - root: "event:identity/operator"
    previous: null
    after: "9eb055ec1c85a7b11eb6268dc688d8fddd7a94a4bc61d8a3f697e758aef54867"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

A new root in the same Session format version, and a log-only (non-surface) event: it produces no model-visible message, so no existing log changes meaning and no reader gains a step. A reader that predates it refuses a log carrying it, as it does for every required-on-read event; `SessionEvent.ignorable` stays the compatibility mechanism for out-of-repo producers. The event is written only by `@deepseek-ai/dsh-identity-local`, on an explicit `/operator <name>` attribution or clear, never by the agent loop.

<a id="verification"></a>
## Verification

pnpm vitest run packages/identity/identity-local packages/host/compliance-evidence: 89 tests passed (15 in identity-local; its src is at 100% per-file statements/branches/functions/lines); pnpm exec tsc -b tsconfig.host.json: 0 diagnostics. A session whose log carries the event folds the `operator` projection to `{ operator, since }`, and `foldSurface` reports no surface node for it (the assertion in tests/identity-local.spec.ts).

<a id="dev-note"></a>
## Dev Note

None.
