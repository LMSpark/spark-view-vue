import type {
  AiScenarioCapability,
  AiScenarioContext,
  AiScenarioDefinition,
  AiScenarioFlowContract,
  AiScenarioFlowStep,
  AiScenarioResolution,
  AiScenarioStep,
  AiScenarioTool,
} from './scenario-types'
import type { JsonSchema } from '../../core/session/session-contracts'
import type {
  AiIntentCatalog,
  AiIntentCatalogEntry,
  AiScenarioCapabilitiesPage,
  AiScenarioCapabilitiesQuery,
  AiScenarioCompletionInfo,
  AiScenarioFlowInfo,
  AiScenarioInfo,
  AiScenarioPayloadInfo,
  AiScenarioQueryProtocol,
  AiScenarioRecoveryInfo,
  AiScenarioToolsPage,
  AiScenarioToolsQuery,
  AiToolRegistrationInfo,
  AiToolSchemaInfo,
  AiToolSchemaNodeInfo,
  AiToolSchemaNodeQuery,
  AiToolSummary,
} from './query-protocol'

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：内部工具函数
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 字符串归一化：去首尾空白并统一小写，降低关键词匹配噪音。
 */
function normalize(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * 基于关键词长度累加的简单匹配评分。
 * 规则越长且命中越多，分值越高。
 */
function keywordMatchScore(input: string, intents: readonly string[]): number {
  const normalized = normalize(input)
  let score = 0
  for (const intent of intents) {
    const keyword = normalize(intent)
    if (keyword.length === 0) continue
    if (normalized.includes(keyword)) score += keyword.length
  }
  return score
}

function toPage(query?: AiScenarioToolsQuery): { offset: number; limit: number } {
  const rawOffset = query?.offset ?? 0
  const rawLimit = query?.limit ?? 20
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 20
  return { offset, limit }
}

function toCapabilitiesPage(query?: AiScenarioCapabilitiesQuery): { offset: number; limit: number } {
  const rawOffset = query?.offset ?? 0
  const rawLimit = query?.limit ?? 20
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 20
  return { offset, limit }
}

function normalizePointer(pointer?: string): string {
  if (pointer === undefined || pointer.trim() === '' || pointer === '/') return '/'
  return pointer.startsWith('/') ? pointer : `/${pointer}`
}

function encodePointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}

function decodePointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~')
}

type SchemaNode = JsonSchema | JsonSchema['properties'][string]
type SchemaProperty = JsonSchema['properties'][string]
type SchemaNodeWithChildren = {
  properties?: Record<string, SchemaProperty>
  items?: SchemaProperty
}

function getSchemaProperties(node: SchemaNode): Record<string, SchemaProperty> | undefined {
  return (node as SchemaNodeWithChildren).properties
}

function getSchemaItems(node: SchemaNode): SchemaProperty | undefined {
  return (node as SchemaNodeWithChildren).items
}

function getNodeChildrenPointers(node: SchemaNode, pointer: string): string[] {
  const base = normalizePointer(pointer)
  const children: string[] = []
  const properties = getSchemaProperties(node)
  const objectChildren = properties !== undefined ? Object.keys(properties) : []
  for (const key of objectChildren) {
    const suffix = encodePointerSegment(key)
    children.push(base === '/' ? `/${suffix}` : `${base}/${suffix}`)
  }
  if (getSchemaItems(node) !== undefined) {
    children.push(base === '/' ? '/items' : `${base}/items`)
  }
  return children
}

function findSchemaNode(parameters: JsonSchema | undefined, pointer?: string): { pointer: string; node: SchemaNode } | undefined {
  if (parameters === undefined) return undefined
  const normalizedPointer = normalizePointer(pointer)
  if (normalizedPointer === '/') {
    return { pointer: '/', node: parameters }
  }

  const parts = normalizedPointer.slice(1).split('/').map(decodePointerSegment)
  let current: SchemaNode = parameters

  for (const part of parts) {
    const items = getSchemaItems(current)
    if (part === 'items' && items !== undefined) {
      current = items
      continue
    }

    const properties = getSchemaProperties(current)
    if (properties !== undefined) {
      const next = properties[part]
      if (next !== undefined) {
        current = next
        continue
      }
    }

    return undefined
  }

  return { pointer: normalizedPointer, node: current }
}

function toolToCapability(scenarioId: string, tool: AiScenarioTool): AiScenarioCapability {
  return {
    id: `${scenarioId}.tool.${tool.name}`,
    title: tool.name,
    kind: 'tool',
    description: tool.description,
    ...(tool.registration?.tags !== undefined ? { tags: tool.registration.tags } : {}),
    relatedTools: [tool.name],
  }
}

function listScenarioCapabilities(scenario: AiScenarioDefinition): readonly AiScenarioCapability[] {
  const explicit = scenario.capabilities ?? []
  const toolCapabilities = scenario.tools.map((tool) => toolToCapability(scenario.id, tool))
  return [...explicit, ...toolCapabilities]
}

function stepToFlowStep(step: AiScenarioStep): AiScenarioFlowStep {
  return {
    id: step.id,
    title: step.title,
    kind: 'tool',
    tool: step.tool,
    ...(step.args !== undefined ? { args: step.args } : {}),
    ...(step.critical !== undefined ? { critical: step.critical } : {}),
  }
}

function safeBuildLegacySteps(scenario: AiScenarioDefinition): readonly AiScenarioStep[] {
  try {
    return scenario.buildSteps?.({}, { userInput: '' } as AiScenarioContext) ?? []
  } catch {
    return []
  }
}

function resolveScenarioFlow(scenario: AiScenarioDefinition): AiScenarioFlowInfo {
  if (scenario.flow !== undefined) {
    return {
      scenarioId: scenario.id,
      flow: scenario.flow,
      source: 'registered',
    }
  }

  const legacySteps = safeBuildLegacySteps(scenario)
  if (legacySteps.length > 0) {
    return {
      scenarioId: scenario.id,
      flow: {
        description: '由 legacy buildSteps 自动投影的流程说明；建议迁移为显式 flow 注册。',
        steps: legacySteps.map(stepToFlowStep),
      },
      source: 'legacy-buildSteps',
    }
  }

  return {
    scenarioId: scenario.id,
    flow: {
      steps: [],
    },
    source: 'empty',
  }
}

function listCriticalTools(flow: AiScenarioFlowContract): Set<string> {
  const result = new Set<string>()
  for (const step of flow.steps) {
    if (!step.critical) continue
    if (step.tool !== undefined) result.add(step.tool)
    for (const tool of step.tools ?? []) {
      result.add(tool)
    }
  }
  return result
}

function validateScenarioRegistration(scenario: AiScenarioDefinition): void {
  if (scenario.id.trim() === '') {
    throw new Error('Scenario id cannot be empty.')
  }
  const toolNames = new Set<string>()
  for (const tool of scenario.tools) {
    if (tool.name.trim() === '') {
      throw new Error(`Scenario ${scenario.id} contains an empty tool name.`)
    }
    if (toolNames.has(tool.name)) {
      throw new Error(`Scenario ${scenario.id} contains duplicate tool: ${tool.name}`)
    }
    toolNames.add(tool.name)
  }
}

function findScenarioTool(
  scenarios: Iterable<AiScenarioDefinition>,
  toolName: string,
  scenarioId?: string
): { scenario: AiScenarioDefinition; tool: AiScenarioTool } | undefined {
  const lookupScenarioId = scenarioId?.trim()
  for (const scenario of scenarios) {
    if (lookupScenarioId !== undefined && lookupScenarioId !== '' && scenario.id !== lookupScenarioId) continue
    const tool = scenario.tools.find((t) => t.name === toolName)
    if (tool !== undefined) return { scenario, tool }
  }
  return undefined
}

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：注册中心接口（传统 + 分级查询）
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 场景注册中心。
 * - 传统接口：管理（register/unregister/clear）、检索（get/list）、路由（resolve）
 * - 分级查询接口：强制 LLM 按步骤查询（queryIntentCatalog / queryScenarioInfo / queryScenarioTools / queryToolSchemaNode）
 */
export interface AiScenarioRegistry extends AiScenarioQueryProtocol {
  register: (scenario: AiScenarioDefinition) => void
  unregister: (scenarioId: string) => boolean
  clear: () => void
  get: (scenarioId: string) => AiScenarioDefinition | undefined
  list: () => readonly AiScenarioDefinition[]
  resolve: (input: string, ctx: AiScenarioContext) => AiScenarioResolution | undefined
}

// ═══════════════════════════════════════════════════════════════════════════
// 流程分区：注册中心实现
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 创建场景注册中心。
 *
 * 时序说明：
 * 1) 初始化：将 initial 场景装入 map
 * 2) 注册阶段：register/unregister/clear 维护 map
 * 3) 路由阶段：resolve 执行意图匹配，返回最高分场景
 * 4) 查询阶段：queryIntentCatalog / queryScenarioInfo / queryScenarioTools / queryToolSchemaNode 分级暴露信息
 */
export function createScenarioRegistry(initial: readonly AiScenarioDefinition[] = []): AiScenarioRegistry {
  const map = new Map<string, AiScenarioDefinition>()

  for (const scenario of initial) {
    validateScenarioRegistration(scenario)
    map.set(scenario.id, scenario)
  }

  function register(scenario: AiScenarioDefinition): void {
    validateScenarioRegistration(scenario)
    map.set(scenario.id, scenario)
  }

  function unregister(scenarioId: string): boolean {
    return map.delete(scenarioId)
  }

  function clear(): void {
    map.clear()
  }

  function get(scenarioId: string): AiScenarioDefinition | undefined {
    return map.get(scenarioId)
  }

  function list(): readonly AiScenarioDefinition[] {
    return Array.from(map.values())
  }

  /**
   * 解析输入对应的最佳场景。
   * 匹配优先级：
   * 1) 自定义 matchIntent（若存在）
   * 2) 默认关键词评分
   */
  function resolve(input: string, ctx: AiScenarioContext): AiScenarioResolution | undefined {
    let best: AiScenarioResolution | undefined

    for (const scenario of map.values()) {
      const custom = scenario.matchIntent?.(input, ctx)
      if (custom !== undefined) {
        if (!custom.matched) continue
        if (best === undefined || custom.score > best.score) {
          best = { scenario, score: custom.score, ...(custom.reason ? { reason: custom.reason } : {}) }
        }
        continue
      }

      const score = keywordMatchScore(input, scenario.intents)
      if (score <= 0) continue
      if (best === undefined || score > best.score) {
        best = { scenario, score }
      }
    }

    return best
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 分级查询实现
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 查询 1：生成意图目录。
   * LLM 第一步必须调用此方法了解所有可用场景。
   */
  function queryIntentCatalog(): AiIntentCatalog {
    const entries: AiIntentCatalogEntry[] = []
    for (const scenario of map.values()) {
      entries.push({
        scenarioId: scenario.id,
        title: scenario.title,
        scope: scenario.scope,
        intents: scenario.intents,
        summary: scenario.description ?? `场景类型：${scenario.scope}。触发关键词：${scenario.intents.join('、')}。`,
      })
    }
    return { entries }
  }

  /**
   * 查询 2：获取场景详细信息（含工具摘要 + 默认步骤）。
   * LLM 确认目标场景后调用。
   */
  function queryScenarioInfo(scenarioId: string): AiScenarioInfo | undefined {
    const scenario = map.get(scenarioId)
    if (scenario === undefined) return undefined
    const flowInfo = resolveScenarioFlow(scenario)
    const defaultSteps = flowInfo.flow.steps

    const systemPrompt = typeof scenario.promptPolicy.systemPrompt === 'function'
      ? ''
      : scenario.promptPolicy.systemPrompt

    const criticalTools = listCriticalTools(flowInfo.flow)

    const tools: AiToolSummary[] = scenario.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      scenarioId: scenario.id,
      critical: criticalTools.has(tool.name),
    }))

    return {
      scenarioId: scenario.id,
      title: scenario.title,
      scope: scenario.scope,
      ...(scenario.description !== undefined ? { description: scenario.description } : {}),
      systemPrompt,
      defaultSteps: defaultSteps.map((step) => ({
        id: step.id,
        title: step.title,
        description: step.description ?? (step.critical ? `[关键步骤] ${step.tool ?? step.tools?.join('、') ?? step.kind ?? '流程步骤'}` : `${step.tool ?? step.tools?.join('、') ?? step.kind ?? '流程步骤'}`),
      })),
      tools,
      capabilities: listScenarioCapabilities(scenario),
    }
  }

  function queryScenarioCapabilities(query?: AiScenarioCapabilitiesQuery): AiScenarioCapabilitiesPage {
    const { offset, limit } = toCapabilitiesPage(query)
    const scenarioId = query?.scenarioId?.trim()
    const keyword = query?.keyword?.trim().toLowerCase()
    const all: AiScenarioCapability[] = []

    for (const scenario of map.values()) {
      if (scenarioId !== undefined && scenarioId !== '' && scenario.id !== scenarioId) continue
      for (const capability of listScenarioCapabilities(scenario)) {
        if (keyword !== undefined && keyword !== '') {
          const haystack = [
            capability.id,
            capability.title,
            capability.kind,
            capability.description,
            ...(capability.tags ?? []),
            ...(capability.relatedTools ?? []),
          ].join(' ').toLowerCase()
          if (!haystack.includes(keyword)) continue
        }
        all.push(capability)
      }
    }

    const items = all.slice(offset, offset + limit)
    return {
      total: all.length,
      offset,
      limit,
      hasMore: offset + items.length < all.length,
      items,
    }
  }

  function queryScenarioPayload(scenarioId: string): AiScenarioPayloadInfo | undefined {
    const scenario = map.get(scenarioId)
    if (scenario === undefined) return undefined
    return {
      scenarioId: scenario.id,
      payload: scenario.payload,
    }
  }

  function queryScenarioFlow(scenarioId: string): AiScenarioFlowInfo | undefined {
    const scenario = map.get(scenarioId)
    if (scenario === undefined) return undefined
    return resolveScenarioFlow(scenario)
  }

  function queryScenarioCompletion(scenarioId: string): AiScenarioCompletionInfo | undefined {
    const scenario = map.get(scenarioId)
    if (scenario === undefined) return undefined
    return {
      scenarioId: scenario.id,
      completion: scenario.completion,
    }
  }

  function queryScenarioRecovery(scenarioId: string): AiScenarioRecoveryInfo | undefined {
    const scenario = map.get(scenarioId)
    if (scenario === undefined) return undefined
    return {
      scenarioId: scenario.id,
      recovery: scenario.recovery ?? [],
    }
  }

  /**
   * 查询 3：获取工具目录（分页）。
   * 类似 catalog.query：先目录发现，再按需精查，避免一次性注入海量参数。
   */
  function queryScenarioTools(query?: AiScenarioToolsQuery): AiScenarioToolsPage {
    const { offset, limit } = toPage(query)
    const scenarioId = query?.scenarioId?.trim()
    const keyword = query?.keyword?.trim().toLowerCase()

    const all: AiToolSummary[] = []
    for (const scenario of map.values()) {
      if (scenarioId !== undefined && scenarioId !== '' && scenario.id !== scenarioId) continue

      const criticalTools = listCriticalTools(resolveScenarioFlow(scenario).flow)

      for (const tool of scenario.tools) {
        if (keyword !== undefined && keyword !== '') {
          const haystack = `${tool.name} ${tool.description}`.toLowerCase()
          if (!haystack.includes(keyword)) continue
        }

        all.push({
          name: tool.name,
          description: tool.description,
          scenarioId: scenario.id,
          critical: criticalTools.has(tool.name),
        })
      }
    }

    const items = all.slice(offset, offset + limit)
    return {
      total: all.length,
      offset,
      limit,
      hasMore: offset + items.length < all.length,
      items,
    }
  }

  /**
   * 查询 3：获取单个工具的参数 Schema。
   * LLM 需要调用工具前必须先查此 Schema，确认参数规范。
   */
  function queryToolSchema(toolName: string, scenarioId?: string): AiToolSchemaInfo | undefined {
    const resolved = findScenarioTool(map.values(), toolName, scenarioId)
    if (resolved !== undefined) {
      return {
        scenarioId: resolved.scenario.id,
        toolName: resolved.tool.name,
        description: resolved.tool.description,
        parameters: resolved.tool.parameters,
        examples: resolved.tool.registration?.example !== undefined
          ? [{ description: '注册示例', args: resolved.tool.registration.example }]
          : [],
      }
    }
    return undefined
  }

  /**
   * 查询 4（推荐）：按节点下钻查询工具参数 Schema。
   * 类似 catalog.guide：对复杂参数分层精查，避免一次性传输完整大对象。
   */
  function queryToolSchemaNode(query: AiToolSchemaNodeQuery): AiToolSchemaNodeInfo | undefined {
    const lookupName = query.toolName.trim()
    if (lookupName === '') return undefined

    const resolvedTool = findScenarioTool(map.values(), lookupName, query.scenarioId)
    if (resolvedTool !== undefined) {
      const { scenario, tool } = resolvedTool

      const resolved = findSchemaNode(tool.parameters, query.pointer)
      if (resolved === undefined) return undefined

      return {
        scenarioId: scenario.id,
        toolName: tool.name,
        description: tool.description,
        pointer: resolved.pointer,
        schema: resolved.node,
        childPointers: getNodeChildrenPointers(resolved.node, resolved.pointer),
      }
    }

    return undefined
  }

  /**
   * 查询 5：获取函数注册详情（旧结构对齐）。
   */
  function queryToolRegistration(toolName: string, scenarioId?: string): AiToolRegistrationInfo | undefined {
    const lookupName = toolName.trim()
    if (lookupName === '') return undefined

    const resolved = findScenarioTool(map.values(), lookupName, scenarioId)
    if (resolved !== undefined) {
      const { scenario, tool } = resolved
      return {
        scenarioId: scenario.id,
        toolName: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        registration: tool.registration ?? {
          rules: ['调用前必须先查询 queryToolSchemaNode 或 queryToolSchema'],
          failureCodes: ['INVALID_PARAMS', 'TOOL_EXEC_FAILED'],
          fixHints: ['按 parameters 的 required 字段补齐参数后重试'],
        },
      }
    }

    return undefined
  }

  return {
    register,
    unregister,
    clear,
    get,
    list,
    resolve,
    queryIntentCatalog,
    queryScenarioInfo,
    queryScenarioCapabilities,
    queryScenarioPayload,
    queryScenarioFlow,
    queryScenarioCompletion,
    queryScenarioRecovery,
    queryScenarioTools,
    queryToolSchema,
    queryToolSchemaNode,
    queryToolRegistration,
  }
}
