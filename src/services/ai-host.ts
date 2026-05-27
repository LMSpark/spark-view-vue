import { createAiAgentHost } from '@spark-view/spark-ai/agent'
import { createAiAgentTurnCallbacks } from './ai-turn-bridge'

export const appAiAgent = createAiAgentHost({
  turnCallbacks: createAiAgentTurnCallbacks(),
  maxToolRounds: 16,
})
