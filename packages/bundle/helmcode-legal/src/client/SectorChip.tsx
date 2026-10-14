/**
 * The session-header sector chip.
 *
 * It answers one question for the operator: which sector pack is composing
 * this session. The value comes from the pack's own locale namespace, so the
 * chip renders whatever the mounted pack declares as its sector name.
 */

// Type-only: pulls the 'conversation.session.header.utilities' entry types.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './SectorChip.module.css'

/** Full component props: the utilities seat plus this pack's dictionary. */
export type SectorChipProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<'sector-legal'>

/**
 * Render the sector chip.
 * @param props - composed slot props carrying the bound translate seat.
 * @returns the chip naming the active sector pack.
 */
export function SectorChip({ t }: SectorChipProps) {
  return <span className={css.chip}>{t('sector.name')}</span>
}
