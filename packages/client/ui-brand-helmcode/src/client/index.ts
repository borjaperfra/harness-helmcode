/**
 * Helmcode browser-brand plugin: registers the brand token layer, its own
 * locale namespace, injects the brand sheet, occupies the sidebar brand seats,
 * and mounts the Helmcode surfaces that are not a brand cell: the welcome body
 * of a new session (with the kit's mark on the hero), the quota estimator card
 * in the session header and the API-key onboarding step.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
// Type-only: the 'conversation.session.header.utilities' and 'settings.onboarding' entries.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: the ctx.remote Context merge and the credentials namespace.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: the quotaEstimate projection key merge read by the card.
import type {} from '@deepseek-ai/dsh-quota-helmcode/types'
import { HelmcodeBrandMark, HelmcodeBrandName } from './Brand.tsx'
import type { HelmcodeCredentialFace } from './Onboarding.tsx'
import { HelmcodeOnboarding } from './Onboarding.tsx'
import { en, es, NS, type HelmcodeKey } from './locales.ts'
import { PLUGIN_ID } from './plugin-id.ts'
import { QuotaCard } from './QuotaCard.tsx'
import { installHelmcodeStyles } from './styles.ts'
import { HELMCODE_TOKENS } from './tokens.ts'
import { HelmcodeHeroMark, WelcomeHero } from './WelcomeHero.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Helmcode's own vocabulary: residency, quota, operator, index, onboarding and eyebrows. */
    'helmcode': HelmcodeKey
  }
}

/** Services this plugin needs: the theme registry, the slot registry, dictionaries, and credentials. */
export const inject = ['theme', 'slots', 'locale', 'remote', 'remote.credentials']

/**
 * Rank below a shipped brand occupant, because the lowest priority renders in a
 * single seat: installing this skin takes over the brand cells instead of
 * colliding with them.
 */
const BRAND_PRIORITY = -10

/**
 * Reference the Helmcode bundle declares as the route's `apiKeyEnv`
 * (`packages/bundle/helmcode/cordis.patch.yml`). It is the credential whose
 * absence the onboarding exists to fix.
 */
export const API_KEY_REF = 'HELMCODE_API_KEY'

/**
 * Build the credential face the onboarding step writes through: the same
 * `credentials` Remote namespace a settings page uses, and never the profile's
 * configuration file. The secret crosses in one direction only.
 * @param ctx - Client plugin context, whose `remote.credentials` answers.
 * @returns the face the panel injects.
 */
export function credentialFace(ctx: ClientContext): HelmcodeCredentialFace {
  return {
    isConfigured: async () => {
      const response = await ctx.remote.credentials.describe([API_KEY_REF])
      return response.ok && response.value[API_KEY_REF]?.configured === true
    },
    set: async (value) => {
      const response = await ctx.remote.credentials.set(API_KEY_REF, value)
      return response.ok ? undefined : response.error.message
    },
  }
}

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
  // Bienvenida de una sesion nueva: el simbolo del kit sustituye la marca
  // generica del hero, y el cuerpo del hero lleva la propuesta de valor con los
  // cuatro modelos europeos. Los dos asientos son raiz, asi que el skin los
  // ocupa igual que las celdas de la barra lateral.
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({
    name: 'conversation.hero.brand.mark',
    priority: BRAND_PRIORITY,
  }, HelmcodeHeroMark))
  ctx.slots.inject('conversation.hero.body', () => ctx.slots.register({
    name: 'conversation.hero.body',
    locale: NS,
  }, WelcomeHero))
  // La tarjeta vive entre las utilidades de la cabecera de sesion porque es
  // persistente y de la sesion, no un aviso de fallo: `shell.quota-notice` es
  // para lo segundo.
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'helmcode-quota',
    order: 50,
    locale: NS,
  }, QuotaCard))
  ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
    name: 'settings.onboarding',
    id: 'helmcode-api-key',
    order: -10,
    locale: NS,
    inject: () => ({ credentials: credentialFace(ctx) }),
  }, HelmcodeOnboarding))
}
