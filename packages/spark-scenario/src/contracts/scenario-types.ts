import type { JsonSchema } from './json-schema'

// ==============================================
// 合同层：基础枚举与策略
// ==============================================
// 功能分区：统一约束场景作用域、确认策略、恢复策略。
// 时序分区：场景注册时声明 -> runtime 执行与恢复阶段消费。

/** 场景作用域：用于路由与能力归类。
 *
 * 说明：业务系统中可能存在多个垂直域（例如 finance/HR 等），
 * 在注册和查询时将场景按 scope 归类有利于目录筛选与路由决策。
 * 此处列举常见 scope，允许后续扩展。
 */
export type AiScenarioScope = 'planning' | 'design' | 'business' | 'finance'
/** 确认策略：控制执行前的人机确认粒度。 */
export type AiConfirmPolicy = 'auto' | 'critical-confirm' | 'plan-confirm' | 'step-confirm' | 'human-takeover'
/** 恢复策略：定义失败后的恢复方式。 */
export type AiRecoveryPolicy = 'layered' | 'manual' | 'strict'

/**
 * 场景身份基类。
 * 所有场景在 registry 中都用该三元组识别。
 */
export interface AiScenarioIdentity {
  /** 场景唯一标识。 */
  id: string
  /** 场景标题。 */
  title: string
  /** 场景作用域。 */
  scope: AiScenarioScope
}

/**
 * 提示词策略。
 * 支持静态提示词、动态提示词、模板绑定三种入口。
 */
export interface AiScenarioPromptPolicy {
  /** 场景系统提示词（静态字符串或动态函数）。 */
  systemPrompt?: string | ((ctx: AiScenarioContext) => string)
  /** 绑定提示词模板 ID（优先于 systemPrompt 解析）。 */
  promptTemplateId?: string
  /** 模板上下文，可静态给定也可动态构建。 */
  promptTemplateContext?: Record<string, unknown> | ((ctx: AiScenarioContext) => Record<string, unknown>)
  /** 确认策略。 */
  confirmPolicy?: AiConfirmPolicy
  /** 恢复策略。 */
  recoveryPolicy?: AiRecoveryPolicy
}

/**
 * 场景运行上下文。
 * 由 run(request) 在执行阶段统一构建并下发给工具。
 */
export interface AiScenarioContext {
  userInput: string
  pageId?: string
  projectId?: string
  moduleId?: string
  route?: string
  user?: { id?: string; name?: string; role?: string }
  metadata?: Record<string, unknown>
}

// ==============================================
// 合同层：能力与 payload
// ==============================================
// 功能分区：定义“能做什么”（capability）与“输入需要什么”（payload）。
// 时序分区：query 阶段用于发现能力，执行前用于补齐参数。

export type AiScenarioCapabilityKind = 'intent' | 'payload' | 'tool' | 'flow' | 'completion' | 'recovery'

export interface AiScenarioCapability {
  id: string
  title: string
  kind: AiScenarioCapabilityKind
  description: string
  tags?: readonly string[]
  relatedTools?: readonly string[]
  requiredPayloadKeys?: readonly string[]
}

export type AiScenarioPayloadSlotSource = 'user' | 'context' | 'tool' | 'system'

/** payload 字段槽位声明。 */
export interface AiScenarioPayloadSlot {
  key: string
  label?: string
  description: string
  required?: boolean
  source?: AiScenarioPayloadSlotSource
  schema?: JsonSchema['properties'][string]
  askWhenMissing?: string
  examples?: readonly unknown[]
}

/** payload 契约（可做追问、补齐、校验的统一来源）。 */
export interface AiScenarioPayloadContract {
  description?: string
  schema?: JsonSchema
  slots?: readonly AiScenarioPayloadSlot[]
  required?: readonly string[]
  examples?: ReadonlyArray<Record<string, unknown>>
}

// ==============================================
// 合同层：流程、闭合、恢复
// ==============================================
// 功能分区：定义执行步骤、闭合校验、失败恢复提示。
// 时序分区：queryScenarioFlow -> runtime 执行 -> completion/recovery。

export type AiScenarioFlowStepKind = 'query' | 'tool' | 'decision' | 'confirm' | 'completion'

export interface AiScenarioFlowStep {
  id: string
  title: string
  kind?: AiScenarioFlowStepKind
  description?: string
  tool?: string
  tools?: readonly string[]
  args?: unknown
  requiredPayloadKeys?: readonly string[]
  dependsOn?: readonly string[]
  critical?: boolean
}

export interface AiScenarioFlowContract {
  description?: string
  steps: readonly AiScenarioFlowStep[]
}

/**
 * 闭合契约。
 * mode=auto 时 runtime 在主流程后自动执行 tools。
 */
export interface AiScenarioCompletionContract {
  description?: string
  mode?: 'auto' | 'manual'
  tools?: readonly string[]
  successSignals?: readonly string[]
  failureSignals?: readonly string[]
}

/** 失败恢复提示。 */
export interface AiScenarioRecoveryHint {
  code?: string
  when: string
  hint: string
  tools?: readonly string[]
}

// ==============================================
// 合同层：工具与意图匹配
// ==============================================

export interface AiScenarioToolCall {
  tool: string
  args?: unknown
}

/** FC/工具执行宿主：声明该工具应由前端还是后端执行。 */
export type AiScenarioToolExecutionHost = 'frontend' | 'backend'

/** FC/工具执行类别：供 Agent、调试台和后端路由分类使用。 */
export type AiScenarioToolExecutionKind = 'query' | 'prompt' | 'tool' | 'system' | 'debug'

/**
 * 工具执行注册信息。
 *
 * 设计目标：
 * - 前端 FC：人机交互、页面 live model、浏览器状态等必须在前端执行的能力。
 * - 后端 FC：查询类、固定 FC、通用 prompt、数据库/服务端能力等未来 Agent 可完全后端执行的能力。
 * - backendRoute 保持可序列化，便于未来场景注册入库后由后端 Agent 调度。
 */
export interface AiScenarioToolExecutionRegistration {
  host: AiScenarioToolExecutionHost
  kind?: AiScenarioToolExecutionKind
  debugHostOverride?: AiScenarioToolExecutionHost
  backendRoute?: string
}

/** 工具注册附加信息：用于 queryToolRegistration 暴露规则与示例。 */
export interface AiScenarioToolRegistration {
  category?: string
  tags?: readonly string[]
  example?: Record<string, unknown>
  rules?: readonly string[]
  failureCodes?: readonly string[]
  fixHints?: readonly string[]
  /** 执行宿主与后端路由元数据；未声明时保持兼容，默认按前端工具处理。 */
  execution?: AiScenarioToolExecutionRegistration
}

/** 可执行工具定义。
 *
 * 注：在某些只用于元数据/文档展示的场景注册中，工具可能只需提供
 * 名称/描述/参数等信息而不包含实际运行时的 `execute` 实现。
 * 因此 `execute` 被声明为可选：注册中心和查询层允许缺失该字段，
 * 但运行时在执行工具前必须检查并在缺失时抛出或返回错误。
 */
export interface AiScenarioTool {
  name: string
  description: string
  parameters?: JsonSchema
  registration?: AiScenarioToolRegistration
  execute?: (args: unknown, ctx: AiScenarioContext) => unknown
}

/** buildSteps 产出的执行步骤。 */
export interface AiScenarioStep {
  id: string
  title: string
  tool: string
  args?: unknown
  critical?: boolean
}

/** matchIntent 的返回结构。 */
export interface AiScenarioIntentMatch {
  matched: boolean
  score: number
  reason?: string
}

// ==============================================
// 合同层：场景定义与运行结果
// ==============================================
// 时序分区：
// 1) register(scenario) 注册该定义。
// 2) resolve(input) 路由到场景。
// 3) run(request) 产出结果与执行记录。

export interface AiScenarioDefinition extends AiScenarioIdentity {
  description?: string
  intents: readonly string[]
  promptPolicy: AiScenarioPromptPolicy
  capabilities?: readonly AiScenarioCapability[]
  payload?: AiScenarioPayloadContract
  flow?: AiScenarioFlowContract
  completion?: AiScenarioCompletionContract
  recovery?: readonly AiScenarioRecoveryHint[]
  tools: readonly AiScenarioTool[]
  buildPayload?: (ctx: AiScenarioContext) => unknown
  buildSteps?: (payload: unknown, ctx: AiScenarioContext) => readonly AiScenarioStep[]
  matchIntent?: (input: string, ctx: AiScenarioContext) => AiScenarioIntentMatch
}

export interface AiScenarioResolution {
  scenario: AiScenarioDefinition
  score: number
  reason?: string
}

/** 运行请求。 */
export interface AiScenarioRunRequest {
  scenarioId?: string
  userInput: string
  context?: Omit<AiScenarioContext, 'userInput'>
  payload?: unknown
  toolCalls?: readonly AiScenarioToolCall[]
  dryRun?: boolean
}

/** 单工具执行记录。 */
export interface AiScenarioToolExecution {
  tool: string
  args: unknown
  ok: boolean
  result?: unknown
  error?: string
}

/** 单次运行结果。 */
export interface AiScenarioRunResult {
  runId: string
  scenario: AiScenarioIdentity
  systemPrompt: string
  payload: unknown
  steps: readonly AiScenarioStep[]
  executions: readonly AiScenarioToolExecution[]
  status: 'planned' | 'completed' | 'failed'
}

/** 单次运行历史记录。 */
export interface AiScenarioRunRecord {
  runId: string
  startedAt: string
  finishedAt: string
  durationMs: number
  request: AiScenarioRunRequest
  result: AiScenarioRunResult
}

/** 历史查询参数。 */
export interface AiScenarioHistoryQuery {
  scenarioId?: string
  status?: AiScenarioRunResult['status']
  offset?: number
  limit?: number
}

/** 历史分页结果。 */
export interface AiScenarioHistoryPage {
  total: number
  offset: number
  limit: number
  hasMore: boolean
  items: readonly AiScenarioRunRecord[]
}
