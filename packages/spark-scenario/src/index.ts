/**
 * @spark-view/spark-scenario
 *
 * SPARK 注册制 AI 场景引擎（纯 TypeScript，无框架依赖）。
 *
 * 说明（按时序/流程导出）：
 * 1) contracts：公共类型与协议（定义所有契约，最低依赖）
 * 2) prompt：提示词模板与分级约束（供 LLM 使用的系统提示）
 * 3) runtime：注册中心与运行时（场景发现 -> 执行）
 * 4) system：系统装配与便捷注册（组装 runtime/planner/history）
 * 5) llm：浏览器端 LLM 客户端与规划器（可切换本地/远程）
 * 6) history：运行历史存储与查询
 *
 * 目标：按执行时序与功能将导出组织为便于阅读与集成的顺序，
 * 并在每一层提供清晰注释与示例引用。
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
  AiScenarioToolExecutionHost,
  AiScenarioToolExecutionKind,
  AiScenarioToolExecutionRegistration,
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

export type {
  AiScenarioAgentSessionContext,
  AiScenarioSseEventType,
  AiScenarioSseEventEnvelope,
  AiScenarioFunctionDefinition,
  AiScenarioFunctionCall,
  AiScenarioFunctionCallStatus,
  AiScenarioFunctionCallResult,
} from './contracts/function-call-contracts'

// ==============================================
// prompt（提示词模板与分级约束） — 在 LLM 使用前可先定义模板
// ==============================================
export {
  createScenarioPromptTemplateRegistry,
  type ScenarioPromptBuildContext,
  type ScenarioPromptTemplateRegistration,
  type ScenarioPromptTemplateRegistry,
} from './prompt/scenario-prompt-template-registry'

// ==============================================
// runtime（注册中心与执行引擎） — 场景发现、查询、执行
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

export {
  createScenarioFunctionCallBridge,
  type AiScenarioFunctionNameMapperInput,
  type AiScenarioFunctionNameMapper,
  type AiScenarioFunctionCallBridgeOptions,
  type AiScenarioFunctionResolution,
  type AiScenarioFunctionCallBridge,
} from './runtime/scenario-function-call-bridge'

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

export {
  createScenarioSseLlmClient,
  type ScenarioSseFetch,
  type ScenarioSseSessionResolver,
  type ScenarioSseStreamUrlBuilder,
  type ScenarioSseRequestBodyBuilder,
  type ScenarioSseLlmClientOptions,
} from './llm/scenario-sse-llm-client'

// ==============================================
// history
// ==============================================
export {
  createScenarioRunHistoryStore,
  type AiScenarioRunHistoryStore,
} from './history/run-history-store'

// ==============================================
// prompt 基础约束（作为 prompt 层的一部分）
// ==============================================
export { TIERED_QUERY_CONSTRAINT, buildScenarioSystemPrompt } from './prompt/prompt-constraints'
