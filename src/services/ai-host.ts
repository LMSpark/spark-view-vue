import { createAiHost } from '@spark-view/spark-ai/host'
import { createAiHostTurnCallbacks } from './ai-turn-bridge'

export const appAiHost = createAiHost({
  turnCallbacks: createAiHostTurnCallbacks(),
  maxToolRounds: 16,
})
