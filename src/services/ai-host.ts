/**
 * @module app:services/ai-host
 * 职责：提供主应用 ai-host 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
 * 边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
 * AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 services/ai-host。
 */
import { createAiAgentHost } from '@spark-appworks/spark-ai/agent'
import { createAiAgentTurnCallbacks } from './ai-turn-bridge'

export const appAiAgent = createAiAgentHost({
  turnCallbacks: createAiAgentTurnCallbacks({ transport: 'app-sse' }),
  maxToolRounds: 16,
})
