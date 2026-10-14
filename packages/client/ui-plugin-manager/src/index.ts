/** Host registry-response probing for the plugin installation dialog. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

declare module '@deepseek-ai/cordis' {
  interface Context {
    pluginRegistryProbe: PluginRegistryProbe
  }
}

/** Registry-probe switch and the row's declared timing policy. */
export interface Config {
  /** Whether the dialog may compare the public npm registries. */
  registryProbeEnabled: boolean
  /** Declared deadline of the retired parallel probes; kept so existing rows validate. */
  registryProbeTimeoutMs: number
  /** Declared lifetime of a cached probe result; kept so existing rows validate. */
  registryProbeCacheTtlMs: number
}

/** Compares public registry responses on the Host; the Client owns the initial selection. */
export default class PluginRegistryProbe extends TypertRemoteService {
  static Config: z<Partial<Config>, Config> = z.object({
    registryProbeEnabled: z.boolean().default(true),
    registryProbeTimeoutMs: z.natural().min(1).max(MAX_TIMER_DELAY_MS).default(1500),
    registryProbeCacheTtlMs: z.natural().default(300000),
  })

  private readonly lifetime = new AbortController()

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'pluginRegistryProbe')
    ctx.effect(() => async () => {
      this.lifetime.abort()
    })
  }

  /**
   * Answer which public registry the dialog should prefer.
   *
   * The Host does NOT ping `registry.npmjs.org` or `registry.npmmirror.com`: the
   * install dialog asks the package manager for its own registry, and a Helmcode
   * host has no business opening a socket to a third party's registry just to
   * time it. The switch, the deadline and the cache policy stay in the row's
   * schema because they are the service's declared contract —a profile that
   * configures them keeps validating— and the answer is now always "none".
   *
   * @returns null: no external registry is probed, so the dialog keeps the registry pnpm names.
   * @throws rejects when the service has been unloaded.
   */
  @Remote
  async fastest(): Promise<string | null> {
    this.lifetime.signal.throwIfAborted()
    if (!this.config.registryProbeEnabled) return null
    return this.probe()
  }

  private probe(): string | null {
    return null
  }
}
