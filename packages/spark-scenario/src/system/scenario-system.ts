import { createScenarioRuntime, type AiScenarioRuntime } from '../runtime/scenario-runtime'
import type { AiScenarioDefinition } from '../contracts/scenario-types'

/**
 * ==============================================
 * 系统层：场景系统装配入口
 * ==============================================
 * 功能分区：
 * 1) 创建 runtime。
 * 2) 批量注册场景。
 *
 * 时序分区：
 * 1) 应用启动调用 createScenarioSystem。
 * 2) 运行中可用 registerScenarios 热插拔场景。
 */

export interface ScenarioSystemOptions {
  /** 启动时注入的初始场景列表。 */
  scenarios?: readonly AiScenarioDefinition[]
}

export interface ScenarioSystem {
  /** 场景运行时。 */
  runtime: AiScenarioRuntime
}

export function createScenarioSystem(options?: ScenarioSystemOptions): ScenarioSystem {
  // 时序：系统初始化阶段创建 runtime。
  const runtime = createScenarioRuntime(options?.scenarios ?? [])
  return { runtime }
}

export function registerScenarios(runtime: AiScenarioRuntime, scenarios: readonly AiScenarioDefinition[]): void {
  // 时序：系统运行阶段按需追加注册场景。
  for (const scenario of scenarios) {
    runtime.registry.register(scenario)
  }
}
