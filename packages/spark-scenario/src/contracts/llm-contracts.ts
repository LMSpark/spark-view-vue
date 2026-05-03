import type { AiScenarioContext, AiScenarioRunRequest, AiScenarioRunResult } from './scenario-types'

// ==============================================
// 合同层：浏览器 LLM 抽象
// ==============================================
// 功能分区：
// 1) 统一浏览器端 LLM 请求/响应协议。
// 2) 统一场景规划器输入输出协议。
//
// 时序分区：
// 1) planner.plan 先调用 llm.generate 生成执行计划。
// 2) planner.runWithPlanning 再把计划交给 runtime.run 执行。

export type AiBrowserLlmRole = 'system' | 'user' | 'assistant'

export interface AiBrowserLlmMessage {
  role: AiBrowserLlmRole
  content: string
}

export interface AiBrowserLlmGenerateRequest {
  messages: readonly AiBrowserLlmMessage[]
  temperature?: number
  maxTokens?: number
}

export interface AiBrowserLlmGenerateResponse {
  text: string
  raw?: unknown
}

export interface AiBrowserLlmClient {
  generate: (request: AiBrowserLlmGenerateRequest) => Promise<AiBrowserLlmGenerateResponse>
}

export interface AiScenarioPlanningRequest {
  userInput: string
  context?: Omit<AiScenarioContext, 'userInput'>
  forceScenarioId?: string
  dryRun?: boolean
}

export interface AiScenarioPlan {
  scenarioId: string
  toolCalls: AiScenarioRunRequest['toolCalls']
  reason?: string
  dryRun?: boolean
}

export interface AiScenarioBrowserPlanner {
  plan: (request: AiScenarioPlanningRequest) => Promise<AiScenarioPlan>
  runWithPlanning: (request: AiScenarioPlanningRequest) => Promise<AiScenarioRunResult>
}
