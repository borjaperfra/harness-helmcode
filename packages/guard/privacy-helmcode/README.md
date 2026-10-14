---
description: "Reversible Spanish PII redaction for the Helmcode layer: checksum-verified detectors, a deterministic persistable map and a sealed store that fails closed instead of returning unredacted text."
kind: "package-reference"
---

# @deepseek-ai/dsh-privacy-helmcode

## Summary

This package replaces Spanish personal data with stable markers before it reaches the model, and keeps a sealed map that makes the substitution reversible. Two tools do the work: `anonymize` redacts text the model passes, and `workspace_read_anonymized` reads a workspace file through the filesystem seam and returns it redacted. Both resolve the map key from the credential store before touching any text. The same value always yields the same marker, the map is sealed with AES-256-GCM and replaced atomically, and every failure path refuses the call instead of returning unredacted text.

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

Mount the plugin with the credential that seals the map, and let the agent send personal data through the two tools.

### When to choose it

Choose it when Spanish personal data can appear in the content a model is asked to work on and the deployment must be able to reconstruct the values afterwards. Avoid it as a general anonymizer: detection covers the Spanish identifiers the package documents, an interceptor does not exist, and the original stays in the local session log — this is a dispatch-time transformation with a keyed way back, not a deletion.

### Setting it up

Mount the plugin; the key lives in the credential store, never in the composition file.

```yaml
- id: privacy-helmcode
  name: '@deepseek-ai/dsh-privacy-helmcode'
  config:
    ttlDays: 30
```

`ttlDays` bounds the expiry of NEW entries; an expired entry is no longer restored, while its marker stays in the history. Without `mapPath`, the sealed map lives at `<DSH_HOME>/privacy/map.v1` with owner-only permissions.

### What you get

Both tools answer with a header naming what was redacted — a count per PII type, or an explicit statement that nothing was detected — followed by the redacted text, and the header always states that the original stays in the local session log. A file larger than `maxBytes` (1 MiB by default) is refused rather than truncated, because cutting text could split one value and leave half of it outside the redaction.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains how detection, mapping and sealing compose, and points at the code that realizes them; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

The channel rests on five commitments:

- **Explicit capability, no interceptor.** The `llm/stream` waterfall does not allow rewriting the request the loop assembled, and there is no global content-admission hook, so redaction happens when the model calls a tool — and only then. Nothing is redacted behind the agent's back, and nothing is redacted that the agent did not route through this package.
- **Fail closed at every step.** The key is resolved and the map is opened BEFORE the text is examined: a missing credential, an envelope that will not decrypt or a map that cannot be written fails the call instead of returning the original.
- **Detection with real checksums.** The detectors validate the Spanish identifier formats they claim — DNI/NIE, NUSS, IBAN, CIF and the card formats — instead of matching shapes that would redact arbitrary numbers.
- **Deterministic markers.** A value keeps its marker across sessions because the map, not the call, assigns it, and the map is the only way back.
- **One map, two faces.** The tools redact what the model passes in; the optional `ctx.privacy` seam redacts what a consumer outside the package holds — today the retrieval `export_audit` tool, which exports the committed session log with these same markers. The seam shares the map, the key and the expiry, so a value redacted by either face carries the same marker; a consumer that finds no seam knows no map is mounted and says so instead of exporting in the clear.

### How a call is served

`redactThrough` opens the sealed map, assigns any new entry (with its expiry when `ttlDays` is set) and then redacts the text; the update is atomic, so a crash cannot leave a half-written map. `workspace_read_anonymized` resolves the path through `ctx.fs` with the session `cwd`, checks the declared size and the bytes actually read against `maxBytes`, and deliberately emits no `fs/observed`: the model saw markers, not the file, so an edit still requires a real `read`.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: `name`/`inject`/`apply`, the two tools and the fail-closed redaction path |
| [`src/detect.ts`](src/detect.ts) | The Spanish PII detectors with their checksum validation |
| [`src/map.ts`](src/map.ts) | The deterministic value-to-marker map with per-entry creation and expiry stamps |
| [`src/redact.ts`](src/redact.ts) | The pure substitution pass that turns findings and a map into redacted text |
| [`src/seal.ts`](src/seal.ts) | The AES-256-GCM envelope that opens and seals the map file |
| — | No runtime invariant companion is published because the package owns no package-local event history or mutable data relation beyond the sealed map it already verifies on every open. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They move from the credential seam that holds the map key to the filesystem seam the second tool reads through and the tool pipeline both tools are published on.

- [Credentials subsystem reference](../../../docs/subsystems/credentials.md) — the `CredentialRef` resolution of `PRIVACY_MAP_KEY`.
- [Filesystem subsystem reference](../../../docs/subsystems/filesystem.md) — the `ctx.fs` seam `workspace_read_anonymized` reads through.
- [Tools subsystem reference](../../../docs/subsystems/tools.md) — the registry both tools are published on and the denied-tool result shape.
- [guard group map](../README.md) — the sibling guard packages.

-----

<a id="model-experience"></a>
## Model Experience

### Redacted tool result

#### What the model sees

Each call answers with a header — the count per PII type, or an explicit statement that nothing was detected — followed by the redacted text, and the header always says that the original stays in the local session log. Markers such as a stable value placeholder replace the values; the original is never dispatched.

#### Token effect

The redacted text replaces the original in the transcript, so tokens track the redacted content plus one fixed header line; a marker is usually shorter than the identifier it replaces.

#### KV Cache effect

Append-only: a result follows the reusable request prefix, so existing cache entries stay valid.

### Refused redaction

#### What the model sees

When the key is missing, the envelope will not decrypt, the map cannot be written or a file exceeds `maxBytes`, the tool fails with `Error: privacy-helmcode: <cause>` naming what was missing; it never returns the unredacted text.

#### Token effect

One error result is retained and no file content enters the request, so a refusal costs less context than a redacted read of the same file.

#### KV Cache effect

Append-only: the error result does not rewrite any earlier message.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the channel is a poor fit. They are current package constraints, not a task backlog.

- **The original stays in the local session log.** The design accepts that compromise explicitly: redaction happens at dispatch, the tool result and the session log keep the original, and the sealed map is the only way back. This is not a deletion tool.
- **Detection is Spanish and checksum-bounded.** The detectors cover the identifiers the package documents and validate their check digits; personal data in other formats — a foreign tax id, a free-text name, a bare date of birth — is not detected and therefore travels unchanged.
- **Reversal is manual.** Restoring a value means using the sealed map and its key outside the conversation; the model never holds the key and there is no automatic restore path.
- **The map is per harness home.** Two deployments sharing one home share markers and the key, and losing the key loses every mapping even though the markers remain in the history.
- **No interceptor.** Text read by any other tool is not redacted; only the two tools this package publishes redact, and only when the agent calls them.
- **`fs` is optional by design.** `inject` does not require the filesystem seam, so a composition without `ctx.fs` still gets `anonymize` and gets a refusal from `workspace_read_anonymized` rather than a redaction outside the seam.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
