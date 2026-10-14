---
description: "The identity package group: anonymous, per-harness-home correlation ids shared by telemetry, feedback, and DeepSeek provider requests."
kind: "package-group"
---

# identity/ — shared identity

English | [中文](README.zh.md)

## Summary

The identity group provides one anonymous id per harness home that the installation's telemetry, feedback, and DeepSeek requests attach to their records, so everything leaving one home can be recognized as coming from the same installation without identifying the user. There is nothing to configure: the id appears automatically the first time one of those features runs and stays stable until its file is deleted. The group also carries local operator attribution, which names the person a session belongs to; that is attribution, not authentication. This page maps both packages, and each package README owns the details.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

<a id="packages"></a>
## Packages

| Package | Role |
|---|---|
| [`anonymous-user-id`](anonymous-user-id/README.md) | Gives every harness home one anonymous id that telemetry, feedback, and DeepSeek requests attach to their records, so records from one installation can be recognized without identifying the user |
| [`identity-local`](identity-local/README.md) | Attributes each session to a local operator through the `/operator` command, the durable log-only `identity/operator` event and the `operator` session projection, and exposes the `ctx.identityLocal` read face |

<a id="related-documentation"></a>
## Related documentation

- `dsh-llm-deepseek` — the DeepSeek provider that carries the id on requests.
- [dsh-command-feedback](../feedback/command-feedback/README.md) — the feedback command that names the anonymous installation in its acknowledgement.
- [Local operator identity](../../docs/subsystems/identity.md) — the attribution seam, its read face and its honest limits.

<a id="dev-note"></a>
## Dev Note

None.
