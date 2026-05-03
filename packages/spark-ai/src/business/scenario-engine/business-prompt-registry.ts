import { buildBusinessScenarioSystemPrompt } from './scenario-prompt-template-registry'

// ============================================================================
// 功能分区：业务提示词注册协议（AI 工厂底座）
// ============================================================================

/**
 * 业务场景提示词注册项（统一主类型）。
 */
export interface BusinessScenarioPromptRegistration {
  businessId: string
  businessName: string
  description?: string
  businessSteps: string
  hardRules?: readonly string[]
  examples?: readonly string[]
  version?: string
}

/**
 * 业务提示词已解析结果。
 */
export interface AiBusinessPromptResolved {
  id: string
  businessName: string
  systemPrompt: string
}

/**
 * 业务提示词注册中心（AI 工厂核心）。
 *
 * 用途：
 * 1) 注册多个业务域提示词模板
 * 2) 运行时按业务 ID 解析 systemPrompt
 * 3) 形成可扩展的 AI 工厂提示词层
 */
export interface BusinessScenarioPromptRegistry {
  register: (definition: BusinessScenarioPromptRegistration) => void
  unregister: (id: string) => boolean
  clear: () => void
  get: (id: string) => BusinessScenarioPromptRegistration | undefined
  list: () => readonly BusinessScenarioPromptRegistration[]
  resolve: (id: string) => AiBusinessPromptResolved | undefined
  buildPrompt: (id: string) => string | undefined
}

// 兼容导出（旧命名）
export type AiBusinessPromptDefinition = BusinessScenarioPromptRegistration
export type AiBusinessPromptRegistry = BusinessScenarioPromptRegistry

// ============================================================================
// 功能分区：注册中心实现
// ============================================================================

function normalizeBusinessId(value: string): string {
  return value.trim().toLowerCase()
}

function appendBusinessRegistrationExtensions(
  basePrompt: string,
  registration: BusinessScenarioPromptRegistration
): string {
  const hardRules = registration.hardRules ?? []
  const examples = registration.examples ?? []

  const ruleBlock = hardRules.length > 0
    ? `\n\n## 业务硬规则\n${hardRules.map((rule, index) => `${index + 1}. ${rule}`).join('\n')}`
    : ''

  const exampleBlock = examples.length > 0
    ? `\n\n## 业务示例\n${examples.map((example, index) => `${index + 1}. ${example}`).join('\n')}`
    : ''

  const metaBlock = registration.version !== undefined || registration.description !== undefined
    ? `\n\n## 注册元信息\n- businessId: ${registration.businessId}\n- version: ${registration.version ?? 'v1'}${registration.description ? `\n- description: ${registration.description}` : ''}`
    : ''

  return `${basePrompt}${ruleBlock}${exampleBlock}${metaBlock}`
}

/**
 * 创建业务提示词注册中心。
 */
export function createBusinessScenarioPromptRegistry(
  initial: readonly BusinessScenarioPromptRegistration[] = []
): BusinessScenarioPromptRegistry {
  const map = new Map<string, BusinessScenarioPromptRegistration>()

  for (const item of initial) {
    map.set(normalizeBusinessId(item.businessId), item)
  }

  function register(definition: BusinessScenarioPromptRegistration): void {
    map.set(normalizeBusinessId(definition.businessId), definition)
  }

  function unregister(id: string): boolean {
    return map.delete(normalizeBusinessId(id))
  }

  function clear(): void {
    map.clear()
  }

  function get(id: string): BusinessScenarioPromptRegistration | undefined {
    return map.get(normalizeBusinessId(id))
  }

  function list(): readonly BusinessScenarioPromptRegistration[] {
    return Array.from(map.values())
  }

  function resolve(id: string): AiBusinessPromptResolved | undefined {
    const definition = map.get(normalizeBusinessId(id))
    if (definition === undefined) return undefined

    const base = buildBusinessScenarioSystemPrompt(definition.businessName, definition.businessSteps)
    const systemPrompt = appendBusinessRegistrationExtensions(base, definition)

    return {
      id: definition.businessId,
      businessName: definition.businessName,
      systemPrompt,
    }
  }

  function buildPrompt(id: string): string | undefined {
    return resolve(id)?.systemPrompt
  }

  return {
    register,
    unregister,
    clear,
    get,
    list,
    resolve,
    buildPrompt,
  }
}

/**
 * 兼容导出：createBusinessPromptRegistry。
 */
export function createBusinessPromptRegistry(
  initial: readonly AiBusinessPromptDefinition[] = []
): AiBusinessPromptRegistry {
  return createBusinessScenarioPromptRegistry(initial)
}

// ============================================================================
// 功能分区：AI 工厂快捷方法
// ============================================================================

/**
 * 按业务 ID 快速创建系统提示词。
 *
 * 典型用法：
 * - 在业务场景工厂里通过 promptRegistry.resolve(id) 注入 promptPolicy.systemPrompt
 * - 不存在时 fail-fast 返回 undefined，由上层决定是否中断
 */
export function resolveBusinessSystemPrompt(
  registry: BusinessScenarioPromptRegistry,
  businessId: string
): string | undefined {
  return registry.buildPrompt(businessId)
}
