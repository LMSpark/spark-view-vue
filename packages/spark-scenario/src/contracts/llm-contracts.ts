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
  /** 可选取消信号；SSE / fetch 类客户端应把它透传给底层请求。 */
  signal?: AbortSignal
}

export interface AiBrowserLlmGenerateResponse {
  text: string
  raw?: unknown
}

export interface AiBrowserLlmClient {
  /**
   * 统一的浏览器端 LLM 客户端接口。
   *
   * 实现方可为：
   * - 浏览器本地模型（transformers.js 等）
   * - 基于 fetch 的远程模型（OpenAI 兼容 API）
   *
   * 要求：返回的 text 字段应为模型的最终可读文本（已做必要的后处理），raw 字段可选用于调试。
   */
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
  /**
   * 生成执行计划：仅使用 registry/llm 估算要执行的场景 ID 与工具调用列表。
   */
  plan: (request: AiScenarioPlanningRequest) => Promise<AiScenarioPlan>
  /**
   * 生成计划并直接交由 runtime 执行，返回最终的运行结果（含工具执行输出与状态）。
   */
  runWithPlanning: (request: AiScenarioPlanningRequest) => Promise<AiScenarioRunResult>
}
