---
description: "The Helmcode layer as a profile bundle: brand skin, European inference route, residency and egress guard, PII redaction channel, retrieval index and local operator attribution, inserted over the composition dsh-web-app leaves behind."
kind: "package-bundle"
---

# @deepseek-ai/dsh-helmcode

## Summary

This bundle is the Helmcode layer expressed as a composition: one patch that inserts the European inference route, the Helmcode brand skin, the residency and egress guard, the PII redaction channel, the retrieval index behind `ctx.retrieval`, and local operator attribution. It ships as the third layer of the `web` profile template, so `dsh --profile web` gets it without a Helmcode line in any upstream patch file. The bundle owns no behavior of its own — every row belongs to a package that owns its contract — and it deliberately carries no credential, so a deployment supplies the keys.

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

Boot a profile built from the `web` template (`dsh --profile web`), or add the bundle to a profile of your own and override the rows your deployment is accountable for.

### When to choose it

Choose it when a deployment runs the European Helmcode route and wants the layer's guard, redaction, retrieval and attribution in one row. Avoid it when the deployment needs authentication: the identity row attributes sessions and does not gate them, and when the deployment needs inference outside the EU, because the route this bundle declares carries European models only.

### Setting it up

The `web` profile template already lists the bundle; a profile of your own names it in its bundle list and overrides individual rows in its own patch. The two keys are credentials, never configuration, so they come from the configuration UI's secret fields or from the launch environment:

- `HELMCODE_API_KEY` — authorizes the European inference route and the two retrieval tools.
- `PRIVACY_MAP_KEY` — seals the reversible redaction map.

The redaction map key has no default value on purpose: without it the two privacy tools refuse rather than return unredacted text.

### What you get

Six rows in the composed tree — `llm-pi-ai-helmcode`, `ui-brand-helmcode`, `guard-eu-routing`, `privacy-helmcode`, `retrieval-helmcode` and `identity-local` — and the seams they provide: `ctx.retrieval` for the index, `ctx.identityLocal` for operator attribution, the two privacy tools, the two retrieval tools, the `llm/stream` and `tools/pre-execute` listeners of the guard, and the brand tokens and sheet the client mounts.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains how the patch is shaped and why, and points at the pieces that own each row; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

The layer is a patch carrier with four commitments:

- **One row per concern, with its own id.** The Helmcode inference route is a separate row rather than a key inside the upstream `providers` dict, because a later patch replaces a targeted row's COMPLETE config — which is how an earlier shape lost the Helmcode provider when a machine profile rewrote the sibling row.
- **No credential in a shared file.** The patch is shared and in clear, so a key in it would be a published key; both `HELMCODE_API_KEY` and `PRIVACY_MAP_KEY` are resolved from the credential store.
- **Deployment decisions stay out.** The guard row ships `mode: 'open'`, the identity row ships no `defaultOperator`, and the bundle declares no redaction key: the mode, the operator and the key belong to the deployment's own profile.
- **Only European models are declared.** The same key serves nine frontier models that run in the United States; declaring them would make the egress decision implicit, so they are absent until a deployment chooses otherwise.

### What each row owns

`llm-pi-ai-helmcode` declares the four European conversation models with their context windows and reasoning efforts; the retrieval and speech models of the plan do not pass through `pi-ai` and belong to the retrieval and voice seams instead. `guard-eu-routing` vetoes non-European model routes and the tools that open their own traffic. `privacy-helmcode` publishes the two redaction tools. `retrieval-helmcode` owns the index and the two retrieval tools. `identity-local` owns the `/operator` command, the log-only `identity/operator` event and the `operator` projection. `ui-brand-helmcode` mounts the brand tokens, sheet and lockup.

### Source map

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | The whole bundle: six inserted rows with the reasoning for each, including the commented `sources` example and the commented identity config |
| [`src/index.ts`](src/index.ts) | The package entry; the bundle is a patch carrier with no runtime code |
| — | No runtime invariant companion is published because the bundle owns no runtime state: it inserts rows, and each inserted row's package owns its contract and its data. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They move from the layer's own rows to the seams they provide and the report that inventories what the composition declares.

- [Retrieval subsystem reference](../../../docs/subsystems/retrieval.md) — the `ctx.retrieval` seam the retrieval row provides.
- [Local operator identity](../../../docs/subsystems/identity.md) — the attribution seam the identity row provides.
- [Compliance evidence README](../../host/compliance-evidence/README.md) — the report that inventories the routes and the mode this bundle declares.
- [Residency guard README](../../guard/eu-routing/README.md) — the mode the guard row ships and what it refuses.
- [bundle group map](../README.md) — the sibling bundles.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the rows it inserts: each row's package owns its model-facing contribution, and the patch itself registers no prompt section, tool, schema or session event.

#### KV Cache effect

A bundle contributes no request content of its own, so it neither creates nor invalidates cache entries; the rows it mounts decide their own prefix stability.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when this composition is a poor fit. They are current package constraints, not a task backlog.

- **No credential ships with it.** `HELMCODE_API_KEY` and `PRIVACY_MAP_KEY` come from the credential store; without the second one the privacy tools refuse, and without the first the inference route and the retrieval tools fail with their own codes.
- **The guard is mounted, not enforcing.** The row ships `mode: 'open'`, which allows every route and every egress tool, so a deployment that needs the European-only guarantee must declare `eu-only` in its own profile.
- **The identity row is attribution only.** It adds no credential and no gate, so it never restricts who may use the deployment.
- **The declared model set is deliberately narrow.** Only the four European conversation models are configured; the nine US-region models the same key serves are absent, and the GLM 5.3 add-on is commented out because no plan covers it.
- **A later patch can replace a row's whole config.** The layer survives profile overrides because each concern has its own row id, but an override that targets one of these ids replaces that row's complete configuration.
- **It carries no behavior of its own.** Any capability question belongs to the inserted package's README, and the bundle is not a place to fix a row's defaults.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
