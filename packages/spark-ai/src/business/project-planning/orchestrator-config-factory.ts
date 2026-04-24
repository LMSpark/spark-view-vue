/**
 * Orchestrator Config Factory — 场景级编排配置生成器
 */

import type {
  OrchestratorConfig,
  SessionBackend,
  ToolDefinition,
  DialogueTurn,
} from '../../core/session/session-contracts'
import {
  createMonitorsForScenario,
  type OrchestrationMonitorFactoryOptions,
} from './orchestration-monitor-factory'
import type { RepeatDetectionConfig } from './repeat-detection-monitor'
import {
  createDefaultFollowUpPolicy,
  createBusinessFollowUpPolicy,
} from './business-follow-up-policy'
import type { ProjectPlanningBusinessContext } from './business-context'
import {
  DEFAULT_ORCHESTRATION_SCENARIO,
  SCENARIO_DEBUG,
  SCENARIO_ITERATE,
  type OrchestrationScenario,
} from './orchestration-scenarios'

export interface OrchestratorConfigFactoryOptions {
  scenario?: OrchestrationScenario
  maxRounds?: number
  slidingWindow?: number
  systemPrompt: string
  backend: SessionBackend
  userPrompt?: string
  resumeSessionId?: string
  tools?: ToolDefinition[]
  signal?: AbortSignal
  onSseEvent?: (event: { sessionId: string; type: string; data: string }) => void
  onRoundStart?: (round: number) => void
  onTurnComplete?: (turn: DialogueTurn) => void
  onRoundComplete?: (turn: DialogueTurn) => void
  businessContext?: ProjectPlanningBusinessContext
  useBusinessFollowUpPolicy?: boolean
  repeatDetection?: RepeatDetectionConfig
}

export function createOrchestratorConfig(
  options: OrchestratorConfigFactoryOptions
): OrchestratorConfig {
  const {
    scenario = DEFAULT_ORCHESTRATION_SCENARIO,
    maxRounds = 20,
    slidingWindow = 10,
    systemPrompt,
    backend,
    userPrompt,
    resumeSessionId,
    tools,
    signal,
    onSseEvent,
    onRoundStart,
    onTurnComplete,
    onRoundComplete,
    businessContext,
    useBusinessFollowUpPolicy = true,
    repeatDetection,
  } = options

  void backend
  void userPrompt

  const monitorOptions: OrchestrationMonitorFactoryOptions | undefined = repeatDetection === undefined
    ? undefined
    : { repeatDetection }
  const monitors = createMonitorsForScenario(scenario, monitorOptions)

  const followUpPolicy = useBusinessFollowUpPolicy
    ? createBusinessFollowUpPolicy(businessContext)
    : createDefaultFollowUpPolicy()

  const config: OrchestratorConfig = {
    maxRounds,
    slidingWindow,
    systemPrompt,
    ...(resumeSessionId !== undefined ? { resumeSessionId } : {}),
    ...(tools !== undefined ? { tools } : {}),
    ...(signal !== undefined ? { signal } : {}),
    ...(onSseEvent !== undefined ? { onSseEvent } : {}),
    ...(onRoundStart !== undefined ? { onRoundStart } : {}),
    ...(onTurnComplete !== undefined ? { onTurnComplete } : {}),
    ...(onRoundComplete !== undefined ? { onRoundComplete } : {}),
    monitors,
    followUpPolicy,
  }

  return config
}

export function createGenerateConfig(
  systemPrompt: string,
  backend: SessionBackend,
  options?: Partial<OrchestratorConfigFactoryOptions>
): OrchestratorConfig {
  return createOrchestratorConfig({
    scenario: DEFAULT_ORCHESTRATION_SCENARIO,
    systemPrompt,
    backend,
    ...options,
  })
}

export function createIterateConfig(
  systemPrompt: string,
  backend: SessionBackend,
  options?: Partial<OrchestratorConfigFactoryOptions>
): OrchestratorConfig {
  return createOrchestratorConfig({
    scenario: SCENARIO_ITERATE,
    systemPrompt,
    backend,
    ...options,
  })
}

export function createDebugConfig(
  systemPrompt: string,
  backend: SessionBackend,
  options?: Partial<OrchestratorConfigFactoryOptions>
): OrchestratorConfig {
  return createOrchestratorConfig({
    scenario: SCENARIO_DEBUG,
    systemPrompt,
    backend,
    ...options,
  })
}
