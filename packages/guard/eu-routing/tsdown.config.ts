import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-guard-eu-routing',
  ['lib/types/index.js'],
  { hostPhase: true },
)
