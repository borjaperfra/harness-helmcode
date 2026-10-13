/**
 * The Helmcode alias-token layer.
 *
 * Values come from the Helmcode brand kit (https://helmcode.com/brand) and its
 * brandbook. The kit is dark-only, so every dark value below is exact brand
 * ink; the light column is a derived counterpart that keeps the same signal
 * indigo, because the Web client also offers a light preference.
 *
 * Brand rules encoded here: warm black canvas, raised surfaces one step apart,
 * text at three opacity levels with 0.35 as the legible floor, a single indigo
 * accent, and the traffic-light hues reserved for severity. Square corners come
 * from the zeroed radius scale.
 */
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'

/** Ink shared by both schemes: the brand is square in every mode. */
const SHARED: Record<string, string> = {
  // Straight corners are the brand's technical personality: no radius anywhere.
  '--dsw-radius-xs': '0px',
  '--dsw-radius-sm': '0px',
  '--dsw-radius-md': '0px',
  '--dsw-radius-lg': '0px',
  '--dsw-radius-xl': '0px',
  '--dsw-radius-panel': '0px',
  // Roboto for titles and body, Roboto Mono for anything technical. The CJK
  // tails mirror ui-theme's base stack so Windows CJK never falls to SimSun.
  '--dsw-font-family': "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  '--dsw-font-family-brand': "'Roboto Mono', 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace",
  '--ds-font-family-code': "'Roboto Mono', 'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas, 'Liberation Mono', Menlo, Courier, 'PingFang SC', 'Microsoft YaHei'",
}

/** Exact Helmcode ink: the brand kit's dark tokens. */
const DARK: Record<string, string> = {
  '--dsw-alias-bg-base': '#0a0a0a',
  '--dsw-alias-bg-layer-1': '#111111',
  '--dsw-alias-bg-layer-2': '#161616',
  '--dsw-alias-bg-layer-3': '#1c1c1c',
  '--dsw-alias-bg-overlay': '#161616',
  '--dsw-alias-bg-document-preview': '#111111',
  '--dsw-alias-bg-document-selection': 'rgba(73, 52, 225, 0.40)',
  '--dsw-alias-label-document-preview': 'rgba(255, 255, 255, 0.55)',
  '--dsw-alias-bg-mask-1': 'rgba(0, 0, 0, 0.60)',
  '--dsw-alias-bg-mask-2': 'rgba(0, 0, 0, 0.24)',
  '--dsw-alias-bg-mask-3': 'rgba(0, 0, 0, 0.56)',
  '--dsw-alias-bg-mask-photo': 'rgba(0, 0, 0, 0.88)',
  '--dsw-alias-bg-mask-drop': 'rgba(22, 22, 22, 0.70)',
  '--dsw-alias-bg-module-platform': '#161616',
  '--dsw-alias-bg-multi-select': '#111111',
  '--dsw-alias-bg-skeleton': 'rgba(255, 255, 255, 0.06)',

  '--dsw-alias-border-l1': 'rgba(255, 255, 255, 0.04)',
  '--dsw-alias-border-l2': 'rgba(255, 255, 255, 0.09)',
  '--dsw-alias-border-l2-darkmode-thin': 'rgba(255, 255, 255, 0.09)',
  '--dsw-alias-border-l3': 'rgba(255, 255, 255, 0.09)',
  '--dsw-alias-border-l4': 'rgba(255, 255, 255, 0.16)',
  '--dsw-alias-border-inverted': 'rgba(255, 255, 255, 0.06)',
  '--dsw-alias-border-inverted2': 'rgba(255, 255, 255, 0.09)',

  '--dsw-alias-label-primary': '#ffffff',
  '--dsw-alias-label-primary-bluish': '#ffffff',
  '--dsw-alias-label-primary-dimmed': 'rgba(255, 255, 255, 0.70)',
  '--dsw-alias-label-primary-foreground': '#ffffff',
  '--dsw-alias-label-primary-inverted': '#0a0a0a',
  '--dsw-alias-label-secondary': 'rgba(255, 255, 255, 0.55)',
  '--dsw-alias-label-tertiary': 'rgba(255, 255, 255, 0.35)',
  '--dsw-alias-label-caption': 'rgba(255, 255, 255, 0.35)',
  '--dsw-alias-label-dimmed': 'rgba(255, 255, 255, 0.35)',
  '--dsw-alias-label-shimmer': 'rgba(255, 255, 255, 0.45)',
  '--dsw-alias-label-deep-diving': '#818cf8',
  '--dsw-alias-label-deep-diving-shimmer': '#babcfc',

  '--dsw-alias-brand-primary': '#4934e1',
  '--dsw-alias-brand-primary-invert': '#ffffff',
  '--dsw-alias-brand-primary-new-colorprimary-new-color': '#4934e1',
  '--dsw-alias-brand-text': '#818cf8',
  '--dsw-alias-link': '#818cf8',
  '--dsw-alias-menu-icon': 'rgba(255, 255, 255, 0.70)',

  '--dsw-alias-button-primary-fill': '#4934e1',
  '--dsw-alias-button-primary-hover': '#5a46e8',
  '--dsw-alias-button-primary-dimmed': 'rgba(73, 52, 225, 0.16)',
  '--dsw-alias-button-info-fill': '#818cf8',
  '--dsw-alias-button-info-hover': '#9aa4fb',
  '--dsw-alias-button-contrast-fill': '#ffffff',
  '--dsw-alias-button-elevated-fill': '#161616',
  '--dsw-alias-button-floating-fill': '#111111',
  '--dsw-alias-button-floating-hover': '#1c1c1c',
  '--dsw-alias-button-ghost-active-border': 'rgba(255, 255, 255, 0.16)',
  '--dsw-alias-button-ghost-active-fill': '#1c1c1c',
  '--dsw-alias-button-ghost-active-hover': '#222222',
  '--dsw-alias-button-tool-bar-fill': 'rgba(22, 22, 22, 0.60)',
  '--dsw-alias-button-tool-bar-hover': 'rgba(28, 28, 28, 0.70)',
  '--dsw-alias-button-tool-bar-fill-invisible': 'rgba(22, 22, 22, 0.36)',

  '--dsw-alias-interactive-bg-hover': 'rgba(255, 255, 255, 0.06)',
  '--dsw-alias-interactive-bg-hover-solid': '#1c1c1c',
  '--dsw-alias-interactive-bg-hover-accent': 'rgba(129, 140, 248, 0.18)',
  '--dsw-alias-interactive-bg-hover-danger': 'rgba(255, 95, 86, 0.14)',
  '--dsw-alias-interactive-bg-active': 'rgba(255, 255, 255, 0.10)',

  '--dsw-alias-markdown-citation': '#161616',
  '--dsw-alias-markdown-code-block': '#111111',
  '--dsw-alias-markdown-code-block-banner': '#161616',
  '--dsw-alias-markdown-code-segment-selected': '#161616',
  '--dsw-alias-markdown-code-segment-unselected': '#111111',
  '--dsw-alias-markdown-inline-code': '#1c1c1c',
  '--dsw-alias-markdown-placeholder': '#161616',
  '--dsw-alias-markdown-tag': '#161616',

  '--dsw-alias-scrollbar-bg-l1': 'rgba(255, 255, 255, 0.16)',
  '--dsw-alias-scrollbar-bg-l2': 'rgba(255, 255, 255, 0.20)',
  '--dsw-alias-scrollbar-hover-l1': 'rgba(255, 255, 255, 0.28)',
  '--dsw-alias-scrollbar-hover-l2': 'rgba(255, 255, 255, 0.32)',

  '--dsw-alias-state-business-primary': '#818cf8',
  '--dsw-alias-state-business-tertiary': 'rgba(73, 52, 225, 0.16)',
  '--dsw-alias-state-error-primary': '#ff5f56',
  '--dsw-alias-state-error-secondary': '#ff5f56',
  '--dsw-alias-state-idle-primary': 'rgba(255, 255, 255, 0.35)',
  '--dsw-alias-state-success-primary': '#27c93f',
  '--dsw-alias-state-success-secondary': '#27c93f',
  '--dsw-alias-state-success-tertiary': 'rgba(39, 201, 63, 0.12)',
  '--dsw-alias-state-warn-primary': '#ffbd2e',
  '--dsw-alias-state-warn-secondary': '#ffbd2e',
  '--dsw-alias-state-warn-label': '#ffbd2e',
  '--dsw-alias-state-warn-tertiary': 'rgba(255, 189, 46, 0.12)',

  '--dsw-alias-code-diff-added': 'rgba(39, 201, 63, 0.12)',
  '--dsw-alias-code-diff-deleted': 'rgba(255, 95, 86, 0.12)',
  '--dsw-alias-file-diff-added-bg': 'rgba(39, 201, 63, 0.10)',
  '--dsw-alias-file-diff-added-gutter': 'rgba(39, 201, 63, 0.06)',
  '--dsw-alias-file-diff-added-marker': '#27c93f',
  '--dsw-alias-file-diff-deleted-bg': 'rgba(255, 95, 86, 0.10)',
  '--dsw-alias-file-diff-deleted-gutter': 'rgba(255, 95, 86, 0.06)',
  '--dsw-alias-file-diff-deleted-marker': '#ff5f56',

  '--dsw-alias-switch-thumb': 'rgba(255, 255, 255, 0.55)',
  '--dsw-alias-toast-bg': '#161616',
  '--dsw-alias-toast-label': '#ffffff',
  '--dsw-alias-tooltip-bg': '#161616',
  '--dsw-alias-tooltip-key-bg': '#222222',
  '--dsw-alias-turn-trigger-bg': 'rgba(255, 255, 255, 0.06)',
  '--dsw-alias-turn-trigger-bg-hover': 'rgba(255, 255, 255, 0.10)',

  '--dsw-menu-surface-fill': 'rgba(22, 22, 22, 0.96)',
  '--dsw-alias-menu-group-header-fill': 'rgba(17, 17, 17, 0.96)',
  '--dsw-specific-menu': 'rgba(22, 22, 22, 0.96)',
  '--dsw-specific-selector': '#161616',
  '--dsw-specific-sidebar-fill': '#0a0a0a',
  '--dsw-specific-sidebar-nav-item-active': '#161616',
  '--dsw-specific-sidebar-nav-item-active-accent': 'rgba(73, 52, 225, 0.20)',
  '--dsw-specific-sidebar-nav-item-hover': '#111111',
  '--dsw-specific-bubble': '#111111',
  '--dsw-specific-bubble-highlight': '#1c1c1c',
  '--dsw-specific-input-major': '#111111',
  '--dsw-specific-login-input': '#111111',
  '--dsw-specific-tip': '#161616',

  // Elevation stays a black shadow plus one hairline: no glass, no glow.
  '--dsw-elevation-stroke-color': 'rgba(255, 255, 255, 0.09)',
  '--dsw-menu-backdrop-filter': 'none',
  '--dsw-focus-ring-color': '#818cf8',
}

/**
 * Derived light counterpart. The brand kit ships no light theme, so these
 * mirror its structure on white: the same indigo signal, black-opacity text
 * ladder, hairline separators, and severity hues darkened to stay legible.
 */
const LIGHT: Record<string, string> = {
  '--dsw-alias-bg-base': '#ffffff',
  '--dsw-alias-bg-layer-1': '#ffffff',
  '--dsw-alias-bg-layer-2': '#fafafa',
  '--dsw-alias-bg-layer-3': '#f5f5f5',
  '--dsw-alias-bg-overlay': '#ffffff',
  '--dsw-alias-bg-document-preview': '#fafafa',
  '--dsw-alias-bg-document-selection': 'rgba(73, 52, 225, 0.24)',
  '--dsw-alias-label-document-preview': 'rgba(10, 10, 10, 0.60)',
  '--dsw-alias-bg-mask-1': 'rgba(10, 10, 10, 0.24)',
  '--dsw-alias-bg-mask-2': 'rgba(10, 10, 10, 0.12)',
  '--dsw-alias-bg-mask-3': 'rgba(10, 10, 10, 0.48)',
  '--dsw-alias-bg-mask-photo': 'rgba(0, 0, 0, 0.88)',
  '--dsw-alias-bg-mask-drop': 'rgba(255, 255, 255, 0.70)',
  '--dsw-alias-bg-module-platform': '#f5f5f5',
  '--dsw-alias-bg-multi-select': '#f5f5f5',
  '--dsw-alias-bg-skeleton': 'rgba(10, 10, 10, 0.05)',

  '--dsw-alias-border-l1': 'rgba(10, 10, 10, 0.05)',
  '--dsw-alias-border-l2': 'rgba(10, 10, 10, 0.09)',
  '--dsw-alias-border-l2-darkmode-thin': 'rgba(10, 10, 10, 0.09)',
  '--dsw-alias-border-l3': 'rgba(10, 10, 10, 0.12)',
  '--dsw-alias-border-l4': 'rgba(10, 10, 10, 0.16)',
  '--dsw-alias-border-inverted': 'rgba(0, 0, 0, 0)',
  '--dsw-alias-border-inverted2': 'rgba(0, 0, 0, 0)',

  '--dsw-alias-label-primary': '#0a0a0a',
  '--dsw-alias-label-primary-bluish': '#0a0a0a',
  '--dsw-alias-label-primary-dimmed': 'rgba(10, 10, 10, 0.70)',
  '--dsw-alias-label-primary-foreground': '#ffffff',
  '--dsw-alias-label-primary-inverted': '#ffffff',
  '--dsw-alias-label-secondary': 'rgba(10, 10, 10, 0.60)',
  '--dsw-alias-label-tertiary': 'rgba(10, 10, 10, 0.45)',
  '--dsw-alias-label-caption': 'rgba(10, 10, 10, 0.45)',
  '--dsw-alias-label-dimmed': 'rgba(10, 10, 10, 0.35)',
  '--dsw-alias-label-shimmer': 'rgba(10, 10, 10, 0.30)',
  '--dsw-alias-label-deep-diving': '#4934e1',
  '--dsw-alias-label-deep-diving-shimmer': '#818cf8',

  '--dsw-alias-brand-primary': '#4934e1',
  '--dsw-alias-brand-primary-invert': '#0a0a0a',
  '--dsw-alias-brand-primary-new-colorprimary-new-color': '#4934e1',
  '--dsw-alias-brand-text': '#4934e1',
  '--dsw-alias-link': '#4934e1',
  '--dsw-alias-menu-icon': 'rgba(10, 10, 10, 0.70)',

  '--dsw-alias-button-primary-fill': '#4934e1',
  '--dsw-alias-button-primary-hover': '#3b28c9',
  '--dsw-alias-button-primary-dimmed': 'rgba(73, 52, 225, 0.10)',
  '--dsw-alias-button-info-fill': '#4934e1',
  '--dsw-alias-button-info-hover': '#3b28c9',
  '--dsw-alias-button-contrast-fill': '#0a0a0a',
  '--dsw-alias-button-elevated-fill': '#ffffff',
  '--dsw-alias-button-floating-fill': '#ffffff',
  '--dsw-alias-button-floating-hover': '#f5f5f5',
  '--dsw-alias-button-ghost-active-border': 'rgba(10, 10, 10, 0.16)',
  '--dsw-alias-button-ghost-active-fill': '#f5f5f5',
  '--dsw-alias-button-ghost-active-hover': '#eeeeee',
  '--dsw-alias-button-tool-bar-fill': 'rgba(255, 255, 255, 0.60)',
  '--dsw-alias-button-tool-bar-hover': 'rgba(245, 245, 245, 0.70)',
  '--dsw-alias-button-tool-bar-fill-invisible': 'rgba(255, 255, 255, 0.36)',

  '--dsw-alias-interactive-bg-hover': 'rgba(10, 10, 10, 0.05)',
  '--dsw-alias-interactive-bg-hover-solid': '#f5f5f5',
  '--dsw-alias-interactive-bg-hover-accent': 'rgba(73, 52, 225, 0.10)',
  '--dsw-alias-interactive-bg-hover-danger': 'rgba(192, 38, 29, 0.08)',
  '--dsw-alias-interactive-bg-active': 'rgba(10, 10, 10, 0.08)',

  '--dsw-alias-markdown-citation': '#f5f5f5',
  '--dsw-alias-markdown-code-block': '#fafafa',
  '--dsw-alias-markdown-code-block-banner': '#f5f5f5',
  '--dsw-alias-markdown-code-segment-selected': '#ffffff',
  '--dsw-alias-markdown-code-segment-unselected': '#f5f5f5',
  '--dsw-alias-markdown-inline-code': '#f5f5f5',
  '--dsw-alias-markdown-placeholder': '#f5f5f5',
  '--dsw-alias-markdown-tag': '#f5f5f5',

  '--dsw-alias-scrollbar-bg-l1': 'rgba(10, 10, 10, 0.16)',
  '--dsw-alias-scrollbar-bg-l2': 'rgba(10, 10, 10, 0.20)',
  '--dsw-alias-scrollbar-hover-l1': 'rgba(10, 10, 10, 0.28)',
  '--dsw-alias-scrollbar-hover-l2': 'rgba(10, 10, 10, 0.32)',

  '--dsw-alias-state-business-primary': '#4934e1',
  '--dsw-alias-state-business-tertiary': 'rgba(73, 52, 225, 0.10)',
  '--dsw-alias-state-error-primary': '#c0261d',
  '--dsw-alias-state-error-secondary': '#c0261d',
  '--dsw-alias-state-idle-primary': 'rgba(10, 10, 10, 0.30)',
  '--dsw-alias-state-success-primary': '#1e9e4a',
  '--dsw-alias-state-success-secondary': '#1e9e4a',
  '--dsw-alias-state-success-tertiary': 'rgba(30, 158, 74, 0.10)',
  '--dsw-alias-state-warn-primary': '#b5780e',
  '--dsw-alias-state-warn-secondary': '#b5780e',
  '--dsw-alias-state-warn-label': '#b5780e',
  '--dsw-alias-state-warn-tertiary': 'rgba(181, 120, 14, 0.10)',

  '--dsw-alias-code-diff-added': 'rgba(30, 158, 74, 0.10)',
  '--dsw-alias-code-diff-deleted': 'rgba(192, 38, 29, 0.10)',
  '--dsw-alias-file-diff-added-bg': 'rgba(30, 158, 74, 0.10)',
  '--dsw-alias-file-diff-added-gutter': 'rgba(30, 158, 74, 0.05)',
  '--dsw-alias-file-diff-added-marker': '#1e9e4a',
  '--dsw-alias-file-diff-deleted-bg': 'rgba(192, 38, 29, 0.10)',
  '--dsw-alias-file-diff-deleted-gutter': 'rgba(192, 38, 29, 0.05)',
  '--dsw-alias-file-diff-deleted-marker': '#c0261d',

  '--dsw-alias-switch-thumb': '#ffffff',
  '--dsw-alias-toast-bg': '#111111',
  '--dsw-alias-toast-label': '#ffffff',
  '--dsw-alias-tooltip-bg': '#111111',
  '--dsw-alias-tooltip-key-bg': '#2a2a2a',
  '--dsw-alias-turn-trigger-bg': 'rgba(10, 10, 10, 0.04)',
  '--dsw-alias-turn-trigger-bg-hover': 'rgba(10, 10, 10, 0.08)',

  '--dsw-menu-surface-fill': 'rgba(255, 255, 255, 0.96)',
  '--dsw-alias-menu-group-header-fill': 'rgba(250, 250, 250, 0.96)',
  '--dsw-specific-menu': 'rgba(255, 255, 255, 0.96)',
  '--dsw-specific-selector': '#f5f5f5',
  '--dsw-specific-sidebar-fill': '#fafafa',
  '--dsw-specific-sidebar-nav-item-active': '#f0f0f0',
  '--dsw-specific-sidebar-nav-item-active-accent': 'rgba(73, 52, 225, 0.10)',
  '--dsw-specific-sidebar-nav-item-hover': '#f5f5f5',
  '--dsw-specific-bubble': '#fafafa',
  '--dsw-specific-bubble-highlight': '#f0f0f0',
  '--dsw-specific-input-major': '#ffffff',
  '--dsw-specific-login-input': '#fafafa',
  '--dsw-specific-tip': '#f5f5f5',

  '--dsw-elevation-stroke-color': 'rgba(10, 10, 10, 0.09)',
  '--dsw-menu-backdrop-filter': 'none',
  '--dsw-focus-ring-color': '#4934e1',
}

/**
 * Build the two-scheme envelope `overrideTokens` requires: every token carries
 * one value per color scheme, and the shared ink is repeated in both.
 * @returns The complete Helmcode token layer.
 */
function buildOverrides(): ThemeTokenOverrides {
  const overrides: ThemeTokenOverrides = {}
  for (const name of new Set([...Object.keys(LIGHT), ...Object.keys(DARK), ...Object.keys(SHARED)])) {
    const shared = SHARED[name]
    overrides[name] = {
      light: shared ?? LIGHT[name] ?? '',
      dark: shared ?? DARK[name] ?? '',
    }
  }
  return overrides
}

/** Inmutable token layer handed to `ctx.theme.overrideTokens`. */
export const HELMCODE_TOKENS: ThemeTokenOverrides = Object.freeze(buildOverrides())
