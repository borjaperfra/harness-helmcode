/**
 * Local operator identity: one person per session, recorded in the log and
 * attributable in the evidence. THIS IS ATTRIBUTION, NOT AUTHENTICATION — the
 * plugin adds no credential, no prompt and no gate, so whoever holds the launch
 * URL still owns the harness, and this corte does not change that.
 *
 * It copies the `permission-presets` pattern: a host command
 * (`/operator <name>`), a durable and LOG-ONLY `identity/operator` event that
 * stays out of the model transcript (it is not a surface event), and the
 * host-only `operator` session projection the export and the evidence report
 * read. The default operator comes from the profile (`defaultOperator`);
 * `requireOperator` writes a process-log system notice when a session starts
 * with no operator, and never blocks the turn.
 *
 * Honest limit, stated here rather than implied: this attributes sessions, it
 * does not separate users on one node. The unattributed state is a declared
 * absence (`operator()` returns `undefined`), never a guessed default.
 *
 * @module @deepseek-ai/dsh-identity-local
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands/brand'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
// Type-only: resolves the required projection registry and the optional command child.
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-commands'

declare module '@deepseek-ai/cordis' {
  interface Context {
    identityLocal: IdentityLocalService
  }
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Records the session's operator as durable, log-only attribution. It is
     * not a surface event, so it never enters the model transcript; a `null`
     * operator is a RECORDED clear (the whole-value rule), not a missing fact,
     * and it survives a profile that attributes a default operator.
     */
    'identity/operator': {
      /** The operator name to attribute, or `null` to clear the session's attribution. */
      operator: string | null
      /** ISO instant of the record, stored in the payload so the log owns it. */
      at: string
    }
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** Latest recorded operator attribution, or the profile-default seed. */
    operator: OperatorProjectionState
  }
}

/** One session's attributed operator and the instant the log recorded it. */
export interface OperatorIdentity {
  /** The attributed operator's name. */
  operator: string
  /**
   * ISO instant of the `identity/operator` event that recorded this
   * attribution, or `null` when the name is the profile default
   * (`defaultOperator`) and no event has decided this session yet.
   */
  since: string | null
}

/**
 * The `operator` projection state: the latest recorded attribution, seeded from
 * the profile default for a session whose log records none.
 */
export interface OperatorProjectionState {
  /**
   * Latest `identity/operator` payload's operator, or the profile-default seed;
   * `null` when nothing is attributed to the session.
   */
  operator: string | null
  /**
   * ISO instant of the latest recorded event; `null` for the profile-default
   * seed — the session's attribution was never recorded, so there is no instant
   * to name.
   */
  since: string | null
}

/** The {@link IdentityLocalService} config: the profile default and the deployment's requirement. */
export interface Config {
  /**
   * Operator the profile attributes by default: the seed of every session whose
   * log records no `identity/operator` event of its own. Omitted: sessions start
   * unattributed, and only the `/operator` command attributes them.
   */
  defaultOperator?: string
  /**
   * Whether this deployment demands an operator. `true` writes a system notice
   * to the process log when a session starts with no operator; it never blocks
   * the turn, and no session message is appended (the log-only attribution
   * event is the only durable thing this plugin writes).
   */
  requireOperator: boolean
}

const operatorStateSchema: zod.ZodType<OperatorProjectionState> = zod.object({
  operator: zod.string().nullable(),
  since: zod.string().nullable(),
}).strict()

/**
 * One-event operator-state transition (the projection unit's `apply`). Unrelated
 * events return the same reference — the registry's change gate.
 * @param state - the folded state before `event`.
 * @param event - one committed session event.
 * @returns the next state; the same reference when the event is unrelated.
 */
function applyOperatorEvent(state: OperatorProjectionState, event: SessionEvent): OperatorProjectionState {
  if (event.type !== 'identity/operator') return state
  return { operator: event.data.operator, since: event.data.at }
}

/**
 * Owns the deployment's local operator attribution: the durable log-only
 * `identity/operator` event, the `operator` session projection, the `/operator`
 * command, and the `ctx.identityLocal` read face the export and the evidence
 * report use. Requires `ctx.sessionProjections`; the command child activates only
 * when a command registry is composed.
 */
export class IdentityLocalService extends Service {
  // Inline schema call: the config catalog walks `static Config` statically.
  static Config = z.object({
    defaultOperator: z.string(),
    requireOperator: z.boolean().default(false),
  })

  static inject = ['sessionProjections']

  private readonly defaultOperator: string | undefined
  private readonly requireOperator: boolean

  constructor(ctx: Context, config: Config) {
    super(ctx, 'identityLocal')
    this.defaultOperator = config.defaultOperator
    this.requireOperator = config.requireOperator

    ctx.sessionProjections.register({
      key: 'operator',
      stateVersion: 1,
      stateSchema: operatorStateSchema,
      // The profile default is the SEED, not a fallback: an event that records
      // `null` clears the session for good, so a deployment-wide default cannot
      // re-attribute a session the user un-attributed.
      init: () => ({ operator: this.defaultOperator ?? null, since: null }),
      apply: applyOperatorEvent,
    })

    ctx.on('session/created', (session) => { this.noticeMissingOperator(session) })

    // The `/operator` command: the one write path a surface uses. The child
    // activates only when a command registry is composed.
    ctx.inject(['commands'], (commandCtx) => {
      commandCtx.commands.register({
        definitionId: CommandDefinitionId('@deepseek-ai/dsh-identity-local'),
        name: 'operator',
        description: 'Attribute this session to a local operator (attribution, not authentication)',
        input: { hint: '<name|clear>' },
        // No settlement text labels its value with this command's own name: a
        // surface that renders `name · text` would otherwise read
        // `operator · attributed to…` twice over.
        handler: ({ agent, rawInput }) => {
          const input = rawInput.trim()
          if (input === '') {
            const current = this.operator(agent.session)
            if (current === undefined) {
              return { kind: 'success', text: 'no attribution in this session (pass a name to attribute one)' }
            }
            return {
              kind: 'success',
              text: current.since === null
                ? `attributed to ${current.operator} by the profile default (this session records no identity/operator event)`
                : `attributed to ${current.operator} since ${current.since}`,
            }
          }
          if (input === 'clear') {
            return {
              kind: 'success',
              text: this.clear(agent.session) ? 'attribution cleared' : 'no attribution to clear',
            }
          }
          this.set(agent.session, input)
          return { kind: 'success', text: `attributed to ${input}` }
        },
      })
    })
  }

  /**
   * The operator one session is attributed to.
   * @param session - the session whose attribution is read.
   * @returns the attributed operator and its instant, or `undefined` when the
   * session has none (never recorded, or cleared by the log).
   * @throws when the `operator` session projection is not registered.
   */
  operator(session: Session): OperatorIdentity | undefined {
    const state = this.projectionState(session)
    if (state.operator === null) return undefined
    return { operator: state.operator, since: state.since }
  }

  /**
   * Record a session's operator as durable, log-only attribution. An empty or
   * whitespace-only name records NOTHING (fail-soft: a caller gets no event
   * carrying an empty operator instead of a broken attribution), and
   * re-asserting the effective operator appends nothing, so the log keeps the
   * instant of the change rather than of every click.
   * @param session - the session the attribution belongs to.
   * @param name - the operator name to record.
   * @returns `true` when an `identity/operator` event was appended.
   * @throws when the `operator` session projection is not registered.
   */
  set(session: Session, name: string): boolean {
    const operator = name.trim()
    if (operator === '') return false
    if (operator === this.operator(session)?.operator) return false
    session.append('identity/operator', { operator, at: new Date().toISOString() })
    return true
  }

  /**
   * Clear a session's attribution by RECORDING the clear, so the profile default
   * cannot re-attribute a session the user un-attributed. A session with nothing
   * attributed appends nothing.
   * @param session - the session to clear.
   * @returns `true` when the clearing `identity/operator` event was appended.
   * @throws when the `operator` session projection is not registered.
   */
  clear(session: Session): boolean {
    if (this.projectionState(session).operator === null) return false
    session.append('identity/operator', { operator: null, at: new Date().toISOString() })
    return true
  }

  /** Read the projection state, refusing a composition without the unit. */
  private projectionState(session: Session): OperatorProjectionState {
    const state = this.ctx.sessionProjections.stateOf(session, 'operator')
    if (state === undefined) throw new Error('identity-local: operator session projection is not registered')
    return state
  }

  /**
   * Write the deployment's system notice for a freshly created session that has
   * no operator. It is a process-log warning: it opens no turn, appends no
   * session event, and never blocks a turn.
   */
  private noticeMissingOperator(session: Session): void {
    if (!this.requireOperator) return
    if (this.operator(session) !== undefined) return
    this.ctx.logger.warn(
      `identity-local: session "${session.id}" has no operator and this deployment requires one `
      + '— the session is not blocked; attribute it with /operator <name> or set `defaultOperator` in the profile',
    )
  }
}

export default IdentityLocalService
