---
description: "The healthcare sector pack as a profile bundle: two clinical skills whose workflow makes anonymization mandatory, an agent preset scoped to a clinical assistant's tools, and the sector's policies — the routing guard in eu-only and a seven-day expiry on the redaction map."
kind: "package-bundle"
---

# @deepseek-ai/dsh-helmcode-salud

## Summary

This bundle is the healthcare sector pack: the `salud` profile template stacks it after `dsh-helmcode`, so `dsh --profile salud` composes the regulated stack — base, Web app, the Helmcode layer, and this pack. It mounts two clinical skills whose workflow requires `workspace_read_anonymized` before any clinical text reaches the model, declares the `helmcode-salud` agent preset with a tool list cut to clinical documentation work, and overrides two rows of the Helmcode layer: the routing guard to `eu-only` and the redaction map's expiry to seven days. It carries no credential and no behavior of its own.

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

Boot the profile built from the `salud` template (`dsh --profile salud`), or add the bundle to a profile of your own and override the rows your deployment is accountable for.

### When to choose it

Choose it when a deployment processes clinical documentation inside the European Union and wants the sector's two policies, its two clinical skills and its scoped agent preset in one layer. Avoid it when the deployment needs clinical judgement from the model: the skills summarize and review documents, and neither diagnoses nor substitutes medical judgement.

### Setting it up

The `salud` profile template already lists the bundle after `@deepseek-ai/dsh-helmcode`; a profile of your own names both in its bundle list. The pack declares no credential: `HELMCODE_API_KEY` and `PRIVACY_MAP_KEY` come from the credential store as the Helmcode layer's README describes, and without `PRIVACY_MAP_KEY` the two redaction tools refuse rather than return unredacted text.

### What you get

Two overridden rows (`guard-eu-routing` in `eu-only`, `privacy-helmcode` with `ttlDays: 7`), one `@deepseek-ai/dsh-agent-preset` row declaring `helmcode-salud`, and the pack's own `skill-filesystem` instance, which adds `resumen-clinico-anonimizado` and `revision-informe-clinico` at the bundled rank. The privacy and retrieval tools stay available: their rows come from the Helmcode layer and register globally.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains how the two patch documents are shaped and why; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

The pack is a patch carrier with three commitments:

- **Its own bundle, not rows in the common layer.** A healthcare deployment activates it, or does not, without touching `dsh-helmcode` or any upstream patch file.
- **Sector policy as an override by id, never a second instance.** `guard-eu-routing` and `privacy-helmcode` are rows the Helmcode layer already mounted; the pack replaces their complete configuration because a later patch does exactly that. A second row with the same id would split the redaction map in two.
- **Enforcement by omission.** The `helmcode-salud` preset mounts only the tool rows clinical documentation work needs; the shells, background jobs, web egress, delegation group and plugin manager are absent rather than disabled, so the turn's surface is the sector's by construction.

### What each file owns

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | The two sector policies as id-targeted overrides, with the GDPR art. 9 and EHDS reasoning on each |
| [`presets/salud.patch.yml`](presets/salud.patch.yml) | The `helmcode-salud` preset declaration, the documented cut against the `standard` list, and the pack's own skill root |
| [`skills/resumen-clinico-anonimizado/SKILL.md`](skills/resumen-clinico-anonimizado/SKILL.md) | The mandatory anonymization flow and the shape of an anonymized clinical summary |
| [`skills/revision-informe-clinico/SKILL.md`](skills/revision-informe-clinico/SKILL.md) | Point-by-point review with citations, the flag for what cannot be verified, and the same mandatory flow first |
| [`src/index.ts`](src/index.ts) | The package entry; the bundle is a patch carrier with no runtime code |
| — | No runtime invariant companion is published because the bundle owns no runtime state: it overrides two rows, declares a preset, and adds a skill root, and each of those owners keeps its own contract. |

### Why the skills mount through a second `skill-filesystem`

The plugin registry indexes providers by name inside a layer, so two instances coexist when the second carries its own `providerName`. The pack's instance adds `bundledSkillDir` — the pack's `skills/` directory, resolved from the pack's own installed package — at the bundled rank, which outranks a same-named project or user skill. `includeDefaultRoots` stays at its default, so project and user skill roots do not disappear from a health session. A deployment that wants the sector skills to be the *only* catalog sets `includeDefaultRoots: false` on that row.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough.

- [Skills subsystem reference](../../../docs/subsystems/skills.md) — provider layers, ranks, and how a bundled root is discovered.
- [Residency guard README](../../guard/eu-routing/README.md) — what `eu-only` vetoes on a model route and on an egress tool.
- [Redaction channel README](../../guard/privacy-helmcode/README.md) — the two tools, the sealed map, and the fail-closed paths.
- [Helmcode layer bundle](../helmcode/README.md) — the rows this pack overrides and the credentials it relies on.
- [bundle group map](../README.md) — the sibling bundles.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through what it mounts: the two skills add their catalog entries (name and description) to the `helmcode-salud` preset's session, and the skill bodies load only when invoked. The patch itself registers no prompt section, tool, schema or session event.

#### KV Cache effect

The skill catalog entries are part of the request prefix for sessions using the `helmcode-salud` preset and change it once when the pack mounts; skill bodies are loaded on invocation as new visible content after that prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when this pack is a poor fit. They are current package constraints, not a task backlog.

- **The sector preset is not the profile's default.** `agent-preset-registry` still ships `default: standard`, so a new session in a `salud` profile starts on the `standard` preset and its coding tool roster until the user selects `helmcode-salud`. A deployment that wants the sector preset by default overrides that row's `default` in its own patch layer.
- **The two policies are overrides, not inserts.** A profile that mounts this pack without `@deepseek-ai/dsh-helmcode` gets `patch: entry <id> not found` for both entries and no sector policy at all.
- **Detection is a closed list of nine value types.** Names, addresses, dates of birth and free-text identifiers survive redaction; both skills state that and forbid carrying them into the output, which is a discipline, not a guarantee.
- **The skills have no restore path.** Restoration is an operator operation on the sealed map; the model has no tool for it, so a summary stays anonymized for the model by construction.
- **No clinical judgement.** The skills summarize and review documents; a deployment that needs diagnosis or treatment advice is outside this pack's scope.
- **The bundled rank outranks same-named skills.** A project or user skill named `resumen-clinico-anonimizado` or `revision-informe-clinico` is shadowed inside a `helmcode-salud` session.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The pack's skill root is resolved at activation time by a `!!js` expression that asks the runtime package resolution for `@deepseek-ai/dsh-helmcode-salud/package.json` from the Loader tree's `baseUrl` — the same mechanism `@deepseek-ai/dsh-web-app` uses for `@deepseek-ai/dsh-agent-preset` in its `cordis` preset. The expression belongs to the nested row, so it is evaluated by that row's own fiber and not by the preset carrier.

</details>
