/**
 * ==============================================
 * 合同层：分级查询协议
 * ==============================================
 * 功能分区：
 * 1) 提供场景发现（意图目录、场景详情）。
 * 2) 提供能力与参数发现（capability、schema、registration）。
 * 3) 提供运行历史发现（history、record）。
 *
 * 时序分区（推荐调用顺序）：
 * 1) queryIntentCatalog
 * 2) queryScenarioInfo
 * 3) queryScenarioTools
 * 4) queryToolSchemaNode / queryToolSchema
 * 5) queryToolRegistration
 * 6) runtime.run
 * 7) queryRunHistory / queryRunRecord
 */

import type { JsonSchema } from './json-schema'
import type {
  AiScenarioCapability,
  AiScenarioCompletionContract,
  AiScenarioFlowContract,
  AiScenarioHistoryPage,
  AiScenarioHistoryQuery,
  AiScenarioPayloadContract,
  AiScenarioRecoveryHint,
  AiScenarioRunRecord,
  AiScenarioToolExecutionRegistration,
  AiScenarioToolFunctionRegistration,
  AiScenarioToolRegistration,
} from './scenario-types'

// ═══════════════════════════════════════════════════════════════════════════
// 查询阶段 1：意图目录
// ═══════════════════════════════════════════════════════════════════════════

/** 意图目录条目：给模型第一眼可发现信息。 */
export interface AiIntentCatalogEntry {
  scenarioId: string
  title: string
  prompt?: string
  intents: readonly string[]
  summary: string
}

/** 意图目录总览。 */
export interface AiIntentCatalog {
  entries: readonly AiIntentCatalogEntry[]
}

// ═══════════════════════════════════════════════════════════════════════════
// 查询阶段 2 & 3：场景信息 + 工具清单
// ═══════════════════════════════════════════════════════════════════════════

export interface AiToolSummary {
  name: string
  description: string
  scenarioId?: string
  category?: string
  tags?: readonly string[]
  execution?: AiScenarioToolExecutionRegistration
  critical?: boolean
}

/** 场景详情（模型确认目标场景后的主信息载体）。 */
export interface AiScenarioInfo {
  scenarioId: string
  title: string
  prompt?: string
  description?: string
  systemPrompt: string
  defaultSteps: Array<{ id: string; title: string; description?: string }>
  tools: readonly AiToolSummary[]
  capabilities: readonly AiScenarioCapability[]
}

// ═══════════════════════════════════════════════════════════════════════════
// 查询阶段 2.5：能力 / Payload / 流程 / 闭合 / 恢复
// ═══════════════════════════════════════════════════════════════════════════

export interface AiScenarioCapabilitiesQuery {
  scenarioId?: string
  keyword?: string
  offset?: number
  limit?: number
}

/** 能力查询分页结果。 */
export interface AiScenarioCapabilitiesPage {
  total: number
  offset: number
  limit: number
  hasMore: boolean
  items: readonly AiScenarioCapability[]
}

/** payload 契约查询结果。 */
export interface AiScenarioPayloadInfo {
  scenarioId: string
  payload: AiScenarioPayloadContract | undefined
}

/** flow 契约查询结果。 */
export interface AiScenarioFlowInfo {
  scenarioId: string
  flow: AiScenarioFlowContract
  source: 'registered' | 'legacy-buildSteps' | 'empty'
}

/** completion 契约查询结果。 */
export interface AiScenarioCompletionInfo {
  scenarioId: string
  completion: AiScenarioCompletionContract | undefined
}

/** recovery 契约查询结果。 */
export interface AiScenarioRecoveryInfo {
  scenarioId: string
  recovery: readonly AiScenarioRecoveryHint[]
}

// ═══════════════════════════════════════════════════════════════════════════
// 查询阶段 4：工具 Schema
// ═══════════════════════════════════════════════════════════════════════════

export interface AiToolSchemaInfo {
  scenarioId?: string
  toolName: string
  description: string
  parameters: JsonSchema | undefined
  examples?: Array<{ description: string; args: unknown }>
}

// ═══════════════════════════════════════════════════════════════════════════
// 查询阶段 5 & 6：工具注册与函数映射
// ═══════════════════════════════════════════════════════════════════════════
// 阶段 5：queryToolRegistration（规则、失败码、修复提示）
// 阶段 6：queryToolFunctions（工具 -> 函数 -> payload）

/** 工具注册详情查询结果（规则、失败码、修复提示）。 */
export interface AiToolRegistrationInfo {
  scenarioId?: string
  toolName: string
  description: string
  parameters: JsonSchema | undefined
  registration: AiScenarioToolRegistration
}

/** 工具函数映射查询结果（工具 -> 函数 -> payload）。 */
export interface AiToolFunctionsInfo {
  /** 命中的场景 ID；跨场景同名工具时用于消歧。 */
  scenarioId?: string
  /** 工具名。 */
  toolName: string
  /** 工具描述（上层可直接展示）。 */
  description: string
  /** 函数映射列表：优先返回显式注册；未注册时由 registry 返回兼容默认映射。 */
  functions: readonly AiScenarioToolFunctionRegistration[]
}

export interface AiScenarioToolsQuery {
  scenarioId?: string
  category?: string
  keyword?: string
  offset?: number
  limit?: number
}

/** 工具目录分页结果。 */
export interface AiScenarioToolsPage {
  total: number
  offset: number
  limit: number
  hasMore: boolean
  items: readonly AiToolSummary[]
}

export interface AiToolSchemaNodeQuery {
  scenarioId?: string
  toolName: string
  pointer?: string
}

/** 节点级 Schema 查询结果。 */
export interface AiToolSchemaNodeInfo {
  scenarioId?: string
  toolName: string
  description: string
  pointer: string
  schema: JsonSchema | JsonSchema['properties'][string] | undefined
  childPointers: readonly string[]
}

// ═══════════════════════════════════════════════════════════════════════════
// 查询协议接口
// ═══════════════════════════════════════════════════════════════════════════

export interface AiScenarioQueryProtocol {
  /**
   * 分级查询协议：为 planner/LLM 提供逐步发现场景、能力、Schema 与运行历史的能力。
   *
   * 使用示例（伪代码）：
   * const catalog = registry.queryIntentCatalog()
   * const info = registry.queryScenarioInfo('leave')
   * const toolsPage = registry.queryScenarioTools({ scenarioId: 'leave', keyword: '申请' })
   * const node = registry.queryToolSchemaNode({ toolName: 'applyLeave', pointer: 'body.reason' })
   *
   * 约定：所有查询在无法找到资源时应返回 undefined 或空分页结果（而非抛出），以便上层按规则处理并向用户/模型明确反馈。
   */
  /** 步骤 1：发现可用场景。 */
  queryIntentCatalog: () => AiIntentCatalog
  /** 步骤 2：读取目标场景详情。 */
  queryScenarioInfo: (scenarioId: string) => AiScenarioInfo | undefined
  /** 步骤 2.5：按能力视角查看场景可做的事。 */
  queryScenarioCapabilities: (query?: AiScenarioCapabilitiesQuery) => AiScenarioCapabilitiesPage
  /** 步骤 2.6：读取 payload 契约。 */
  queryScenarioPayload: (scenarioId: string) => AiScenarioPayloadInfo | undefined
  /** 步骤 2.7：读取流程契约。 */
  queryScenarioFlow: (scenarioId: string) => AiScenarioFlowInfo | undefined
  /** 步骤 2.8：读取闭合契约。 */
  queryScenarioCompletion: (scenarioId: string) => AiScenarioCompletionInfo | undefined
  /** 步骤 2.9：读取恢复建议。 */
  queryScenarioRecovery: (scenarioId: string) => AiScenarioRecoveryInfo | undefined
  /** 步骤 3：分页浏览工具目录。 */
  queryScenarioTools: (query?: AiScenarioToolsQuery) => AiScenarioToolsPage
  /** 步骤 4A：查询完整 Schema。 */
  queryToolSchema: (toolName: string, scenarioId?: string) => AiToolSchemaInfo | undefined
  /** 步骤 4B：节点级查询 Schema。 */
  queryToolSchemaNode: (query: AiToolSchemaNodeQuery) => AiToolSchemaNodeInfo | undefined
  /** 步骤 5：读取工具注册规则。 */
  queryToolRegistration: (toolName: string, scenarioId?: string) => AiToolRegistrationInfo | undefined
  /**
   * 步骤 6：读取工具函数映射。
   *
   * 约定：
   * - 若工具显式声明 registration.functions，则返回该声明。
   * - 若未声明，则返回兼容默认映射（tool.name -> function.name，含 default payload 投影）。
   */
  queryToolFunctions: (toolName: string, scenarioId?: string) => AiToolFunctionsInfo | undefined
  /** 步骤 7：查询运行历史分页。 */
  queryRunHistory: (query?: AiScenarioHistoryQuery) => AiScenarioHistoryPage
  /** 步骤 7：查询单条运行记录。 */
  queryRunRecord: (runId: string) => AiScenarioRunRecord | undefined
}
