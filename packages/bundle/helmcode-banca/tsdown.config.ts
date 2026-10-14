import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-helmcode-banca',
  ['lib/types/index.js'],
  { hostPhase: true },
)
