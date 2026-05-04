import { buildScenarioSystemPrompt } from './prompt-constraints'
import type { AiScenarioScope } from '../contracts/scenario-types'

/**
 * ==============================================
 * 提示词层：模板注册中心
 * ==============================================
 * 功能分区：
 * 1) 模板注册/删除/读取/列表。
 * 2) 模板变量解析与最终 prompt 构建。
 *
 * 时序分区：
 * 1) 系统启动时注册模板。
 * 2) runtime 在执行前通过 templateId 调用 buildPrompt。
 */

export interface ScenarioPromptBuildContext {
  /** 运行时附加约束，会和模板内约束合并。 */
  extraConstraints?: readonly string[]
}

export interface ScenarioPromptTemplateRegistration {
  /** 模板 ID，需全局唯一。 */
  id: string
  /** 模板所属作用域。 */
  scope: AiScenarioScope
  /** 场景名称，可静态定义或动态生成。 */
  scenarioName: string | ((ctx: ScenarioPromptBuildContext) => string)
  /** 核心行为说明。 */
  baseBehavior?: string | ((ctx: ScenarioPromptBuildContext) => string)
  /** 模板静态附加约束。 */
  extraConstraints?: readonly string[]
}

export interface ScenarioPromptTemplateRegistry {
  register: (template: ScenarioPromptTemplateRegistration) => void
  unregister: (id: string) => boolean
  get: (id: string) => ScenarioPromptTemplateRegistration | undefined
  list: () => readonly ScenarioPromptTemplateRegistration[]
  buildPrompt: (id: string, ctx?: ScenarioPromptBuildContext) => string | undefined
}

function resolveTemplateValue(
  value: string | ((ctx: ScenarioPromptBuildContext) => string) | undefined,
  ctx: ScenarioPromptBuildContext,
): string | undefined {
  // 功能：统一处理模板字段“静态值/动态函数”两种来源。
  if (value === undefined) return undefined
  return typeof value === 'function' ? value(ctx) : value
}

function appendConstraints(basePrompt: string, constraints: readonly string[]): string {
  // 功能：把约束以可读编号追加到 prompt 末尾。
  if (constraints.length === 0) return basePrompt
  const lines = constraints.map((item, index) => `${index + 1}. ${item}`).join('\n')
  return `${basePrompt}\n\n## 附加约束\n\n${lines}`
}

export function createScenarioPromptTemplateRegistry(
  initial: readonly ScenarioPromptTemplateRegistration[] = [],
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
    // 时序：执行阶段由 runtime 调用，用于最终系统提示词生成。
    const template = map.get(id)
    if (template === undefined) return undefined

    const scenarioName = resolveTemplateValue(template.scenarioName, ctx)
    if (scenarioName === undefined || scenarioName.trim() === '') return undefined

    const baseBehavior = resolveTemplateValue(template.baseBehavior, ctx)
    const prompt = buildScenarioSystemPrompt(scenarioName, template.scope, baseBehavior)

    const constraints = [
      ...(template.extraConstraints ?? []),
      ...(ctx.extraConstraints ?? []),
    ]

    return appendConstraints(prompt, constraints)
  }

  return {
    register,
    unregister,
    get,
    list,
    buildPrompt,
  }
}

/**
 * 工厂函数：创建一个场景提示词模板注册中心。
 *
 * 示例：
 * const reg = createScenarioPromptTemplateRegistry([{ id: 'leave', scope: 'business', scenarioName: '请假', baseBehavior: '辅助发起请假申请' }])
 * const prompt = reg.buildPrompt('leave')
 *
 * 说明：返回的 registry 提供注册/注销/查询/列表和基于模板构建最终 prompt 的能力。
 */
