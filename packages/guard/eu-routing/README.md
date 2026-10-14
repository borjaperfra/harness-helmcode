---
description: "Residency and egress guard for the Helmcode layer: it vetoes model routes that are not declared European and tool calls that open their own network traffic, and it refuses instead of degrading or asking in silence."
kind: "package-reference"
---

# @deepseek-ai/dsh-guard-eu-routing

## Summary

This package decides two things and no more: whether a model route may leave the EU, and whether a tool that opens its own network traffic may run. `eu-only` denies every residence that is not exactly `eu`, so an unlisted model is refused rather than trusted. `ask` denies non-European routes because the harness has no consent channel for one model call. `open` allows everything, and that is the default because the mode is a deployment's decision about its own data. A denial is an error with its own code and reason, never a silent model substitution.

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

Mount the plugin in the composition that must honour the policy and declare the mode that composition is accountable for.

### When to choose it

Choose it when a deployment must keep inference inside the EU and must control the tools that reach the network on their own. Use `eu-only` for the regulated deployment: it is the only mode that promises anything by itself. Use `open` for internal and development profiles, where the mode would otherwise veto legitimate routes that the residency table does not list. Avoid it as an authentication or data-loss-prevention layer: it reads declared tables, it cannot measure where a provider ran a request, and it never inspects payloads.

### Setting it up

Mount the plugin with the mode, and add residency or egress entries only for routes and tools the deployment knows about. Declared entries are ADDED to the package defaults; they never remove a default rule.

```yaml
- id: guard-eu-routing
  name: '@deepseek-ai/dsh-guard-eu-routing'
  config:
    mode: 'eu-only'
    residency:
      helmcode/qwen3.6: eu
    egressTools:
      tools: ['web_fetch', 'mcp__files']
```

`residency` is keyed `provider/model` and accepts `eu`, `us` or `unknown`; an absent key is `unknown`, which `eu-only` denies. `egressTools.tools` accepts exact tool names and `prefix*` rules, which is how one entry covers every tool of an MCP server.

### What you get

A denied route throws before any adapter is reached, so the call fails with `RESIDENCY_REFUSED` and the reason names the route; a denied tool returns the harness's ordinary denied-tool result with `EGRESS_TOOL_DENIED` and the tool name. Allowed calls delegate untouched: the plugin never rewrites a request, never swaps a model and never emits a chunk of its own.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains how the two listeners reach their verdict and points at the code that realizes them; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

The guard is built on four commitments:

- **Default-deny in `eu-only`.** The residency table is a closed whitelist read as `table[key] ?? 'unknown'`, so neither model discovery nor a future provider inherits a permission nobody granted it.
- **Refuse, never degrade or ask in silence.** Changing the model or letting one call through changes how a regulated customer's data is treated, and that is a human decision. The plugin has no consent channel for a single model call, so `ask` denies non-European routes and explains that `open` is how a deployment authorizes egress knowingly.
- **Pure core, wired twice.** `decisions.ts` imports nothing, so every verdict is a function of its arguments and is provable without mounting the harness; `index.ts` asks the core and obeys it.
- **Two seams, because one is not enough.** `llm/stream` covers every streaming model call, but external subagent CLIs, MCP servers and `web_fetch`/`web_search` open their own traffic outside it, so `tools/pre-execute` is where those are vetoed.

### Where the verdicts land

The `llm/stream` listener calls `decideModelRoute` and throws an `LlmError` carrying the decision code before calling `next()`, which is the fail-closed side: a waterfall listener that never calls `next()` stops the chain, including the adapter. The `tools/pre-execute` listener calls `decideTool` and returns the `deny` variant of `PreToolDecision`, whose `reason` is the model-visible text and whose `info` is the structured error identity the runtime materializes.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: `name`/`inject`/`apply` and the two listeners over `llm/stream` and `tools/pre-execute` |
| [`src/decisions.ts`](src/decisions.ts) | The pure decision core (`decideModelRoute`, `decideTool`, `routeKey`, both tables' types) with no imports |
| [`src/defaults.ts`](src/defaults.ts) | The default residency table and the default egress-tool whitelist, each entry with its provenance |
| — | No runtime invariant companion is published because the guard owns no package-local event history or mutable data relation: it reads its tables and returns a verdict. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They move from the tool-call pipeline to the streaming waterfall the guard short-circuits, and then to the evidence report that prints what a composition declares.

- [Tools subsystem reference](../../../docs/subsystems/tools.md) — the `tools/pre-execute` decision shapes this guard returns.
- [LLM streaming subsystem reference](../../../docs/subsystems/llm-streaming.md) — the `llm/stream` waterfall and the adapter the guard stops before.
- [Compliance evidence README](../../host/compliance-evidence/README.md) — the report that inventories a composition's declared routes and residency mode.
- [guard group map](../README.md) — the sibling guard packages.

-----

<a id="model-experience"></a>
## Model Experience

### Denied model route

#### What the model sees

A denied route throws before the adapter is reached, so no stream exists: the turn fails with `[RESIDENCY_REFUSED] <reason>` and the reason names the route and the mode that refused it.

#### Token effect

Zero model-input tokens: no request is assembled for a denied route, and the refusal text is not part of any request prefix.

#### KV Cache effect

No effect: the call never reaches a provider adapter, so no prompt prefix is sent and no cache entry is created or invalidated.

### Denied tool call

#### What the model sees

A denied tool returns the harness's ordinary denied-tool result, `Error: [EGRESS_TOOL_DENIED] <reason>`, with structured `info` naming the tool, so the model can pick a route inside the policy instead of retrying the same call.

#### Token effect

One small error result is retained in place of everything the tool would have returned; a denied call adds no other content to the transcript.

#### KV Cache effect

Append-only: the denial result follows the reusable request prefix, so existing cache entries stay valid.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the guard is a poor fit. They are current package constraints, not a task backlog.

- **Tool coverage is by name, not by traffic.** The guard sees `tools/pre-execute`, so network access that no tool dispatches — a plugin calling out from its own code — is invisible to it, and an MCP server is covered only through the `mcp__*` prefix of the names its tools are registered under.
- **External subagents are refused, not policed.** `subagent_codex` and `subagent_claude_code` are out-of-process CLIs that speak to their own provider; the guard can deny launching them, and it cannot observe a process it did not start.
- **`ask` cannot ask.** There is no per-model-call approval seam, so `ask` denies every non-European residence and says so in the reason; the harness approval seam is per tool and fail-closed.
- **Residency is a declaration.** `'eu'` is what the table states, never a measurement of where inference ran or which route the bytes took; the guard certifies nothing about the network.
- **The default mode is `open`.** A deployment that needs the guarantee must declare `eu-only` in its own profile, because a shared bundle also serves machines that are not regulated deployments.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
