/**
 * 项目策划业务域（Project Planning Domain）
 *
 * 用于承载“从软件项目级到页面级”的策划编排能力：
 * - 项目级：范围、阶段、里程碑、跨页面约束
 * - 页面级：单页面目标拆解、生成提示词、生成后校验与执行路径规划
 *
 * 该域负责策略与编排，不直接承载页面 4 文件的具体编辑实现。
 */

export const PROJECT_PLANNING_DOMAIN = 'project-planning'

export type { ProjectPlanningBusinessContext } from './business-context'

export {
  createNavRegister,
  type NavRegister,
  type NavRegistrationOptions,
  type NavRegistrationResult,
} from './nav-register'

export {
  NAV_PLANNER_SYSTEM_PROMPT,
} from './nav-planner-prompt'

export {
  PAGE_SYSTEM_PROMPT,
} from './prompts/page-system-prompt'

export {
  buildPageSystemPrompt,
  getSystemPrompt,
  registerPromptMode,
  detectRelevantSkillTypes,
} from './prompts/prompt-builder'

export type {
  PromptBuildContext,
  ISkillMetadataProvider,
  BuildPagePromptOptions,
  PromptMode,
} from './prompts/prompt-builder'

export {
  validateGeneratedConfig,
} from './validation/config-validator'

export type {
  GeneratedPageFiles,
  ConfigValidationCategory,
  ConfigValidationSeverity,
  ConfigValidationIssue,
  ConfigValidationSummary,
  ConfigValidationReport,
} from './validation/config-validator'

export {
  blueprintDomain,
  getBlueprintState,
  blueprintCreate,
  blueprintDescribe,
  blueprintAdvance,
  blueprintItemAdvance,
  blueprintRevise,
  blueprintValidateCoverage,
  blueprintSelfCheck,
  requireBlueprint,
  readSessionBlueprint,
  writeSessionBlueprint,
} from './stills'

export type {
  BlueprintDomainState,
  BlueprintPhase,
  BlueprintExecutionMode,
  BlueprintPlanItem,
  BlueprintCheckpoint,
  ExecutionBlueprint,
} from './stills'

export {
  ORCHESTRATION_SCENARIOS,
  DEFAULT_ORCHESTRATION_SCENARIO,
  SCENARIO_GENERATE,
  SCENARIO_ITERATE,
  SCENARIO_DEBUG,
  type OrchestrationScenario,
} from './orchestration-scenarios'

export {
  createRepeatDetectionMonitor,
  type RepeatDetectionConfig,
} from '../../core/session/repeat-detection-monitor'

export {
  createBlueprintOrchestrationMonitor,
} from './blueprint-orchestration-monitor'

export {
  createTerminalActionsMonitor,
} from './terminal-actions-monitor'

export {
  createExportCompletionMonitor,
} from './export-completion-monitor'

export {
  createMonitorsForScenario,
  createDefaultMonitors,
  type OrchestrationMonitorFactoryOptions,
} from './orchestration-monitor-factory'

export {
  createBusinessFollowUpPolicy,
} from './business-follow-up-policy'

export {
  createOrchestratorConfig,
  createGenerateConfig,
  createIterateConfig,
  createDebugConfig,
  type OrchestratorConfigFactoryOptions,
} from './orchestrator-config-factory'

export {
  createSessionBackend,
  startAiOrchestration,
  startGenerateSession,
  startIterateSession,
  startDebugSession,
  type BootstrapOptions,
} from './ai-orchestration-bootstrap'

export {
  BUSINESS_LIFECYCLE_CONFIG_TREE,
  BUSINESS_SESSION_LIFECYCLE_STAGES,
  listBusinessLifecycleConfigPaths,
  type BusinessLifecycleOwner,
  type BusinessLifecycleConfigPath,
} from './lifecycle-config-paths'

