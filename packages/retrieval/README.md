---
description: "Package map for the retrieval group: the Helmcode retrieval capability that owns the local index and the two model-facing tools built on it."
kind: "package-group"
---

# retrieval/ — grounded answers over deployment documents

English

## Summary

The `retrieval/` group gives the harness a local index it can answer from. `helmcode` chunks and embeds the documents a deployment names, stores the fragments in one SQLite file under the harness home, and ranks a query by cosine over that index before the provider reranks the candidates. The model reaches it through two tools, `index_workspace` and `knowledge_search`, and the plugin declares the `ctx.retrieval` seam both of them call. There is no interceptor: nothing is indexed or retrieved unless the agent asks.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

<a id="packages"></a>
## Packages

| Package | What it provides |
|---|---|
| [`helmcode/`](helmcode/README.md) | The pure retrieval core (chunker, embedder, reranker, local index, search pipeline) and its wiring as the `ctx.retrieval` seam with the `index_workspace` and `knowledge_search` tools |

<a id="related-documentation"></a>
## Related documentation

Start with the subsystem reference for the seam and its operations, then the package README for the configuration and the honest limits.

- [Retrieval subsystem reference](../../docs/subsystems/retrieval.md) — the `ctx.retrieval` seam, the index, and what the two tools do.
- [Credentials subsystem reference](../../docs/subsystems/credentials.md) — the credential store the key `HELMCODE_API_KEY` is resolved from.
- [Tools subsystem reference](../../docs/subsystems/tools.md) — the tool registry and dispatch pipeline the two tools are published through.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
