import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-helmcode-legal',
  ['lib/types/index.js'],
  { hostPhase: true },
)
