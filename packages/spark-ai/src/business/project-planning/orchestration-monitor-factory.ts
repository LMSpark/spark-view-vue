/**
 * Monitor 场景工厂 — 按编排场景组装监控器集合
 */

import { createBlueprintOrchestrationMonitor } from './blueprint-orchestration-monitor'
import { createTerminalActionsMonitor } from './terminal-actions-monitor'
import { createExportCompletionMonitor } from './export-completion-monitor'
import {
  createRepeatDetectionMonitor,
  type RepeatDetectionConfig,
} from '../../core/session/repeat-detection-monitor'
import type { SessionMonitor } from '../../core/session/session-contracts'
import {
  DEFAULT_ORCHESTRATION_SCENARIO,
  SCENARIO_DEBUG,
  SCENARIO_GENERATE,
  SCENARIO_ITERATE,
  type OrchestrationScenario,
} from './orchestration-scenarios'

export interface OrchestrationMonitorFactoryOptions {
  repeatDetection?: RepeatDetectionConfig
}

export function createMonitorsForScenario(
  scenario: OrchestrationScenario,
  options?: OrchestrationMonitorFactoryOptions,
): SessionMonitor[] {
  const repeatDetection = createRepeatDetectionMonitor(options?.repeatDetection)

  switch (scenario) {
    case SCENARIO_GENERATE:
      return [
        repeatDetection,
        createBlueprintOrchestrationMonitor(),
        createExportCompletionMonitor(),
      ]

    case SCENARIO_ITERATE:
      return [
        repeatDetection,
        createTerminalActionsMonitor(),
        createBlueprintOrchestrationMonitor(),
      ]

    case SCENARIO_DEBUG:
      return [
        repeatDetection,
        createBlueprintOrchestrationMonitor(),
        createTerminalActionsMonitor(),
        createExportCompletionMonitor(),
      ]

    default:
      const _exhaustive: never = scenario
      return _exhaustive
  }
}

export function createDefaultMonitors(): SessionMonitor[] {
  return createMonitorsForScenario(DEFAULT_ORCHESTRATION_SCENARIO)
}
