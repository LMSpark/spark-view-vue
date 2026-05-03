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
 */

export type { JsonSchema, JsonSchemaProperty } from './json-schema'

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
} from './scenario-types'

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
} from './query-protocol'

export { createScenarioRegistry, type AiScenarioRegistry } from './scenario-registry'

export { createScenarioRuntime, type AiScenarioRuntime } from './scenario-runtime'

export { TIERED_QUERY_CONSTRAINT, buildScenarioSystemPrompt } from './prompt-constraints'
