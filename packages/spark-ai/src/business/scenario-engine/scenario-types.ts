import type { JsonSchema } from '../../core/session/session-contracts'

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：基础枚举与策略类型
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 场景作用域。
 * - planning：项目 -> 模块 -> 页面 的策划域
 * - design：单页面四文件（rule/pagedata/script/style）设计域
 * - business：具体业务执行域（请假/报销/采购等）
 */
export type AiScenarioScope = 'planning' | 'design' | 'business'

/**
 * 协作确认策略（与现有 AI 面板策略保持语义一致）。
 */
export type AiConfirmPolicy = 'auto' | 'critical-confirm' | 'plan-confirm' | 'step-confirm' | 'human-takeover'

/**
 * 恢复策略（失败重试与中断节奏）。
 */
export type AiRecoveryPolicy = 'layered' | 'manual' | 'strict'

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：静态描述模型（Identity / Policy / Context）
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 场景最小身份信息。
 */
export interface AiScenarioIdentity {
  id: string
  title: string
  scope: AiScenarioScope
}

/**
 * 场景提示词策略。
 * systemPrompt 支持字符串或惰性函数，便于按上下文动态注入。
 */
export interface AiScenarioPromptPolicy {
  systemPrompt: string | ((ctx: AiScenarioContext) => string)
  confirmPolicy?: AiConfirmPolicy
  recoveryPolicy?: AiRecoveryPolicy
}

/**
 * 运行上下文。
 * 该对象不绑定 UI，不依赖 Vue，可被 E2E/脚本/服务端调用复用。
 */
export interface AiScenarioContext {
  userInput: string
  pageId?: string
  projectId?: string
  moduleId?: string
  route?: string
  user?: {
    id?: string
    name?: string
    role?: string
  }
  metadata?: Record<string, unknown>
}

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：业务注册合同（能力 / 载荷 / 流程 / 闭合 / 恢复）
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 场景能力类型。
 * 能力是面向 AI 的业务目录，不等同于具体工具；一个能力可由多个工具共同完成。
 */
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

/**
 * 业务载荷字段注册。
 * 用于声明 AI 执行业务前需要哪些参数、缺失时如何追问、可由哪些来源补齐。
 */
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

export interface AiScenarioPayloadContract {
  description?: string
  schema?: JsonSchema
  slots?: readonly AiScenarioPayloadSlot[]
  required?: readonly string[]
  examples?: ReadonlyArray<Record<string, unknown>>
}

export type AiScenarioFlowStepKind = 'query' | 'tool' | 'decision' | 'confirm' | 'completion'

/**
 * 注册态流程步骤。
 * 这是可查询的业务流程说明，不要求每一步都能被默认 runtime 自动执行。
 */
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
 * 闭合检查注册。
 * 引擎不硬编码完成判断，只注册可查询的完成信号和校验工具。
 */
export interface AiScenarioCompletionContract {
  description?: string
  tools?: readonly string[]
  successSignals?: readonly string[]
  failureSignals?: readonly string[]
}

export interface AiScenarioRecoveryHint {
  code?: string
  when: string
  hint: string
  tools?: readonly string[]
}

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：工具与步骤协议
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 外部传入的工具调用记录（通常来自 LLM 的 tool_call 或编排步骤）。
 */
export interface AiScenarioToolCall {
  tool: string
  args?: unknown
}

/**
 * 工具注册信息（参照旧 still 结构）。
 * 用于把“函数如何被正确调用”显式暴露给 LLM：
 * - example：最小可执行样例
 * - rules：调用约束与先后顺序
 * - failureCodes：常见失败码（fail-fast）
 * - fixHints：失败后的修复建议
 */
export interface AiScenarioToolRegistration {
  category?: string
  tags?: readonly string[]
  example?: Record<string, unknown>
  rules?: readonly string[]
  failureCodes?: readonly string[]
  fixHints?: readonly string[]
}

/**
 * 场景工具定义。
 * execute 只约束输入输出，不约束具体实现形态（本地函数/远端 API 均可）。
 */
export interface AiScenarioTool {
  name: string
  description: string
  parameters?: JsonSchema
  registration?: AiScenarioToolRegistration
  execute: (args: unknown, ctx: AiScenarioContext) => unknown
}

/**
 * 场景步骤定义（用于执行计划展示与默认执行序列）。
 */
export interface AiScenarioStep {
  id: string
  title: string
  tool: string
  args?: unknown
  critical?: boolean
}

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：意图匹配与场景定义
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 意图匹配结果。
 * score 越高表示越匹配；reason 用于调试解释匹配路径。
 */
export interface AiScenarioIntentMatch {
  matched: boolean
  score: number
  reason?: string
}

/**
 * 场景定义主协议。
 *
 * 流程分区：
 * 1) 通过 intents/matchIntent 进行意图路由
 * 2) 通过 buildPayload 生成业务输入载荷
 * 3) 通过 buildSteps 生成默认执行序列
 * 4) 通过 tools 真正执行动作
 */
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

/**
 * 场景解析结果（resolve 后的命中信息）。
 */
export interface AiScenarioResolution {
  scenario: AiScenarioDefinition
  score: number
  reason?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// 时序分区：运行期请求与结果模型
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 运行请求。
 *
 * 时序说明：
 * - 若提供 scenarioId：直接进入指定场景
 * - 否则：基于 userInput 自动 resolve 场景
 * - 若提供 toolCalls：按外部指定调用执行
 * - 否则：按 buildSteps 生成默认调用序列
 * - dryRun=true：只返回计划，不执行工具
 */
export interface AiScenarioRunRequest {
  scenarioId?: string
  userInput: string
  context?: Omit<AiScenarioContext, 'userInput'>
  payload?: unknown
  toolCalls?: readonly AiScenarioToolCall[]
  dryRun?: boolean
}

/**
 * 单次工具执行记录。
 */
export interface AiScenarioToolExecution {
  tool: string
  args: unknown
  ok: boolean
  result?: unknown
  error?: string
}

/**
 * 场景运行结果。
 * status:
 * - planned：仅完成规划（dry-run 或无调用）
 * - completed：全部执行成功
 * - failed：执行过程中任一步失败
 */
export interface AiScenarioRunResult {
  scenario: AiScenarioIdentity
  systemPrompt: string
  payload: unknown
  steps: readonly AiScenarioStep[]
  executions: readonly AiScenarioToolExecution[]
  status: 'planned' | 'completed' | 'failed'
}
