---
description: "The banking sector pack as a profile bundle: two compliance skills whose workflow makes anonymization mandatory, an agent preset scoped to a banking analyst's tools, and the sector's policies — the routing guard in eu-only and a thirty-day expiry on the redaction map."
kind: "package-bundle"
---

# @deepseek-ai/dsh-helmcode-banca

## Summary

This bundle is the banking sector pack: the `banca` profile template stacks it after `dsh-helmcode`, so `dsh --profile banca` composes the regulated stack of base, Web app, Helmcode layer and this pack. It mounts two compliance skills whose workflow requires `workspace_read_anonymized` before any text of a compliance file reaches the model, declares the `helmcode-banca` agent preset with a tool list cut to banking compliance work, overrides the routing guard to `eu-only` and the redaction map's expiry to thirty days, and registers a sector chip in the session header. It carries no credential of its own.

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

Boot the profile built from the `banca` template (`dsh --profile banca`), or add the bundle to a profile of your own and override the rows your deployment is accountable for.

### When to choose it

Choose it when a deployment analyses DORA compliance, classifies banking operations or organises a compliance file inside the European Union and wants the sector's two policies, its two compliance skills, its scoped agent preset and its sector chip in one layer. Avoid it when the deployment needs a compliance decision or advice: the skills classify and cite, and neither conclude on compliance nor substitute the compliance function.

### Setting it up

The `banca` profile template already lists the bundle after `@deepseek-ai/dsh-helmcode`; a profile of your own names both in its bundle list. The pack declares no credential: `HELMCODE_API_KEY` and `PRIVACY_MAP_KEY` come from the credential store as the Helmcode layer's README describes, and without `PRIVACY_MAP_KEY` the two redaction tools refuse rather than return unredacted text.

### What you get

Two overridden rows (`guard-eu-routing` in `eu-only`, `privacy-helmcode` with `ttlDays: 30`), one `@deepseek-ai/dsh-agent-preset` row declaring `helmcode-banca`, the pack's own `skill-filesystem` instance, which adds `analisis-dora` and `clasificacion-operaciones` at the bundled rank, and the pack's own host row, whose browser half occupies `conversation.session.header.utilities` with the sector chip. The privacy and retrieval tools stay available: their rows come from the Helmcode layer and register globally.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains how the two patch documents, the client half and the sector chip are shaped and why; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

The pack is a patch carrier with four commitments:

- **Its own bundle, not rows in the common layer.** A banking deployment activates it, or does not, without touching `dsh-helmcode` or any upstream patch file.
- **Sector policy as an override by id, never a second instance.** `guard-eu-routing` and `privacy-helmcode` are rows the Helmcode layer already mounted; the pack replaces their complete configuration because a later patch does exactly that. A second row with the same id would split the redaction map in two.
- **Enforcement by omission.** The `helmcode-banca` preset mounts only the tool rows banking compliance work needs; the shells, background jobs, web egress, delegation group and plugin manager are absent rather than disabled, so the turn's surface is the sector's by construction.
- **The sector is visible.** The chip is not decoration: a regulated profile is chosen per session, and the operator has to be able to tell which pack is composing the one on screen.

### The retention window is the sector's, not the machine's

`ttlDays: 30` is deliberately longer than the healthcare pack's seven days, and the reason is the regulatory cycle rather than a weaker posture. A DORA analysis rests on evidence that is reviewed and cited again across a reporting period — the register of information, a critical provider's report, a continuity plan — and the redaction map is the only artifact that joins an identifier back to the text it came from. Its window is therefore the window of the file it serves: thirty days, and no longer. A deployment with a shorter statutory window overrides the row in its own patch layer, which is exactly what an id-targeted override is for.

### What each file owns

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | The two sector policies as id-targeted overrides and the pack's own host row, with the DORA, NIS2 and GDPR reasoning on each |
| [`presets/banca.patch.yml`](presets/banca.patch.yml) | The `helmcode-banca` preset declaration, the documented cut against the `standard` list, and the pack's own skill root |
| [`skills/analisis-dora/SKILL.md`](skills/analisis-dora/SKILL.md) | Article-structured DORA analysis: criticality as the file states it, third-party risk, control and testing evidence, gaps — with the mandatory flow first |
| [`skills/clasificacion-operaciones/SKILL.md`](skills/clasificacion-operaciones/SKILL.md) | Operation classification by type and by risk factor, with the criterion and the citation attached to every row |
| [`src/index.ts`](src/index.ts) | The Node half: an empty apply that gives the Loader the row the browser roster keys the chip bundle by |
| [`src/client/index.ts`](src/client/index.ts) | The browser half: the `sector-banca` dictionaries and the chip registration into `conversation.session.header.utilities` |
| — | No runtime invariant companion is published because the bundle owns no runtime state: it overrides two rows, declares a preset, adds a skill root and registers one locale dictionary and one slot entry, and each of those owners keeps its own contract. |

### Why the sector chip carries its own locale namespace

A chip has to render a string, and a string belongs to a namespace. `@deepseek-ai/dsh-client-locale` allows exactly one registrant per `(namespace, locale)` pair — a second `register('helmcode', { es, en })` throws `locale namespace "helmcode" already has locale "es"` — and the Helmcode brand skin already owns `helmcode` for the residency, quota and onboarding copy. The pack therefore registers `sector-banca`, with the single key `sector.name`, and the chip reads it through its registration's `locale:` seat. A deployment that mounts the brand and this pack together gets both dictionaries instead of one evicting the other.

### Why the pack needs a host row and a client bundle

The browser roster is composed from the Host Loader's rows: a row whose module specifier resolves to a package declaring `dsh.client` with `platform: web` and exporting `./client` becomes one browser plugin, keyed by package name. The chip therefore needs both halves shipped and built — `lib/index.js` from the host pass and `lib/client.js` from the client pass — because a missing client artifact is a boot failure, not a silently absent chip.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough.

- [Skills subsystem reference](../../../docs/subsystems/skills.md) — provider layers, ranks, and how a bundled root is discovered.
- [Slots subsystem reference](../../../docs/subsystems/slots.md) — the session-header utilities seat and how an entry is registered into it.
- [Residency guard README](../../guard/eu-routing/README.md) — what `eu-only` vetoes on a model route and on an egress tool.
- [Redaction channel README](../../guard/privacy-helmcode/README.md) — the two tools, the sealed map, and the fail-closed paths.
- [Helmcode layer bundle](../helmcode/README.md) — the rows this pack overrides and the credentials it relies on, including the brand skin that owns the `helmcode` namespace.
- [bundle group map](../README.md) — the sibling bundles, the healthcare pack among them, whose seven-day map expiry this pack deliberately exceeds.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through what it mounts: the two skills add their catalog entries (name and description) to the `helmcode-banca` preset's session, and the skill bodies load only when invoked. The patch itself registers no prompt section, tool, schema or session event, and the sector chip lives entirely in the browser — no part of it reaches the model.

#### KV Cache effect

The skill catalog entries are part of the request prefix for sessions using the `helmcode-banca` preset and change it once when the pack mounts; skill bodies are loaded on invocation as new visible content after that prefix. The chip, its dictionary and its slot registration never enter the request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when this pack is a poor fit. They are current package constraints, not a task backlog.

- **The sector preset is not the profile's default.** `agent-preset-registry` still ships `default: standard`, so a new session in a `banca` profile starts on the `standard` preset and its coding tool roster until the user selects `helmcode-banca`. A deployment that wants the sector preset by default overrides that row's `default` in its own patch layer.
- **The two policies are overrides, not inserts.** A profile that mounts this pack without `@deepseek-ai/dsh-helmcode` gets `patch: entry <id> not found` for both entries and no sector policy at all.
- **Detection is a closed list of nine value types.** Names, addresses, dates of birth and free-text identifiers survive redaction; both skills state that and forbid carrying them into the output, which is a discipline, not a guarantee.
- **The thirty-day window is a policy, not a statutory constant.** A deployment whose supervisory window is longer or shorter overrides `ttlDays` on the `privacy-helmcode` row; the pack's value is the posture it ships with.
- **The skills have no restore path.** Restoration is an operator operation on the sealed map; the model has no tool for it, so an analysis stays anonymized for the model by construction.
- **No compliance decision.** The skills classify and cite evidence; a deployment that needs a compliance conclusion, a regulatory filing or an incident notification is outside this pack's scope.
- **The bundled rank outranks same-named skills.** A project or user skill named `analisis-dora` or `clasificacion-operaciones` is shadowed inside a `helmcode-banca` session.
- **The sector chip is Spanish-first by construction of the namespace owner.** The `sector-banca` namespace ships both dictionaries; a deployment that renames the sector edits the pack's `src/client/locales.ts` and rebuilds its client bundle.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The pack's skill root is resolved at activation time by a `!!js` expression that asks the runtime package resolution for `@deepseek-ai/dsh-helmcode-banca/package.json` from the Loader tree's `baseUrl` — the same mechanism `@deepseek-ai/dsh-web-app` uses for `@deepseek-ai/dsh-agent-preset` in its `cordis` preset. The expression belongs to the nested row, so it is evaluated by that row's own fiber and not by the preset carrier. The client bundle is built by the shared `clientBundle` preset (`packages/client/tsdown.client.ts`) in host phase, so `lib/index.js` is emitted by the host pass and `lib/client.js` by the client pass.

</details>
