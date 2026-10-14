---
description: "Honest egress and residency evidence inventory for a composed configuration dump: what the composition declares, what the residency catalog states, what the guard vetoes, what the report cannot see, and what a customer deployment must supply."
kind: "package-reference"
---

# @deepseek-ai/dsh-compliance-evidence

## Summary

This package turns a composed configuration dump into a Markdown evidence inventory: which inference routes the composition declares, each one's declared residence, the mode the residency guard runs in, the channels that leave the process, the local data surface, the redaction channel, the recorded operator attribution, what a deployment must supply, the plugin roster, and the input fingerprint. It reads the dump and a residency catalog, measuring nothing on the network. The report is a declaration inventory, never a proof of egress, and what the dump does not state is printed as a declared absence or as `unknown`.

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

Run the CLI against a dump and a residency catalog, and read the ten sections it writes to stdout.

### When to choose it

Choose it when a deployment must show, in one reviewable document, what its composition declares about egress and where inference is declared to run. Avoid it as a certification: the report inventories declarations, the residency table is an input, and no section proves which route the bytes actually took.

### Setting it up

The CLI is published as `bin`, and the same work is available as pure functions from the package entry.

```sh
dsh --profile web --dump-config > dump.yml
dsh-compliance-evidence dump.yml catalog.json --provider helmcode > informe.md
```

The catalog is either `{ "provider": …, "models": [{ "id": …, "residency": "eu" | "us" | "unknown" }] }` or a `{ "proveedor/modelo": "eu" }` map; `--provider` names the provider when the JSON does not. The dump may arrive as UTF-16 or with a PowerShell error preamble, and the CLI says so on stderr instead of tolerating it silently.

### What you get

A single Markdown report titled *Informe de evidencia: residencia de inferencia y canales de salida*, signed with the generator version, the instant, the SHA-256 of the dump as read, and ten mandatory sections in order. The report always states what it is not: an inventory of declarations, not a measurement of traffic.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains how the pure report and the CLI divide the work and points at the code that realizes them; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

The generator is built on four commitments:

- **Pure report, side-effecting shell.** `report.ts` and `sections.ts` import nothing from the harness, read no file and touch no network; the CLI parses the dump, computes the hash and resolves the two paths a dump cannot carry.
- **Declaration is not attestation.** Every section states where its facts come from, and a value the dump does not declare becomes a declared absence or `unknown` — never a filled-in assumption, and never a declaration presented as proof.
- **The `!!js` expressions are never evaluated.** The YAML schema turns `!!js dshHomePath('sessions')` into an opaque marker that the report cites verbatim, because evaluating configuration code is not this tool's job.
- **The unseen parts are named.** The telemetry section says that the environment variables governing delivery are invisible to a dump, and the redaction section labels the map path as resolved on the machine that ran the generator.

### How a report is produced

`parseArguments` validates the two positional paths and the optional provider, `decodeDumpBytes` tolerates the encodings and preambles real dumps carry, `residencyFromCatalog` builds the `provider/model` table with anything that is not `eu` or `us` read as `unknown`, and `buildEvidenceReport` assembles the header plus `buildSections`. The ten section titles are a frozen constant, so a report missing a section cannot be produced.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | The public surface: the pure report builder, the section functions and the input contract |
| [`src/report.ts`](src/report.ts) | The header and the ordered assembly of the ten sections |
| [`src/sections.ts`](src/sections.ts) | The ten section functions, the dump reader and the honesty rules of the text |
| [`src/cli.ts`](src/cli.ts) | The `bin` entry: argument parsing, dump decoding, catalog reading, hash and stdout |
| — | No runtime invariant companion is published because the package runs outside any agent runtime: it reads a dump and returns Markdown, so it owns no live data relation to check. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They move from the guard whose mode the report prints to the layer the report describes and the attribution row it reads.

- [Residency guard README](../../guard/eu-routing/README.md) — the modes the report's residency section prints, and what the guard actually vetoes.
- [Helmcode bundle README](../../bundle/helmcode/README.md) — the composition a Helmcode deployment dumps.
- [Local operator identity](../../../docs/subsystems/identity.md) — the attribution row and the log-only event behind it.
- [host group map](../README.md) — the sibling host packages.

-----

<a id="model-experience"></a>
## Model Experience

None, as the generator runs outside any agent runtime: it reads a configuration dump and writes a Markdown report, registering no prompt section, tool, schema or session event.

#### KV Cache effect

The report never reaches a model request, so it creates and invalidates no cache entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define what the report can and cannot claim. They are current package constraints, not a task backlog.

- **It inventories declarations, it does not prove egress.** Nothing is measured on the network, no seam observes every channel, and the report says so in its own first section.
- **It only sees the dump.** Environment variables that govern telemetry delivery, values resolved at runtime, and `!!js` expressions the generator refuses to evaluate are invisible, and each gap is stated in the section it affects.
- **Residency is an input, not a finding.** The table comes from the catalog the caller passes or from the guard's own table, so a stale catalog produces an honest but wrong declaration; a residence that is neither `eu` nor `us` is read as `unknown`, never as approved.
- **Two facts belong to the generating machine.** The redaction section resolves the harness home and the default map path where the CLI ran, which may differ from the deployment that produced the dump, and it labels them as such.
- **Attribution is what the log records.** The attribution section prints the operator attribution the dump declares; it is evidence of a recorded name, not of authentication.
- **The ten sections are fixed.** A missing or extra section is a code change in this package, and the CLI writes to stdout only — redirecting and committing the file stays a deployment decision.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
