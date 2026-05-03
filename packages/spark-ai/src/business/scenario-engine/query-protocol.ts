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

import type { JsonSchema } from '../../core/session/session-contracts'
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

/**
 * 意图目录条目。
 * 用于 LLM 第一步了解可用场景。
 */
export interface AiIntentCatalogEntry {
  /** 场景 ID */
  scenarioId: string
  /** 场景标题 */
  title: string
  /** 场景作用域（planning / design / business） */
  scope: string
  /** 触发意图关键词列表 */
  intents: readonly string[]
  /** 一句话简述场景职责 */
  summary: string
}

/**
 * 意图目录（所有可用场景的第一层信息）。
 */
export interface AiIntentCatalog {
  entries: readonly AiIntentCatalogEntry[]
}

// ═══════════════════════════════════════════════════════════════════════════
// 查询阶段 2 & 3：场景信息 + 工具清单
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 场景工具摘要（不包含完整 Schema，只做列表展示）。
 */
export interface AiToolSummary {
  /** 工具名 */
  name: string
  /** 工具描述 */
  description: string
  /** 所属场景 ID */
  scenarioId?: string
  /** 是否为关键/必需工具 */
  critical?: boolean
}

/**
 * 场景信息（第二层查询结果）。
 */
export interface AiScenarioInfo {
  scenarioId: string
  title: string
  scope: string
  description?: string
  /** 该场景的系统提示词（让 LLM 理解场景约束） */
  systemPrompt: string
  /** 默认执行步骤摘要（让 LLM 了解流程） */
  defaultSteps: Array<{ id: string; title: string; description?: string }>
  /** 工具清单摘要（不含 Schema） */
  tools: readonly AiToolSummary[]
  /** 能力摘要（不含详细参数） */
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
// 查询阶段 4：工具 Schema（参数规范）
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 工具参数 Schema（完整规范，供 LLM 精准拼装参数）。
 */
export interface AiToolSchemaInfo {
  scenarioId?: string
  toolName: string
  description: string
  parameters: JsonSchema | undefined
  /** 示例参数（帮助 LLM 理解） */
  examples?: Array<{ description: string; args: unknown }>
}

/**
 * 函数注册详情（参照旧结构：description + paramsSchema + example + 规则）。
 */
export interface AiToolRegistrationInfo {
  scenarioId?: string
  toolName: string
  description: string
  parameters: JsonSchema | undefined
  registration: AiScenarioToolRegistration
}

/**
 * 工具目录分页查询参数（catalog.query 风格）。
 */
export interface AiScenarioToolsQuery {
  /** 可选：仅查询指定场景下的工具 */
  scenarioId?: string
  /** 可选：关键词匹配工具名/描述 */
  keyword?: string
  /** 偏移量，默认 0 */
  offset?: number
  /** 每页大小，默认 20，最大 100 */
  limit?: number
}

/**
 * 工具目录分页结果。
 */
export interface AiScenarioToolsPage {
  total: number
  offset: number
  limit: number
  hasMore: boolean
  items: readonly AiToolSummary[]
}

/**
 * 工具参数节点查询参数（catalog.guide 风格，支持按路径精查）。
 */
export interface AiToolSchemaNodeQuery {
  /** 可选：限定场景，避免跨场景同名工具误命中 */
  scenarioId?: string
  /** 工具名 */
  toolName: string
  /** 参数路径（JSON Pointer 语义），根节点用 '/' 或空 */
  pointer?: string
}

/**
 * 工具参数节点查询结果。
 */
export interface AiToolSchemaNodeInfo {
  scenarioId?: string
  toolName: string
  description: string
  /** 实际命中的路径 */
  pointer: string
  /** 当前节点的 Schema 片段 */
  schema: JsonSchema | JsonSchema['properties'][string] | undefined
  /** 可继续下钻的子路径列表 */
  childPointers: readonly string[]
}

// ═══════════════════════════════════════════════════════════════════════════
// 查询协议接口
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 分级查询协议。
 * 强制 LLM 按步骤查询，避免猜测与假设。
 */
export interface AiScenarioQueryProtocol {
  /**
   * 查询 1：获取意图目录。
   * LLM 第一步必须调用此方法，了解所有可用场景。
   */
  queryIntentCatalog: () => AiIntentCatalog

  /**
   * 查询 2：获取场景信息（含工具摘要 + 默认步骤）。
   * LLM 确认目标场景后调用，获得该场景的完整配置。
   */
  queryScenarioInfo: (scenarioId: string) => AiScenarioInfo | undefined

  /**
   * 查询 2.5：获取场景能力目录。
   * 能力是业务层可做什么的目录，工具是如何做的函数入口。
   */
  queryScenarioCapabilities: (query?: AiScenarioCapabilitiesQuery) => AiScenarioCapabilitiesPage

  /**
   * 查询 2.6：获取场景业务载荷契约。
   * 用于确定需要向用户追问什么、可从上下文或工具补齐什么。
   */
  queryScenarioPayload: (scenarioId: string) => AiScenarioPayloadInfo | undefined

  /**
   * 查询 2.7：获取注册态执行流程。
   * 该流程用于理解业务顺序，不要求 runtime 盲目自动执行每个步骤。
   */
  queryScenarioFlow: (scenarioId: string) => AiScenarioFlowInfo | undefined

  /**
   * 查询 2.8：获取闭合检查注册。
   */
  queryScenarioCompletion: (scenarioId: string) => AiScenarioCompletionInfo | undefined

  /**
   * 查询 2.9：获取恢复提示注册。
   */
  queryScenarioRecovery: (scenarioId: string) => AiScenarioRecoveryInfo | undefined

  /**
   * 查询 3：获取工具目录（分页）。
   * 用于大规模工具集（例如大量 Vue 组件能力）的按需查询，避免一次性注入。
   */
  queryScenarioTools: (query?: AiScenarioToolsQuery) => AiScenarioToolsPage

  /**
   * 查询 4：获取单个工具的完整参数 Schema（兼容接口）。
   * 仅建议在 Schema 较小时使用；复杂参数请优先使用 queryToolSchemaNode。
   */
  queryToolSchema: (toolName: string, scenarioId?: string) => AiToolSchemaInfo | undefined

  /**
   * 查询 4（推荐）：按节点下钻查询工具参数 Schema。
   * LLM 需要调用某工具前，必须先查相关节点确认参数规范。
   */
  queryToolSchemaNode: (query: AiToolSchemaNodeQuery) => AiToolSchemaNodeInfo | undefined

  /**
   * 查询 5：获取函数注册详情（旧结构对齐）。
   * 用于精确读取 example/rules/failureCodes/fixHints，避免猜测调用方式。
   */
  queryToolRegistration: (toolName: string, scenarioId?: string) => AiToolRegistrationInfo | undefined
}
