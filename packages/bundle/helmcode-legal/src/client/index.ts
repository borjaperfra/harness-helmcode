/**
 * Browser half of the legal sector pack: the dictionaries that name the sector
 * and the chip that shows it in the session header, so the operator sees which
 * pack a session is running under.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the 'conversation.session.header.utilities' entry types.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { SectorChip } from './SectorChip.tsx'
import { en, es, NS, type SectorKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The legal pack's own vocabulary: the sector chip's name. */
    'sector-legal': SectorKey
  }
}

/** Services this plugin needs: the slot registry and the dictionary registry. */
export const inject = ['slots', 'locale']

/**
 * Register the pack's dictionaries and mount the sector chip among the
 * session header's utilities.
 * @param ctx - browser context carrying slots and locale services.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { es, en }), 'helmcode-legal: sector dictionaries')
  // Ahead of the shared utilities (quota, jobs, export): the pack a session runs
  // under is the first thing an operator reading the header needs to know.
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'sector-legal',
    order: -20,
    locale: NS,
  }, SectorChip))
}
