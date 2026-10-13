/**
 * Mount this plugin's global Helmcode sheet for exactly its own lifetime.
 */
import type { Context } from '@deepseek-ai/cordis'
import helmcode from '../styles/helmcode.css?inline'
import { PLUGIN_ID } from './plugin-id.ts'

/**
 * Append the Helmcode sheet, tagged so the module system can retract it on
 * unload or HMR.
 * @param ctx - Owning plugin context.
 */
export function installHelmcodeStyles(ctx: Context): void {
  if (typeof document === 'undefined') return
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = PLUGIN_ID
    tag.dataset.pluginCss = `${PLUGIN_ID}/helmcode.css`
    tag.textContent = helmcode
    document.head.appendChild(tag)
    return () => { tag.remove() }
  }, 'ui-brand-helmcode: helmcode stylesheet')
}
