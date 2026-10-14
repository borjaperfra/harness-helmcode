---
description: "Helmcode plan quotas and per-key limits: which models draw on the plan quota, which are unlimited, and when to degrade instead of failing."
kind: "package-reference"
---

# @deepseek-ai/dsh-quota-helmcode

## Summary

This package owns the published Helmcode plan limits and the policy that reads them: the four plans, the three quota buckets a model can belong to, the per-key request, concurrency and context limits, and the decision that suggests degrading to an unlimited model when a bucket is exhausted. It counts nothing itself — the meter that consumes these limits arrives on top of this table — and it blocks nothing: every function returns a classification, a remaining amount or a suggested target. Prices, quotas and limits carry the date of the documentation they were read from.

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

Import the table and the decisions where a quotaless meter or a routing policy needs them.

### When to choose it

Choose it when something in the composition must know whether a model's consumption belongs to the plan quota, how much of a bucket is left, or which unlimited model to fall back to. Avoid it as an enforcement point: no function here refuses a call, and a deployment that must stop at a quota has to enforce that decision itself.

### Setting it up

The package is a library with no plugin entry and no configuration; it belongs to whichever component counts tokens or selects models.

```ts
import { bucketOf, quotaState, suggestDegradation } from '@deepseek-ai/dsh-quota-helmcode'

const bucket = bucketOf(route.provider, route.model)
const state = bucket === undefined ? undefined : quotaState('growth', bucket, usedTokens)
const next = suggestDegradation('growth', route.provider, route.model, usedTokens)
```

### What you get

`bucketOf` answers `unlimited`, `sota`, `addon` or `undefined`; `monthlyCapTokens` answers the plan's cap for a bucket or `null` when there is none to apply; `quotaState` answers the used, remaining and ratio values plus a status of `ok`, `low` or `exhausted`; `concurrencyLimitFor` and `KEY_LIMITS` answer the per-key limits; `suggestDegradation` answers the unlimited model to switch to, or `undefined` to keep the request.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains how attribution and measurement are separated and points at the code that realizes them; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

The table is built on four commitments:

- **Attribution by route, not by model id.** The same model id can be served by another provider, so counting it as Helmcode quota would charge a plan for consumption that is not its own; any provider other than `helmcode` yields `undefined`.
- **Unknown is not zero.** A `null` value in the table means the documentation does not state a number, never that the limit is zero; the token-per-minute limit is `null` because the published pages contradict each other.
- **Degrade, do not fail, when a bucket empties.** A capped bucket proposes the default unlimited model instead of an error, because a nightly process prefers finishing on a lesser model to crashing; an unlimited bucket proposes nothing, since falling back from unlimited would be a downgrade for no reason.
- **One source for the numbers.** The table is the only place these figures live, and the data repository's own checks compare them with the published documentation.

### What the decisions do

`bucketOf` classifies the model against the add-on list, the SOTA list and the unlimited list, and treats an unrecognized Helmcode model as unlimited on purpose — charging quota for something the table cannot classify would block legitimate work. `quotaState` clamps negative and non-finite usage to zero, computes the remaining amount and the ratio, reports `low` from the low watermark and `exhausted` at zero remaining, and attaches the degradation target only to a capped bucket. `suggestDegradation` returns `undefined` unless the requested model's bucket is exhausted and the target differs from the requested model.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | The public surface of the package |
| [`src/limits.ts`](src/limits.ts) | Plans, buckets, key limits, the low watermark and every decision function, with the provenance of the figures |
| — | No runtime invariant companion is published because the package is a frozen table plus pure functions: it registers nothing and holds no data between calls. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They move from the route that carries the provider name to the measurement that feeds these decisions.

- [LLM streaming subsystem reference](../../../docs/subsystems/llm-streaming.md) — the provider/model route the attribution reads.
- [Token meter subsystem reference](../../../docs/subsystems/token-meter.md) — the measurement a consumer feeds into `quotaState`.
- [Helmcode bundle README](../../bundle/helmcode/README.md) — the composition that declares the `helmcode` route.
- [llm group map](../README.md) — the sibling llm packages.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a frozen limits table and pure decision functions: it registers no prompt section, tool, schema or session event, and the meter and the model-facing tool arrive on top of it.

#### KV Cache effect

Nothing in this package reaches a model request, so it creates and invalidates no cache entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the table is a poor fit. They are current package constraints, not a task backlog.

- **It is a table and a policy, not a meter.** Nothing in the package counts tokens, observes traffic or persists usage; a caller must supply the consumed amount, and a caller that supplies nothing gets a classification with no basis.
- **One published limit is unknown.** The token-per-minute limit is `null` because the provider's limits page and pricing page contradict each other, so no consumer may assume either figure.
- **The figures are dated.** Plans, quotas, concurrency and context limits were read from the published documentation on the date recorded in the source; a provider change makes this table stale until a human updates it.
- **An unclassified Helmcode model counts as unlimited.** The safe-for-work choice is deliberate, and it means a genuinely capped new model is not charged against a plan until the table names it.
- **It enforces nothing.** The statuses and the degradation target are advice; blocking a call, switching the model and surfacing the state all belong to the consumer.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
