/**
 * 场景提示词模板注册中心。
 *
 * 职责：
 * 1. 定义模板注册协议（ScenarioPromptTemplateRegistration）
 * 2. 提供可扩展的模板注册中心（ScenarioPromptTemplateRegistry）
 * 3. 内置默认模板（planning / design / business）
 * 4. 导出预定义场景的 systemPrompt 常量
 *
 * 依赖：
 * - prompt-constraints：TIERED_QUERY_CONSTRAINT + buildScenarioSystemPrompt（纯文本层）
 */

import { buildScenarioSystemPrompt } from './prompt-constraints'

// ═══════════════════════════════════════════════════════════════════════════
// 模板注册协议类型
// ═══════════════════════════════════════════════════════════════════════════

export interface ScenarioPromptBuildContext {
  businessName?: string
  businessSteps?: string
}

export interface ScenarioPromptTemplateRegistration {
  id: string
  scope: 'planning' | 'design' | 'business'
  scenarioName: string | ((ctx: ScenarioPromptBuildContext) => string)
  baseBehavior?: string | ((ctx: ScenarioPromptBuildContext) => string)
  extraConstraints?: readonly string[]
}

export interface ScenarioPromptTemplateRegistry {
  register: (template: ScenarioPromptTemplateRegistration) => void
  unregister: (id: string) => boolean
  get: (id: string) => ScenarioPromptTemplateRegistration | undefined
  list: () => readonly ScenarioPromptTemplateRegistration[]
  buildPrompt: (id: string, ctx?: ScenarioPromptBuildContext) => string | undefined
}

// ═══════════════════════════════════════════════════════════════════════════
// 内部辅助函数
// ═══════════════════════════════════════════════════════════════════════════

function resolveTemplateValue(
  value: string | ((ctx: ScenarioPromptBuildContext) => string) | undefined,
  ctx: ScenarioPromptBuildContext
): string | undefined {
  if (value === undefined) return undefined
  return typeof value === 'function' ? value(ctx) : value
}

function appendExtraConstraints(basePrompt: string, constraints?: readonly string[]): string {
  if (constraints === undefined || constraints.length === 0) return basePrompt
  return [
    basePrompt,
    '',
    '## 场景附加约束',
    ...constraints.map((item, index) => `${index + 1}. ${item}`),
  ].join('\n')
}

// ═══════════════════════════════════════════════════════════════════════════
// 注册中心工厂
// ═══════════════════════════════════════════════════════════════════════════

export function createScenarioPromptTemplateRegistry(
  initial: readonly ScenarioPromptTemplateRegistration[] = []
): ScenarioPromptTemplateRegistry {
  const map = new Map<string, ScenarioPromptTemplateRegistration>()

  for (const template of initial) {
    map.set(template.id, template)
  }

  function register(template: ScenarioPromptTemplateRegistration): void {
    map.set(template.id, template)
  }

  function unregister(id: string): boolean {
    return map.delete(id)
  }

  function get(id: string): ScenarioPromptTemplateRegistration | undefined {
    return map.get(id)
  }

  function list(): readonly ScenarioPromptTemplateRegistration[] {
    return Array.from(map.values())
  }

  function buildPrompt(id: string, ctx: ScenarioPromptBuildContext = {}): string | undefined {
    const template = map.get(id)
    if (template === undefined) return undefined

    const scenarioName = resolveTemplateValue(template.scenarioName, ctx)
    const baseBehavior = resolveTemplateValue(template.baseBehavior, ctx)
    const prompt = buildScenarioSystemPrompt(scenarioName ?? id, template.scope, baseBehavior)
    return appendExtraConstraints(prompt, template.extraConstraints)
  }

  return {
    register,
    unregister,
    get,
    list,
    buildPrompt,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 内置默认模板
// ═══════════════════════════════════════════════════════════════════════════

export const DEFAULT_SCENARIO_PROMPT_TEMPLATES: readonly ScenarioPromptTemplateRegistration[] = [
  {
    id: 'planning.default',
    scope: 'planning',
    scenarioName: '项目-模块-页面规划',
    baseBehavior: [
      '- 理解用户的业务需求',
      '- 分解为项目 -> 模块 -> 页面的三层结构',
      '- 通过工具链创建项目计划、模块计划、页面计划',
      '- 可选：验证整个规划的一致性与完整性',
    ].join('\n'),
  },
  {
    id: 'design.default',
    scope: 'design',
    scenarioName: '页面编辑（四文件）',
    baseBehavior: [
      '- 读取并理解页面的四个配置文件：rule.json、pagedata.json、script.js、style.css',
      '- 根据用户需求修改一个或多个文件',
      '- 按照场景规定的步骤写入修改，确保关键步骤的原子性',
      '- 可选：验证修改后的页面模型是否有效',
    ].join('\n'),
  },
  {
    id: 'business.default',
    scope: 'business',
    scenarioName: (ctx) => `${ctx.businessName ?? '通用'}业务流程`,
    baseBehavior: (ctx) => ctx.businessSteps ?? [
      `- 理解用户的 ${ctx.businessName ?? '业务'} 需求`,
      '- 通过工具链完成业务操作流程',
      '- 返回结果或状态给用户',
    ].join('\n'),
  },
]

// 模块内部单例（仅用于导出预定义常量）
const defaultScenarioPromptTemplateRegistry = createScenarioPromptTemplateRegistry(DEFAULT_SCENARIO_PROMPT_TEMPLATES)

// ═══════════════════════════════════════════════════════════════════════════
// 预定义场景的系统提示词常量
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 规划场景（项目-模块-页面）的系统提示词。
 */
export const PLANNING_SCENARIO_SYSTEM_PROMPT =
  defaultScenarioPromptTemplateRegistry.buildPrompt('planning.default') ??
  buildScenarioSystemPrompt(
    '项目-模块-页面规划',
    'planning',
    [
      '- 理解用户的业务需求',
      '- 分解为项目 -> 模块 -> 页面的三层结构',
      '- 通过工具链创建项目计划、模块计划、页面计划',
      '- 可选：验证整个规划的一致性与完整性',
    ].join('\n')
  )

/**
 * 页面设计场景（四文件编辑）的系统提示词。
 */
export const PAGE_DESIGN_SCENARIO_SYSTEM_PROMPT =
  defaultScenarioPromptTemplateRegistry.buildPrompt('design.default') ??
  buildScenarioSystemPrompt(
    '页面编辑（四文件）',
    'design',
    [
      '- 读取并理解页面的四个配置文件：rule.json、pagedata.json、script.js、style.css',
      '- 根据用户需求修改一个或多个文件',
      '- 按照场景规定的步骤写入修改，确保关键步骤的原子性',
      '- 可选：验证修改后的页面模型是否有效',
    ].join('\n')
  )

/**
 * 构造业务场景的系统提示词。
 * 可用于任何具体业务流程（如请假、采购、审批等）。
 */
export function buildBusinessScenarioSystemPrompt(businessName: string, businessSteps?: string): string {
  const ctx: ScenarioPromptBuildContext = {
    businessName,
    ...(businessSteps !== undefined ? { businessSteps } : {}),
  }
  return defaultScenarioPromptTemplateRegistry.buildPrompt('business.default', ctx) ??
    buildScenarioSystemPrompt(`${businessName}业务流程`, 'business', businessSteps)
}
