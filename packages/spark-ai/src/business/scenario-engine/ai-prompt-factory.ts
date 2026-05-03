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

// ═══════════════════════════════════════════════════════════════════════════
// AI 工厂接口
// ═══════════════════════════════════════════════════════════════════════════

/**
 * AI 工厂提示词总装配接口。
 *
 * 统一入口：
 * - getPlanningPrompt()：获取规划场景提示词
 * - getDesignPrompt()：获取页面设计场景提示词
 * - getBusinessPrompt(businessId)：按注册 ID 获取业务提示词（fail-fast: 无注册则用动态模板）
 * - getBusinessPromptRegistry()：访问底层业务注册中心
 */
export interface AiPromptFactory {
  getPlanningPrompt: () => string
  getDesignPrompt: () => string
  getBusinessPrompt: (businessId: string, fallbackBusinessName?: string) => string
  getBusinessPromptRegistry: () => BusinessScenarioPromptRegistry
}

// ═══════════════════════════════════════════════════════════════════════════
// 工厂实现
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 创建 AI 提示词工厂。
 *
 * @param options.planningPrompt  覆盖默认规划提示词
 * @param options.designPrompt    覆盖默认设计提示词
 * @param options.businessRegistry 注入已有业务注册中心；不传则创建空注册中心
 */
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
