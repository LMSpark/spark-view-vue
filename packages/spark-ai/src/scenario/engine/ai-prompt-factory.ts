/**
 * AI 提示词工厂（顶层总装配）。
 *
 * 职责：
 * - 聚合 planning / design / business 三类提示词
 * - 提供统一入口 createAiPromptFactory
 *
 * 依赖：
 * - scenario-prompt-template-registry：预定义场景提示词常量
 * - business-prompt-registry：业务域提示词注册中心
 */

import {
  PLANNING_SCENARIO_SYSTEM_PROMPT,
  PAGE_DESIGN_SCENARIO_SYSTEM_PROMPT,
  buildBusinessScenarioSystemPrompt,
} from './scenario-prompt-template-registry'

import {
  type BusinessScenarioPromptRegistry,
  createBusinessScenarioPromptRegistry,
} from './business-prompt-registry'

export interface AiPromptFactory {
  getPlanningPrompt: () => string
  getDesignPrompt: () => string
  getBusinessPrompt: (businessId: string, fallbackBusinessName?: string) => string
  getBusinessPromptRegistry: () => BusinessScenarioPromptRegistry
}

export function createAiPromptFactory(
  options?: {
    planningPrompt?: string
    designPrompt?: string
    businessRegistry?: BusinessScenarioPromptRegistry
  }
): AiPromptFactory {
  const businessRegistry = options?.businessRegistry ?? createBusinessScenarioPromptRegistry()

  function getPlanningPrompt(): string {
    return options?.planningPrompt ?? PLANNING_SCENARIO_SYSTEM_PROMPT
  }

  function getDesignPrompt(): string {
    return options?.designPrompt ?? PAGE_DESIGN_SCENARIO_SYSTEM_PROMPT
  }

  function getBusinessPrompt(businessId: string, fallbackBusinessName?: string): string {
    const registered = businessRegistry.buildPrompt(businessId)
    if (registered !== undefined) return registered
    return buildBusinessScenarioSystemPrompt(
      fallbackBusinessName ?? businessId,
      [
        `- 理解用户的 ${fallbackBusinessName ?? businessId} 需求`,
        '- 通过工具链完成业务操作流程',
        '- 返回结果或状态给用户',
      ].join('\n')
    )
  }

  function getBusinessPromptRegistry(): BusinessScenarioPromptRegistry {
    return businessRegistry
  }

  return {
    getPlanningPrompt,
    getDesignPrompt,
    getBusinessPrompt,
    getBusinessPromptRegistry,
  }
}
