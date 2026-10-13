/**
 * Helmcode plan quotas for the DeepSeek Harness.
 *
 * Today this package owns the published limits and the policy that reads them.
 * The meter that counts against them, and the tool the agent asks, arrive on
 * top of this table rather than beside it.
 *
 * @module @deepseek-ai/dsh-quota-helmcode
 */

export * from './limits.ts'
