import type { JsonSchema } from './json-schema'
import type {
  AiScenarioContext,
  AiScenarioToolExecutionHost,
  AiScenarioToolExecutionRegistration,
} from './scenario-types'

/**
 * ==============================================
 * 合同层：AI 框架 Function Calling 契约
 * ==============================================
 * 功能分区：
 * 1) 描述 AI 框架维护的会话/Agent 上下文。
 * 2) 描述场景工具暴露给 AI 框架的一等 FC 定义。
 * 3) 描述函数调用与调用结果，避免依赖“JSON 文本伪工具调用”。
 * 4) 描述统一 SSE 事件信封，兼容未来主/子 Agent 调度。
 *
 * 边界：
 * - delta/reasoning/result/error/done 属于 AI 框架传输层。
 * - 场景层只关心 function call 的定义、调用、执行宿主与结果回写。
 */

/** AI 框架分配给场景层的会话/Agent 上下文。 */
export interface AiScenarioAgentSessionContext {
  sessionId: string
  requestId?: string
  turnId?: string
  agentId?: string
  parentSessionId?: string
  streamUrl?: string
  metadata?: Record<string, unknown>
}

/** 统一 SSE 事件类型；当前后端事件与未来统一信封共用。 */
export type AiScenarioSseEventType =
  | 'delta'
  | 'reasoning'
  | 'result'
  | 'error'
  | 'done'
  | 'usage'
  | 'function_call'
  | 'function_result'
  | 'unknown'

/** AI 框架向场景层暴露的统一事件信封。 */
export interface AiScenarioSseEventEnvelope<TPayload = unknown, TType extends string = string> {
  type: TType
  sessionId?: string
  requestId?: string
  turnId?: string
  agentId?: string
  parentSessionId?: string
  payload?: TPayload
  raw?: unknown
}

/** 场景工具投影为 AI 框架可见 function 的定义。 */
export interface AiScenarioFunctionDefinition {
  name: string
  description: string
  parameters?: JsonSchema
  scenarioId?: string
  toolName?: string
  execution: AiScenarioToolExecutionRegistration
  metadata?: Record<string, unknown>
}

/** AI 框架请求场景层执行或处理的一次 function call。 */
export interface AiScenarioFunctionCall {
  id: string
  name: string
  arguments?: unknown
  userInput?: string
  context?: Omit<AiScenarioContext, 'userInput'>
  session?: AiScenarioAgentSessionContext
}

/** function call 的处理状态。 */
export type AiScenarioFunctionCallStatus = 'executed' | 'requires-backend' | 'failed'

/** 场景层返回给 AI 框架的 function call 结果。 */
export interface AiScenarioFunctionCallResult {
  callId: string
  functionName: string
  ok: boolean
  status: AiScenarioFunctionCallStatus
  executionHost: AiScenarioToolExecutionHost
  scenarioId?: string
  toolName?: string
  backendRoute?: string
  result?: unknown
  error?: string
  raw?: unknown
}
