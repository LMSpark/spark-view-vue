/**
 * 分级查询协议 —— 避免 LLM 猜测、强制分步确认。
 *
 * 核心原则：
 * 1. 第一步：查意图目录 → queryIntentCatalog()
 * 2. 第二步：确认场景 → queryScenarioInfo(scenarioId)
 * 3. 第三步：查工具目录（分页）→ queryScenarioTools(...)
 * 4. 第四步：查工具参数（可分层）→ queryToolSchemaNode(...)
 * 5. 第五步：才能执行 → run(request)
 *
 * LLM 不允许跳过任何中间步，系统提示词需强制此流程。
 */

import type { JsonSchema } from './json-schema'
import type {
  AiScenarioCapability,
  AiScenarioCompletionContract,
  AiScenarioFlowContract,
  AiScenarioPayloadContract,
  AiScenarioRecoveryHint,
  AiScenarioToolRegistration,
} from './scenario-types'

// ═══════════════════════════════════════════════════════════════════════════
// 查询阶段 1：意图目录
// ═══════════════════════════════════════════════════════════════════════════

export interface AiIntentCatalogEntry {
  scenarioId: string
  title: string
  scope: string
  intents: readonly string[]
  summary: string
}

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
  critical?: boolean
}

export interface AiScenarioInfo {
  scenarioId: string
  title: string
  scope: string
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

export interface AiScenarioCapabilitiesPage {
  total: number
  offset: number
  limit: number
  hasMore: boolean
  items: readonly AiScenarioCapability[]
}

export interface AiScenarioPayloadInfo {
  scenarioId: string
  payload: AiScenarioPayloadContract | undefined
}

export interface AiScenarioFlowInfo {
  scenarioId: string
  flow: AiScenarioFlowContract
  source: 'registered' | 'legacy-buildSteps' | 'empty'
}

export interface AiScenarioCompletionInfo {
  scenarioId: string
  completion: AiScenarioCompletionContract | undefined
}

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

export interface AiToolRegistrationInfo {
  scenarioId?: string
  toolName: string
  description: string
  parameters: JsonSchema | undefined
  registration: AiScenarioToolRegistration
}

export interface AiScenarioToolsQuery {
  scenarioId?: string
  keyword?: string
  offset?: number
  limit?: number
}

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
  queryIntentCatalog: () => AiIntentCatalog
  queryScenarioInfo: (scenarioId: string) => AiScenarioInfo | undefined
  queryScenarioCapabilities: (query?: AiScenarioCapabilitiesQuery) => AiScenarioCapabilitiesPage
  queryScenarioPayload: (scenarioId: string) => AiScenarioPayloadInfo | undefined
  queryScenarioFlow: (scenarioId: string) => AiScenarioFlowInfo | undefined
  queryScenarioCompletion: (scenarioId: string) => AiScenarioCompletionInfo | undefined
  queryScenarioRecovery: (scenarioId: string) => AiScenarioRecoveryInfo | undefined
  queryScenarioTools: (query?: AiScenarioToolsQuery) => AiScenarioToolsPage
  queryToolSchema: (toolName: string, scenarioId?: string) => AiToolSchemaInfo | undefined
  queryToolSchemaNode: (query: AiToolSchemaNodeQuery) => AiToolSchemaNodeInfo | undefined
  queryToolRegistration: (toolName: string, scenarioId?: string) => AiToolRegistrationInfo | undefined
}
