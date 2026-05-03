import { buildBusinessScenarioSystemPrompt } from './scenario-prompt-template-registry'

export interface BusinessScenarioPromptRegistration {
  businessId: string
  businessName: string
  description?: string
  businessSteps: string
  hardRules?: readonly string[]
  examples?: readonly string[]
  version?: string
}

export interface AiBusinessPromptResolved {
  id: string
  businessName: string
  systemPrompt: string
}

export interface BusinessScenarioPromptRegistry {
  register: (definition: BusinessScenarioPromptRegistration) => void
  unregister: (id: string) => boolean
  clear: () => void
  get: (id: string) => BusinessScenarioPromptRegistration | undefined
  list: () => readonly BusinessScenarioPromptRegistration[]
  resolve: (id: string) => AiBusinessPromptResolved | undefined
  buildPrompt: (id: string) => string | undefined
}

export type AiBusinessPromptDefinition = BusinessScenarioPromptRegistration
export type AiBusinessPromptRegistry = BusinessScenarioPromptRegistry

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

export function createBusinessPromptRegistry(
  initial: readonly AiBusinessPromptDefinition[] = []
): AiBusinessPromptRegistry {
  return createBusinessScenarioPromptRegistry(initial)
}

export function resolveBusinessSystemPrompt(
  registry: BusinessScenarioPromptRegistry,
  businessId: string
): string | undefined {
  return registry.buildPrompt(businessId)
}
