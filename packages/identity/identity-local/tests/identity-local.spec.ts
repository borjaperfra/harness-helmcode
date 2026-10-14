/**
 * The `operator` projection unit, the `/operator` command and the
 * `ctx.identityLocal` read face. Mounting the service beside the projection
 * registry folds the log-only `identity/operator` event into `{ operator, since }`,
 * seeds a session from the profile's `defaultOperator`, records a clear as an
 * event (so the default cannot re-attribute it) and attributes through the
 * command. The fail-soft paths — an empty name, a re-asserted operator, a
 * session with nothing attributed — append no event, and `requireOperator`
 * warns through the process log without blocking the turn.
 *
 * @module @deepseek-ai/dsh-identity-local/tests
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId, foldSurface, isSurfaceEligibleType } from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createScope } from '@deepseek-ai/dsh-scope'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import IdentityLocalService from '@deepseek-ai/dsh-identity-local'

/** The instant shape every recorded event carries. */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

/** The plugin's config input, derived from its own schema. */
type ServiceConfig = NonNullable<Parameters<typeof IdentityLocalService.Config>[0]>

async function harness(options: {
  config?: ServiceConfig
  commands?: boolean
  service?: boolean
} = {}): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  if (options.commands !== false) await ctx.plugin(CommandRuntime)
  if (options.service !== false) await ctx.plugin(IdentityLocalService, options.config ?? {})
  return ctx
}

/** Every durable attribution event in one session's log, narrowed to its payload. */
function attributionEvents(session: Session): SessionEvent<'identity/operator'>[] {
  return session.snapshotEvents().filter(
    (event): event is SessionEvent<'identity/operator'> => event.type === 'identity/operator',
  )
}

/** Mint a scoped agent over a live session (the command executor's addressing shape). */
async function agentFor(ctx: Context, session: Session) {
  const agent = { id: session.id, session } as unknown as Agent
  await ctx.plugin(Object.assign((inner: Context) => { createScope(inner, agent) }, { inject: ['commands'] }))
  return agent
}

describe('operator projection unit', () => {
  it('starts unattributed and folds the recorded event without touching unrelated ones', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('operator-fold'))
    expect(ctx.sessionProjections.stateOf(session, 'operator')).toEqual({ operator: null, since: null })

    session.append('identity/operator', { operator: 'alice', at: '2026-01-02T03:04:05.000Z' })
    expect(ctx.sessionProjections.stateOf(session, 'operator'))
      .toEqual({ operator: 'alice', since: '2026-01-02T03:04:05.000Z' })

    // An unrelated event keeps the same state reference: the registry's change gate.
    const before = ctx.sessionProjections.stateOf(session, 'operator')
    session.append('turn/start', { turn: 1 })
    expect(ctx.sessionProjections.stateOf(session, 'operator')).toBe(before)
    expect(ctx.identityLocal.operator(session)).toEqual({ operator: 'alice', since: '2026-01-02T03:04:05.000Z' })
  })

  it('seeds the profile default, and a recorded clear overrides it for good', async () => {
    const ctx = await harness({ config: { defaultOperator: 'root' } })
    const session = ctx.sessions.create(SessionId('operator-seed'))
    // The seed carries no instant: the session's attribution was never recorded.
    expect(ctx.identityLocal.operator(session)).toEqual({ operator: 'root', since: null })

    expect(ctx.identityLocal.clear(session)).toBe(true)
    const cleared = ctx.sessionProjections.stateOf(session, 'operator')
    expect(cleared).toMatchObject({ operator: null })
    expect(cleared?.since).toMatch(ISO)
    expect(ctx.identityLocal.operator(session)).toBeUndefined()
    // A second clear appends nothing: the log already decided this session.
    expect(ctx.identityLocal.clear(session)).toBe(false)
    expect(attributionEvents(session)).toHaveLength(1)
  })

  it('closes the key without the service and drops it on unload (HMR safety)', async () => {
    const ctx = await harness({ service: false })
    const session = ctx.sessions.create(SessionId('operator-hmr'))
    expect(ctx.sessionProjections.stateOf(session, 'operator')).toBeUndefined()

    const fiber = await ctx.plugin(IdentityLocalService, {})
    expect(ctx.sessionProjections.stateOf(session, 'operator')).toEqual({ operator: null, since: null })
    await fiber.dispose()
    expect(ctx.sessionProjections.stateOf(session, 'operator')).toBeUndefined()
  })

  it('fails when the operator projection key is absent', async () => {
    const ctx = await harness()
    vi.spyOn(ctx.sessionProjections, 'stateOf').mockReturnValue(undefined)
    const session = ctx.sessions.create(SessionId('operator-missing-key'))
    expect(() => ctx.identityLocal.operator(session))
      .toThrow('identity-local: operator session projection is not registered')
  })

  it('records the attribution off the model transcript', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('operator-log-only'))
    ctx.identityLocal.set(session, 'alice')

    expect(isSurfaceEligibleType('identity/operator')).toBe(false)
    const surface = foldSurface(session.snapshotEvents())
    expect(surface.nodes).toEqual([])
    expect(attributionEvents(session)).toHaveLength(1)
  })
})

describe('IdentityLocalService', () => {
  it('records an attribution (trimmed) and reads it back', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('operator-set'))
    expect(ctx.identityLocal.set(session, '  alice  ')).toBe(true)

    const [event] = attributionEvents(session)
    expect(event?.data).toMatchObject({ operator: 'alice' })
    expect(event?.data.at).toMatch(ISO)
    expect(ctx.identityLocal.operator(session)).toEqual({ operator: 'alice', since: event?.data.at })
  })

  it('fails soft on an empty name and on a re-asserted operator', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('operator-fail-soft'))
    expect(ctx.identityLocal.set(session, '   ')).toBe(false)
    expect(attributionEvents(session)).toEqual([])
    expect(ctx.identityLocal.operator(session)).toBeUndefined()

    expect(ctx.identityLocal.set(session, 'alice')).toBe(true)
    expect(ctx.identityLocal.set(session, ' alice ')).toBe(false)
    expect(ctx.identityLocal.set(session, 'bob')).toBe(true)
    expect(attributionEvents(session).map(event => event.data.operator)).toEqual(['alice', 'bob'])
  })

  it('clears nothing when the session has no attribution at all', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('operator-nothing-to-clear'))
    expect(ctx.identityLocal.clear(session)).toBe(false)
    expect(attributionEvents(session)).toEqual([])
  })
})

describe('requireOperator system notice', () => {
  it('warns through the process log for a session with no operator, without blocking it', async () => {
    const ctx = await harness({ config: { requireOperator: true } })
    const warned = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => undefined)
    const session = ctx.sessions.create(SessionId('operator-required'))

    expect(warned).toHaveBeenCalledOnce()
    expect(String(warned.mock.calls[0]?.[0])).toContain('has no operator and this deployment requires one')
    // The notice is a process-log warning: no session event, no blocked turn.
    expect(attributionEvents(session)).toEqual([])
    expect(ctx.identityLocal.operator(session)).toBeUndefined()
  })

  it('stays silent when the deployment does not require an operator', async () => {
    const ctx = await harness()
    const warned = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => undefined)
    ctx.sessions.create(SessionId('operator-not-required'))
    expect(warned).not.toHaveBeenCalled()
  })

  it('stays silent when the session already has an operator', async () => {
    const ctx = await harness({ config: { requireOperator: true, defaultOperator: 'root' } })
    const warned = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => undefined)
    ctx.sessions.create(SessionId('operator-required-present'))
    expect(warned).not.toHaveBeenCalled()
  })
})

describe('/operator command', () => {
  it('reports the attribution, the profile default and the unattributed state', async () => {
    const unattributed = await harness()
    const bare = unattributed.sessions.create(SessionId('operator-bare'))
    expect(await unattributed.commands.execute(
      await agentFor(unattributed, bare), '/operator', [], new AbortController().signal,
    )).toMatchObject({
      result: { kind: 'success', text: 'no attribution in this session (pass a name to attribute one)' },
    })

    const seeded = await harness({ config: { defaultOperator: 'root' } })
    const session = seeded.sessions.create(SessionId('operator-report'))
    const agent = await agentFor(seeded, session)
    const reported = await seeded.commands.execute(agent, '/operator', [], new AbortController().signal)
    expect(String(reported?.result.text)).toContain('attributed to root by the profile default')

    seeded.identityLocal.set(session, 'alice')
    const recorded = await seeded.commands.execute(agent, '/operator', [], new AbortController().signal)
    expect(String(recorded?.result.text)).toMatch(/^attributed to alice since .+Z$/)
  })

  it('attributes, records the lifecycle pair and treats a blank input as a report', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('operator-command'))
    const agent = await agentFor(ctx, session)
    const attributed = await ctx.commands.execute(agent, '/operator alice', [], new AbortController().signal)
    expect(attributed?.result).toEqual({ kind: 'success', text: 'attributed to alice' })
    expect(attributionEvents(session).map(event => event.data.operator)).toEqual(['alice'])
    expect(session.snapshotEvents().find(event => event.type === 'command/run')?.data)
      .toMatchObject({ name: 'operator', args: ' alice' })

    // A whitespace-only name is the fail-soft path: it reports and appends nothing.
    const blank = await ctx.commands.execute(agent, '/operator   ', [], new AbortController().signal)
    expect(String(blank?.result.text)).toContain('attributed to alice')
    expect(attributionEvents(session)).toHaveLength(1)
  })

  it('clears through the command, and says so when there is nothing to clear', async () => {
    const ctx = await harness({ config: { defaultOperator: 'root' } })
    const session = ctx.sessions.create(SessionId('operator-command-clear'))
    const agent = await agentFor(ctx, session)
    const cleared = await ctx.commands.execute(agent, '/operator clear', [], new AbortController().signal)
    expect(cleared?.result).toEqual({ kind: 'success', text: 'attribution cleared' })
    expect(attributionEvents(session).map(event => event.data.operator)).toEqual([null])

    const again = await ctx.commands.execute(agent, '/operator clear', [], new AbortController().signal)
    expect(again?.result).toEqual({ kind: 'success', text: 'no attribution to clear' })
    expect(attributionEvents(session)).toHaveLength(1)
  })

  it('serves the service without registering a command when no registry is composed', async () => {
    const ctx = await harness({ commands: false })
    expect(ctx.get('commands')).toBeUndefined()
    const session = ctx.sessions.create(SessionId('operator-no-commands'))
    expect(ctx.identityLocal.set(session, 'alice')).toBe(true)
    expect(ctx.identityLocal.operator(session)?.operator).toBe('alice')
  })
})
