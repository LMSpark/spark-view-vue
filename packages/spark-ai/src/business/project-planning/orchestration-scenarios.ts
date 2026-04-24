/**
 * 项目策划编排场景常量（单一事实来源）。
 */
export const SCENARIO_GENERATE = 'generate'
export const SCENARIO_ITERATE = 'iterate'
export const SCENARIO_DEBUG = 'debug'

export const ORCHESTRATION_SCENARIOS = [SCENARIO_GENERATE, SCENARIO_ITERATE, SCENARIO_DEBUG] as const

export type OrchestrationScenario = (typeof ORCHESTRATION_SCENARIOS)[number]

export const DEFAULT_ORCHESTRATION_SCENARIO: OrchestrationScenario = SCENARIO_GENERATE
