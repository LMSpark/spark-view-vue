// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：注册中心与运行时
// ═══════════════════════════════════════════════════════════════════════════

export {
  createScenarioRegistry,
  type AiScenarioRegistry,
} from './scenario-registry'

export {
  createScenarioRuntime,
  type AiScenarioRuntime,
} from './scenario-runtime'

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：分级查询协议
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：统一协议类型导出
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：内置场景工厂（规划 / 设计）
// ═══════════════════════════════════════════════════════════════════════════

export {
  createPlanningScenario,
  type CreatePlanningScenarioOptions,
  type ProjectPlanningToolset,
} from './builtins/planning-scenario'

export {
  PAGE_DESIGN_SCENARIO_ID,
  createPageDesignScenario,
  registerPageDesignScenario,
  isPageDesignScenarioWriteTool,
  type CreatePageDesignScenarioOptions,
  type PageDesignScenarioStillEvent,
} from './builtins/page-design-scenario'

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：业务提示词注册中心（AI 工厂）
// ═══════════════════════════════════════════════════════════════════════════

export {
  createBusinessPromptRegistry,
  createBusinessScenarioPromptRegistry,
  resolveBusinessSystemPrompt,
  type AiBusinessPromptDefinition,
  type AiBusinessPromptResolved,
  type AiBusinessPromptRegistry,
  type BusinessScenarioPromptRegistration,
  type BusinessScenarioPromptRegistry,
} from './business-prompt-registry'

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：AI 提示词工厂（顶层总装配）
// ═══════════════════════════════════════════════════════════════════════════

export {
  createAiPromptFactory,
  type AiPromptFactory,
} from './ai-prompt-factory'

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：场景提示词模板注册中心
// ═══════════════════════════════════════════════════════════════════════════

export {
  createScenarioPromptTemplateRegistry,
  DEFAULT_SCENARIO_PROMPT_TEMPLATES,
  PLANNING_SCENARIO_SYSTEM_PROMPT,
  PAGE_DESIGN_SCENARIO_SYSTEM_PROMPT,
  buildBusinessScenarioSystemPrompt,
  type ScenarioPromptBuildContext,
  type ScenarioPromptTemplateRegistration,
  type ScenarioPromptTemplateRegistry,
} from './scenario-prompt-template-registry'

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：提示词约束基础层
// ═══════════════════════════════════════════════════════════════════════════

export {
  TIERED_QUERY_CONSTRAINT,
  buildScenarioSystemPrompt,
} from './prompt-constraints'
