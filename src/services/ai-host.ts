import { createAiAgentHost } from '@spark-appworks/spark-ai/agent'
import { createAiAgentTurnCallbacks } from './ai-turn-bridge'

export const appAiAgent = createAiAgentHost({
  turnCallbacks: createAiAgentTurnCallbacks({ transport: 'session-turn' }),
  maxToolRounds: 16,
})
