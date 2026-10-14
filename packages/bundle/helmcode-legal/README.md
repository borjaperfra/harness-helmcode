---
description: "The legal sector pack as a profile bundle: two review skills whose workflow makes anonymization mandatory, an agent preset scoped to a legal assistant's tools, and the sector's policies — the routing guard in eu-only and a three-day expiry on the redaction map."
kind: "package-bundle"
---

# @deepseek-ai/dsh-helmcode-legal

## Summary

This bundle is the legal sector pack: the `legal` profile template stacks it after `dsh-helmcode`, so `dsh --profile legal` composes the regulated stack of base, Web app, Helmcode layer and this pack. It mounts two legal skills whose workflow requires `workspace_read_anonymized` before any text of a client's file reaches the model, declares the `helmcode-legal` agent preset with a tool list cut to legal documentation work, overrides the routing guard to `eu-only` and the redaction map's expiry to three days, and registers a sector chip in the session header. It carries no credential of its own.

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

Boot the profile built from the `legal` template (`dsh --profile legal`), or add the bundle to a profile of your own and override the rows your deployment is accountable for.

### When to choose it

Choose it when a deployment reviews contracts, judgments or case law inside the European Union and wants the sector's two policies, its two legal skills, its scoped agent preset and its sector chip in one layer. Avoid it when the deployment needs legal advice from the model: the skills review documents and cite fragments, and neither advise on enforceability nor substitute a bar-admitted lawyer.

### Setting it up

The `legal` profile template already lists the bundle after `@deepseek-ai/dsh-helmcode`; a profile of your own names both in its bundle list. The pack declares no credential: `HELMCODE_API_KEY` and `PRIVACY_MAP_KEY` come from the credential store as the Helmcode layer's README describes, and without `PRIVACY_MAP_KEY` the two redaction tools refuse rather than return unredacted text.

### What you get

Two overridden rows (`guard-eu-routing` in `eu-only`, `privacy-helmcode` with `ttlDays: 3`), one `@deepseek-ai/dsh-agent-preset` row declaring `helmcode-legal`, the pack's own `skill-filesystem` instance, which adds `analisis-sentencias` and `revision-contratos` at the bundled rank, and the pack's own host row, whose browser half occupies `conversation.session.header.utilities` with the sector chip. The privacy and retrieval tools stay available: their rows come from the Helmcode layer and register globally.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains how the two patch documents, the client half and the sector chip are shaped and why; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

The pack is a patch carrier with four commitments:

- **Its own bundle, not rows in the common layer.** A legal deployment activates it, or does not, without touching `dsh-helmcode` or any upstream patch file.
- **Sector policy as an override by id, never a second instance.** `guard-eu-routing` and `privacy-helmcode` are rows the Helmcode layer already mounted; the pack replaces their complete configuration because a later patch does exactly that. A second row with the same id would split the redaction map in two.
- **Enforcement by omission.** The `helmcode-legal` preset mounts only the tool rows legal documentation work needs; the shells, background jobs, web egress, delegation group and plugin manager are absent rather than disabled, so the turn's surface is the sector's by construction.
- **The sector is visible.** The chip is not decoration: a regulated profile is chosen per session, and the operator has to be able to tell which pack is composing the one on screen.

### What each file owns

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | The two sector policies as id-targeted overrides and the pack's own host row, with the CCBE professional-secrecy reasoning on each |
| [`presets/legal.patch.yml`](presets/legal.patch.yml) | The `helmcode-legal` preset declaration, the documented cut against the `standard` list, and the pack's own skill root |
| [`skills/revision-contratos/SKILL.md`](skills/revision-contratos/SKILL.md) | Clause-by-clause review with citations, per-clause risk categories, the limit on giving legal advice, and the mandatory flow first |
| [`skills/analisis-sentencias/SKILL.md`](skills/analisis-sentencias/SKILL.md) | Judgment analysis structured as facts, grounds and holding, with citations and the same mandatory flow first |
| [`src/index.ts`](src/index.ts) | The Node half: an empty apply that gives the Loader the row the browser roster keys the chip bundle by |
| [`src/client/index.ts`](src/client/index.ts) | The browser half: the `sector-legal` dictionaries and the chip registration into `conversation.session.header.utilities` |
| — | No runtime invariant companion is published because the bundle owns no runtime state: it overrides two rows, declares a preset, adds a skill root and registers one locale dictionary and one slot entry, and each of those owners keeps its own contract. |

### Why the sector chip carries its own locale namespace

A chip has to render a string, and a string belongs to a namespace. `@deepseek-ai/dsh-client-locale` allows exactly one registrant per `(namespace, locale)` pair — a second `register('helmcode', { es, en })` throws `locale namespace "helmcode" already has locale "es"` — and the Helmcode brand skin already owns `helmcode` for the residency, quota and onboarding copy. The pack therefore registers `sector-legal`, with the single key `sector.name`, and the chip reads it through its registration's `locale:` seat. A deployment that mounts the brand and this pack together gets both dictionaries instead of one evicting the other.

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
- [bundle group map](../README.md) — the sibling bundles.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through what it mounts: the two skills add their catalog entries (name and description) to the `helmcode-legal` preset's session, and the skill bodies load only when invoked. The patch itself registers no prompt section, tool, schema or session event, and the sector chip lives entirely in the browser — no part of it reaches the model.

#### KV Cache effect

The skill catalog entries are part of the request prefix for sessions using the `helmcode-legal` preset and change it once when the pack mounts; skill bodies are loaded on invocation as new visible content after that prefix. The chip, its dictionary and its slot registration never enter the request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when this pack is a poor fit. They are current package constraints, not a task backlog.

- **The sector preset is not the profile's default.** `agent-preset-registry` still ships `default: standard`, so a new session in a `legal` profile starts on the `standard` preset and its coding tool roster until the user selects `helmcode-legal`. A deployment that wants the sector preset by default overrides that row's `default` in its own patch layer.
- **The two policies are overrides, not inserts.** A profile that mounts this pack without `@deepseek-ai/dsh-helmcode` gets `patch: entry <id> not found` for both entries and no sector policy at all.
- **Detection is a closed list of nine value types.** Names, addresses, dates of birth and free-text identifiers survive redaction; both skills state that and forbid carrying them into the output, which is a discipline, not a guarantee.
- **The skills have no restore path.** Restoration is an operator operation on the sealed map; the model has no tool for it, so a review stays anonymized for the model by construction.
- **No legal advice.** The skills review documents and cite fragments; a deployment that needs advice on enforceability, strategy or a filing is outside this pack's scope.
- **The bundled rank outranks same-named skills.** A project or user skill named `analisis-sentencias` or `revision-contratos` is shadowed inside a `helmcode-legal` session.
- **The sector chip is Spanish-first by construction of the namespace owner.** The `sector-legal` namespace ships both dictionaries; a deployment that renames the sector edits the pack's `src/client/locales.ts` and rebuilds its client bundle.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The pack's skill root is resolved at activation time by a `!!js` expression that asks the runtime package resolution for `@deepseek-ai/dsh-helmcode-legal/package.json` from the Loader tree's `baseUrl` — the same mechanism `@deepseek-ai/dsh-web-app` uses for `@deepseek-ai/dsh-agent-preset` in its `cordis` preset. The expression belongs to the nested row, so it is evaluated by that row's own fiber and not by the preset carrier. The client bundle is built by the shared `clientBundle` preset (`packages/client/tsdown.client.ts`) in host phase, so `lib/index.js` is emitted by the host pass and `lib/client.js` by the client pass.

</details>
