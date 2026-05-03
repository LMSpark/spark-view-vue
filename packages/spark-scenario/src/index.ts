/**
 * @spark-view/spark-scenario
 *
 * SPARK 注册制 AI 场景引擎（纯 TypeScript，无框架依赖）。
 *
 * 核心能力：
 * - 场景注册中心（createScenarioRegistry）
 * - 场景运行时（createScenarioRuntime）
 * - 分级查询协议（AiScenarioQueryProtocol）
 * - 类型定义（AiScenarioDefinition 等）
 *
 * 分区导出顺序：
 * 1) contracts（纯类型契约）
 * 2) runtime（注册与执行）
 * 3) system（系统装配）
 * 4) prompt（提示词模板）
 * 5) history（历史存储）
 */

// ==============================================
// contracts
// ==============================================
export type { JsonSchema, JsonSchemaProperty } from './contracts/json-schema'

export type {
  AiScenarioScope,
  AiConfirmPolicy,
  AiRecoveryPolicy,
  AiScenarioIdentity,
  AiScenarioPromptPolicy,
  AiScenarioContext,
  AiScenarioCapabilityKind,
  AiScenarioCapability,
  AiScenarioPayloadSlotSource,
  AiScenarioPayloadSlot,
  AiScenarioPayloadContract,
  AiScenarioFlowStepKind,
  AiScenarioFlowStep,
  AiScenarioFlowContract,
  AiScenarioCompletionContract,
  AiScenarioRecoveryHint,
  AiScenarioToolCall,
  AiScenarioToolRegistration,
  AiScenarioTool,
  AiScenarioStep,
  AiScenarioIntentMatch,
  AiScenarioDefinition,
  AiScenarioResolution,
  AiScenarioRunRequest,
  AiScenarioToolExecution,
  AiScenarioRunResult,
  AiScenarioRunRecord,
  AiScenarioHistoryQuery,
  AiScenarioHistoryPage,
} from './contracts/scenario-types'

export type {
  AiIntentCatalogEntry,
  AiIntentCatalog,
  AiToolSummary,
  AiScenarioInfo,
  AiScenarioCapabilitiesQuery,
  AiScenarioCapabilitiesPage,
  AiScenarioPayloadInfo,
  AiScenarioFlowInfo,
  AiScenarioCompletionInfo,
  AiScenarioRecoveryInfo,
  AiToolSchemaInfo,
  AiToolRegistrationInfo,
  AiScenarioToolsQuery,
  AiScenarioToolsPage,
  AiToolSchemaNodeQuery,
  AiToolSchemaNodeInfo,
  AiScenarioQueryProtocol,
} from './contracts/query-protocol'

export type {
  AiBrowserLlmRole,
  AiBrowserLlmMessage,
  AiBrowserLlmGenerateRequest,
  AiBrowserLlmGenerateResponse,
  AiBrowserLlmClient,
  AiScenarioPlanningRequest,
  AiScenarioPlan,
  AiScenarioBrowserPlanner,
} from './contracts/llm-contracts'

// ==============================================
// runtime
// ==============================================
export {
  createScenarioRegistry,
  type AiScenarioRegistry,
  type AiScenarioRegistryOptions,
} from './runtime/scenario-registry'

export {
  createScenarioRuntime,
  type AiScenarioRuntime,
  type AiScenarioRuntimeOptions,
} from './runtime/scenario-runtime'

// ==============================================
// system
// ==============================================
export {
  createScenarioSystem,
  registerScenarios,
  type ScenarioSystem,
  type ScenarioSystemOptions,
} from './system/scenario-system'

// ==============================================
// prompt
// ==============================================
export {
  createScenarioPromptTemplateRegistry,
  type ScenarioPromptBuildContext,
  type ScenarioPromptTemplateRegistration,
  type ScenarioPromptTemplateRegistry,
} from './prompt/scenario-prompt-template-registry'

// ==============================================
// history
// ==============================================
export {
  createScenarioRunHistoryStore,
  type AiScenarioRunHistoryStore,
} from './history/run-history-store'

// ==============================================
// llm（browser）
// ==============================================
export {
  createBrowserFetchLlmClient,
  type BrowserFetchLlmClientOptions,
} from './llm/browser-fetch-llm-client'

export {
  createBrowserScenarioPlanner,
  type BrowserScenarioPlannerOptions,
} from './llm/browser-scenario-planner'

export {
  createBrowserLocalLlmClient,
  type BrowserLocalLlmClientOptions,
} from './llm/browser-local-llm-client'

// ==============================================
// prompt 基础约束
// ==============================================
export { TIERED_QUERY_CONSTRAINT, buildScenarioSystemPrompt } from './prompt/prompt-constraints'
