---
description: "Speech-to-text for the Helmcode layer: the Helmcode whisper transcription provider (pure WAV chunker, multipart client for /v1/audio/transcriptions) registered on the existing ctx.speechToText interface."
kind: "package-reference"
---

# @deepseek-ai/dsh-speech-to-text-helmcode

## Summary

This package transcribes recorded audio with the Helmcode whisper endpoint the deployment already pays for: 99+ languages with automatic detection, 10 requests per minute and 25 MB per request. It registers a provider on the existing `ctx.speechToText` registry, so the voice-input infrastructure can mount it without changes. The audio leaves to the EU; the key comes from the credential store. Long recordings are chunked into ~2-minute WAV segments and the transcriptions are concatenated.

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

Mount the plugin beside the speech-to-text service and a credential store, record, and read the transcript.

### When to choose it

Choose it when the harness must transcribe real meetings and notes in Spanish and a local model misdetects the language. Avoid it when the audio cannot leave the machine: this provider sends every recording to Helmcode, so a deployment with a residency rule that forbids egress needs the local provider instead.

### Setting it up

Mount the plugin; the key lives in the credential store under `HELMCODE_API_KEY`, never in the composition file.

```yaml
- id: speech-to-text
  name: '@deepseek-ai/dsh-experimental-speech-to-text'
  config:
    defaultProvider: helmcode-whisper
- id: speech-to-text-helmcode
  name: '@deepseek-ai/dsh-speech-to-text-helmcode'
```

`segmentSeconds` (120), `maxRequestBytes` (25 MB), `model` (`whisper`), `maxRetries` (2) and `retryDelayMs` (1000) are the tunables; `providerId`, `apiKeyRef` and `baseURL` rename the registration, the credential reference and the API root.

### What you get

One registered provider, `helmcode-whisper` by default, with `location: 'cloud'` and the whisper language set plus `auto`. `transcribe` answers with the concatenated text, the measured duration of the audio and the accumulated inference time. A missing key fails with `MISSING_CREDENTIAL`, a 401 with `AUTH`, a 413 with `FILE_TOO_LARGE`, a 5xx with `PROVIDER`, and a 429 waits for `Retry-After` —or the configured delay— and retries up to `maxRetries` times.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains how the pure core and the registration divide the work and points at the code that realizes them; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

The package is built on four commitments:

- **Pure core, injected transport.** The client requires a `fetch` and has no default, so no path reaches the network unless the composition decided it; the wiring passes `globalThis.fetch` read on every transcription, and the tests substitute that global with a double.
- **Measure, never estimate.** The duration comes from the WAV header, not from a guess about the recording, so `audioSeconds` is the audio's real length even when the transcription is chunked.
- **Chunk whole files.** Every segment is rebuilt as a complete WAV with its own header and its cut aligned to the frame, so the provider never receives half a sample and a listener can play any segment.
- **Fail closed on the key.** The credential is resolved at the start of every transcription, so a missing key fails the call with its own code instead of sending an unattributed request.

### How a call is served

`readWave` parses the RIFF container and `chunkWave` slices its `data` chunk into segments that respect both the segment duration and the byte limit. The client posts each segment as a multipart form with `model` and `file` —plus `language` unless it is `auto`— to `/v1/audio/transcriptions`, retries only a 429, and returns the `text` field. The registration resolves the key, builds the client and joins the non-empty segment texts with a space.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: `name`, `inject`, `Config`, `apply` and the provider registration |
| [`src/chunker.ts`](src/chunker.ts) | The WAV reader and the frame-aligned chunker that rebuilds each segment |
| [`src/client.ts`](src/client.ts) | The multipart client for `/v1/audio/transcriptions`, over the injected `fetch` |
| [`src/errors.ts`](src/errors.ts) | The transcription error taxonomy (`AUTH`, `RATE_LIMIT`, `FILE_TOO_LARGE`, `PROVIDER`, `MALFORMED`, `MISSING_CREDENTIAL`, `NO_TRANSPORT`) |
| — | No runtime invariant companion is published because the provider owns no package-local event history or mutable data relation: it parses borrowed audio, sends it and returns text. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They move from the STT registry this package plugs into to the credential store that holds its key.

- [Credentials subsystem reference](../../../docs/subsystems/credentials.md) — the `CredentialRef` resolution of `HELMCODE_API_KEY`.
- [eu-routing guard](../../guard/eu-routing/README.md) — the egress allowlist that already covers `api.helmcode.com`.
- [`packages/experimental/speech-to-text`](../../experimental/speech-to-text/README.md) — the provider interface and the registry this package registers on.

-----

<a id="model-experience"></a>
## Model Experience

### Transcription results

#### What the model sees

Nothing directly: this package registers a speech provider and returns transient text to the control that requested the transcription. That text reaches model context only when the user submits it as an ordinary message, and the package adds no tool, no prompt section and no Session event.

#### Token effect

None on its own: the transcript costs context only through the user's own submission, which the surrounding input owns.

#### KV Cache effect

None: the package appends nothing to a request prefix and rewrites no earlier message.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when this provider is a poor fit. They are current package constraints, not a task backlog.

- **Audio leaves the machine.** Every recording is posted to `api.helmcode.com`, so the provider is unusable where egress is forbidden, however good the transcript is.
- **WAV in, whisper out.** The chunker accepts PCM or IEEE-float WAV; the endpoint's OGG/Opus and MP3 support is reachable only by leaving the audio unchunked, which this provider does not do.
- **One request at a time.** Segments are transcribed sequentially, so a long recording costs as many round trips as it has segments and gains nothing from the provider's 10 rpm ceiling.
- **`Retry-After` is trusted.** A 429 waits exactly what the provider declares —or the configured delay— and gives up after `maxRetries`; there is no proactive rate limiter for the 10 rpm limit.
- **No wiring in this slice.** The package registers a provider and stops there: the voice-input bundle still mounts the local provider until a later cut names this one.
- **Key required, by design.** Without a usable credential every transcription fails with `MISSING_CREDENTIAL` rather than attempting an unauthenticated request.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
