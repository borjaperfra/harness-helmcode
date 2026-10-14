---
description: "Retrieval for the Helmcode layer: the pure core (chunker, qwen3-embedding embedder, reranker, local index) plus its wiring as the ctx.retrieval seam with the index_workspace and knowledge_search tools."
kind: "package-reference"
---

# @deepseek-ai/dsh-retrieval-helmcode

## Summary

This package gives the model answers grounded in documents the deployment names. It chunks and embeds those documents through Helmcode, stores the fragments in one SQLite index under the harness home, and ranks a query by cosine over that index before the provider reranks the candidates. The plugin declares and provides the `ctx.retrieval` seam, and publishes the two tools the model drives: `index_workspace` writes the index, `knowledge_search` reads it. There is no interceptor; nothing is indexed or retrieved unless the agent asks, and the API key is resolved before any text is touched.

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

Mount the plugin with the key that authorizes Helmcode, declare which documents the workspace holds, and let the agent index and query them.

### When to choose it

Choose it when the model must answer from a small, deployment-owned corpus — a manual, a FAQ, an internal handbook — and a wrong answer is worse than a refusal. Avoid it when an exact-term lookup must never miss: ranking is raw cosine plus a provider rerank, so there is no lexical score to fall back on, and a term that appears verbatim can still rank below a semantically close fragment.

### Setting it up

Mount the plugin; the key lives in the credential store, never in the composition file, and the sources table maps a logical name to a workspace-relative path.

```yaml
- id: retrieval-helmcode
  name: '@deepseek-ai/dsh-retrieval-helmcode'
  config:
    topK: 8
    topN: 4
    sources:
      manual: docs/manual.md
      faq: docs/faq.md
```

`topK` is how many fragments the cosine pass hands to the reranker and `topN` how many results come back. Without `indexPath` the index lives at `<DSH_HOME>/retrieval/index.sqlite`, whose file is created lazily on the first index operation.

### What you get

`index_workspace` answers with a per-source report — `indexed`, `empty` or `failed`, with the chunk count and a detail line — and a `401`/`402` from Helmcode fails the whole call instead of declaring a report that would invite retrying source by source. `knowledge_search` answers with the reranked fragments, each carrying the logical source name; when the index holds no fragment it says so, and when the credential is missing it fails with its own code instead of returning an empty list.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains how the pure core and the wiring divide the work and points at the code that realizes them; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

The package is built on four commitments:

- **Pure core, explicit transport.** The core requires a `fetch` and has no default, so no path reaches the network unless the composition decided it; the wiring passes `globalThis.fetch` read on every operation, and the tests substitute that global with a double.
- **The seam is declared by this plugin.** `ctx.retrieval` is a Context merge in this package, the pattern every service in the tree follows, so a new capability never requires editing `packages/core`.
- **Fail closed on the key, fail soft on the corpus.** The credential is resolved at the start of every operation, so a missing key fails both tools even when the index is empty; with a key, a document with no text and an empty index are declared no-ops rather than errors.
- **Replace, never accumulate.** `indexSource` replaces a source's rows wholesale, so re-indexing an edited file cannot leave stale fragments competing in the next search.

### How a call is served

`indexSource` chunks the text, returns a declared no-op when there is nothing to embed, and otherwise embeds every chunk and upserts them under the source name. `search` embeds the query, scores the stored vectors by cosine, keeps `topK`, reranks those candidates through Helmcode and returns up to `topN` hits. The index opens on first use and closes with the plugin; a rotation of the API key reaches the next call without a restart.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: `Config`, `name`/`inject`/`apply`, the `ctx.retrieval` service and the two tools |
| [`src/core.ts`](src/core.ts) | The re-export surface of the pure core the package publishes |
| [`src/chunk.ts`](src/chunk.ts) | The text chunker with its fragment offsets |
| [`src/embed.ts`](src/embed.ts) | The Helmcode `/v1/embeddings` client for `qwen3-embedding` |
| [`src/rerank.ts`](src/rerank.ts) | The Helmcode `/v1/rerank` client |
| [`src/search.ts`](src/search.ts) | The pure `embed → cosine → rerank` pipeline |
| [`src/store.ts`](src/store.ts) | The SQLite index: schema, upsert-by-source and counting |
| [`src/http.ts`](src/http.ts) | The request client both endpoints share, over the injected `fetch` |
| [`src/errors.ts`](src/errors.ts) | The retrieval error taxonomy (`AUTH`, `CREDITS`, `RATE_LIMIT`, `PROVIDER`, `MALFORMED`, `DIMENSION`) |
| — | No runtime invariant companion is published because the package owns no package-local event history or mutable data relation beyond the index it already replaces on every write. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They move from the seam this package declares to the credential store that holds its key and the group map around it.

- [Retrieval subsystem reference](../../../docs/subsystems/retrieval.md) — the `ctx.retrieval` seam, its two operations and what it deliberately does not do.
- [Credentials subsystem reference](../../../docs/subsystems/credentials.md) — the `CredentialRef` resolution of `HELMCODE_API_KEY`.
- [Tools subsystem reference](../../../docs/subsystems/tools.md) — the registry the two tools are published on.
- [retrieval group map](../README.md) — the group this package belongs to.

-----

<a id="model-experience"></a>
## Model Experience

### Index report

#### What the model sees

`index_workspace` answers with the per-source report — the count of indexed, empty and failed sources plus one row per source with its status, chunk count and a detail line — and a document with no text is reported as a declared no-op rather than an error.

#### Token effect

The report costs context in proportion to the number of sources and replaces blind retries; the embedded text itself never enters the transcript.

#### KV Cache effect

Append-only: the report follows the reusable request prefix, so existing cache entries stay valid.

### Search results

#### What the model sees

`knowledge_search` answers with the reranked fragments, each carrying the logical `source` name it was indexed under; an empty index is stated explicitly, and a missing credential or a Helmcode refusal fails the call with its code instead of returning an empty list.

#### Token effect

Each returned fragment consumes context up to `topN`, so the two rank settings are the only budget the caller controls; a larger `topN` costs more every turn the result is retained.

#### KV Cache effect

Append-only: a result set is added after the reusable prefix and rewrites no earlier message.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the retrieval capability is a poor fit. They are current package constraints, not a task backlog.

- **Raw cosine, no hybrid search.** Ranking is cosine over the stored vectors plus the provider rerank: no BM25, no reciprocal-rank fusion and no query expansion, so an exact-term lookup can miss even though the term is in the corpus.
- **No citation contract.** A hit carries the logical `source` name and the fragment text, not a file path, a line range or a stable document id, and the seam never checks that the indexed text still matches the file on disk.
- **One embedder.** Fragments and queries are embedded by the same Helmcode model; a second embedder would compare vectors from different spaces, so the seam refuses to guess one.
- **Key required, by design.** Without a usable credential the tools fail with `MISSING_CREDENTIAL` rather than searching an empty index, so a deployment cannot use this package as a local-only index.
- **The index is per harness home.** `<DSH_HOME>/retrieval/index.sqlite` belongs to one machine and one home; two deployments do not share fragments, and a copied index carries whatever the profile that wrote it embedded.
- **`fs` is optional by design.** `inject` does not require the filesystem seam, so a composition without `ctx.fs` still gets `knowledge_search` and gets a refusal from `index_workspace` instead of reading outside the seam.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
