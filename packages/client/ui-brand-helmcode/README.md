---
description: "Helmcode brand skin for the Web client: brand indigo palette, square corners, Roboto typography and the Helmcode lockup."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-helmcode

## Summary

This package gives the Web client the Helmcode identity, without editing the shipped design system. It registers one alias-token layer over the active theme — warm-black canvas, one-step surfaces, the indigo signal, the severity hues, square corners and the two brand families — injects the sheet that carries the Roboto faces, registers the `helmcode` locale namespace with the brand's own vocabulary, and occupies the sidebar brand seats with the kit's own lockup. Choose it for deployments branded as Helmcode; a deployment without that identity leaves it out of its roster, and nothing here reaches a model request.

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

Mount this plugin in the browser roster after `ui-theme` and `ui-sidebar`, then rebuild the client. The skin applies to every session in the profile.

### What it changes

The token layer supplies both color schemes. The brand kit defines ink for a dark canvas only, so the dark column is exact brand value and the light column is a derived counterpart that keeps the same indigo signal, the same opacity ladder for text and the same hairline separators — the Web client also offers a light preference, and the skin respects it instead of forcing one palette.

Square corners come from a zeroed radius scale, and the two families arrive as `--dsw-font-family` (Roboto) and `--ds-font-family-code` (Roboto Mono). The faces live in the shell's own `/fonts` directory, so nothing is fetched at runtime.

### Fonts

`src/styles/helmcode.css` declares Roboto 300/400/500 and Roboto Mono 400/500 against `/fonts/*.woff2`, which the Web shell serves from its public directory (see `apps/web/public/fonts`). Both families are Apache-2.0; only the 300, 400 and 500 weights exist, because the brand forbids heavier weights and refuses synthesized bold.

### The `helmcode` locale namespace

The brand owns its own voice, so this package registers the `helmcode` namespace with Spanish (the source of truth) and English dictionaries: residency labels, plan quota, the session operator, the recovery index, the API-key onboarding and the `//` eyebrows that title Helmcode's own sections. `common` and `settings.locale` each have exactly one occupant, and a product voice that lived inside another owner's dictionary could not change without editing that owner.

Other packages read it through the locale service — `ctx.locale.bind('helmcode')` — and the typed key union travels with this package's client entry. A composition without this package leaves those keys unresolved, which is the locale service's declared degradation, never invented copy elsewhere.

### Disabling or removing the skin

The row is a normal roster entry, so it can be turned off without touching this package. Add the override to the active profile's patch and the Loader reconciles it live:

```yaml
- id: ui-brand-helmcode
  disabled: true
```

Removing it entirely is the reverse of the three registration points: drop the row from `packages/bundle/web-app/cordis.patch.yml`, drop the dependency from `packages/bundle/web-app/package.json`, drop the project reference from `tsconfig.client.json`, and delete this package. Nothing else references it, and the shipped `ui-brand-official` occupant — which this package outranks by priority — returns to the seats by itself. The declared font faces become unused, so `apps/web/public/fonts` can go too.

### Brand seats

`sidebar.brand.mark` and `sidebar.brand.name` are single seats, and a second registration at the same priority throws. This package registers at a negative priority, so it renders where a shipped occupant would otherwise sit, and an uninstalled skin leaves that occupant in place.

The kit provides the lockup for dark surfaces only, so the expanded row shows the negative lockup while the derived light palette falls back to the bare symbol rather than inventing a positive wordmark the brand never defined.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`src/client/tokens.ts` holds the two columns and folds them into the `{ light, dark }` envelope `ctx.theme.overrideTokens` requires, keyed by every alias the shipped sheets declare. The override is the token-level analogue of slot shading: the base theme stays untouched and the layer retracts with this plugin's fiber.

`src/client/styles.ts` mounts `src/styles/helmcode.css` as a plugin-owned sheet tagged with `data-plugin`, which the module system retracts on unload and HMR. `src/client/Brand.tsx` reproduces the kit's traced geometry, including the symbol inside the lockup's own coordinate box. `src/client/locales.ts` holds the two dictionaries and `src/client/index.ts` registers them as one effect, so the namespace leaves with the fiber.

The browser half is [`src/client/index.ts`](src/client/index.ts); the node half is an empty Loader seat.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-theme](../ui-theme/README.md) — owns the token sheets and the override registry.
- [ui-sidebar](../ui-sidebar/README.md) — declares the brand seats and renders their fallbacks.
- [ui-brand-official](../ui-brand-official/README.md) — the shipped occupant this package outranks.
- [Web styling](../../../docs/web-styling.md) — the authoritative styling rules for web client components.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package contributes browser presentation only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define what a token-and-sheet skin can reach.

- **Border widths stay component-owned** — the brand asks for 0.5px hairlines, and this package enforces their ink; the widths live in the shipped component sheets, so a literal half-pixel pass is a separate change.
- **Mono is not applied to every label** — the brand sets technical labels, tags and data in Roboto Mono; the client has no label-face token, so only the code face and the brand artwork are mono today.
- **Light mode is derived** — the kit ships no light theme; the light column here is this repository's own counterpart, not a brand-approved artifact.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The token layer, the dictionaries and the sheet install and leave through plugin-owned effects.
