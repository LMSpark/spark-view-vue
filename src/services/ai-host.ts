/**
 * @module app:services/ai-host
 * app 的 services/ai-host 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
import { createAiAgentHost } from '@spark-appworks/spark-ai/agent'
import { createAiAgentTurnCallbacks } from './ai-turn-bridge'

export const appAiAgent = createAiAgentHost({
  turnCallbacks: createAiAgentTurnCallbacks({ transport: 'app-sse' }),
  maxToolRounds: 16,
})
