/**
 * Helmcode browser-brand plugin: registers the brand token layer, its own
 * locale namespace, injects the brand sheet, and occupies the sidebar brand
 * seats.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { HelmcodeBrandMark, HelmcodeBrandName } from './Brand.tsx'
import { en, es, NS, type HelmcodeKey } from './locales.ts'
import { PLUGIN_ID } from './plugin-id.ts'
import { installHelmcodeStyles } from './styles.ts'
import { HELMCODE_TOKENS } from './tokens.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Helmcode's own vocabulary: residency, quota, operator, index, onboarding and eyebrows. */
    'helmcode': HelmcodeKey
  }
}

/** Services this plugin needs: the theme registry, the slot registry, and dictionaries. */
export const inject = ['theme', 'slots', 'locale']

/**
 * Rank below a shipped brand occupant, because the lowest priority renders in a
 * single seat: installing this skin takes over the brand cells instead of
 * colliding with them.
 */
const BRAND_PRIORITY = -10

/**
 * Apply the Helmcode skin.
 * @param ctx - Client plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.theme.overrideTokens(PLUGIN_ID, HELMCODE_TOKENS), 'ui-brand-helmcode: token layer')
  ctx.effect(() => ctx.locale.register(NS, { es, en }), 'ui-brand-helmcode: dictionaries')
  installHelmcodeStyles(ctx)
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.inject('sidebar.brand.name', function* () {
    yield ctx.slots.register({ name: 'sidebar.brand.mark', priority: BRAND_PRIORITY }, HelmcodeBrandMark)
    yield ctx.slots.register({ name: 'sidebar.brand.name', priority: BRAND_PRIORITY }, HelmcodeBrandName)
  }))
}
