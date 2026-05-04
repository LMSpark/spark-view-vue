import type {
  AiScenarioCapability,
  AiScenarioContext,
  AiScenarioDefinition,
  AiScenarioFlowContract,
  AiScenarioFlowStep,
  AiScenarioHistoryPage,
  AiScenarioHistoryQuery,
  AiScenarioIdentityTool,
  AiScenarioResolution,
  AiScenarioRunRecord,
  AiScenarioStep,
  AiScenarioTool,
  AiScenarioToolFunctionRegistration,
} from '../contracts/scenario-types'
import type { JsonSchema } from '../contracts/json-schema'
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
  AiToolFunctionsInfo,
  AiToolRegistrationInfo,
  AiToolSchemaInfo,
  AiToolSchemaNodeInfo,
  AiToolSchemaNodeQuery,
  AiToolSummary,
} from '../contracts/query-protocol'

/**
 * ==============================================
 * 运行时层：场景注册中心
 * ==============================================
 * 功能分区：
 * 1) 管理场景生命周期（register/unregister/get/list）。
 * 2) 路由用户输入到最匹配场景（resolve）。
 * 3) 提供协议级查询接口（query*）。
 *
 * 时序分区：
 * 1) 系统启动时 createScenarioRegistry(initial)。
 * 2) 运行前/运行中按需调用 query* 获取元数据。
 * 3) 运行后通过 queryRunHistory/queryRunRecord 查询执行记录代理。
 */

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：内部工具函数
// ═══════════════════════════════════════════════════════════════════════════

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

/** 默认关键词匹配算法：简单可解释、低开销。 */
function keywordMatchScore(input: string, keywords: readonly string[]): number {
  const normalized = normalize(input)
  let score = 0
  for (const raw of keywords) {
    const keyword = normalize(raw)
    if (keyword.length === 0) continue
    if (normalized.includes(keyword)) score += keyword.length
  }
  return score
}

/** 读取场景关键词：优先 identity.keywords，缺省回退到 intents。 */
function getScenarioKeywords(scenario: AiScenarioDefinition): readonly string[] {
  const keywords = scenario.keywords
  if (keywords !== undefined && keywords.length > 0) return keywords
  return scenario.intents
}

function toIdentityTool(tool: AiScenarioTool): AiScenarioIdentityTool {
  return {
    name: tool.name,
    description: tool.description,
    ...(tool.parameters !== undefined ? { parameters: tool.parameters } : {}),
    ...(tool.registration !== undefined ? { registration: tool.registration } : {}),
  }
}

/** 读取场景工具实体：优先 identity.tools，缺省回退到 scenario.tools 实体快照。 */
function getScenarioTools(scenario: AiScenarioDefinition): readonly AiScenarioIdentityTool[] {
  return scenario.tools.map((tool) => toIdentityTool(tool))
}

/** 工具目录分页参数归一化。 */
function toPage(query?: AiScenarioToolsQuery): { offset: number; limit: number } {
  const rawOffset = query?.offset ?? 0
  const rawLimit = query?.limit ?? 20
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 20
  return { offset, limit }
}

/** 能力目录分页参数归一化。 */
function toCapabilitiesPage(query?: AiScenarioCapabilitiesQuery): { offset: number; limit: number } {
  const rawOffset = query?.offset ?? 0
  const rawLimit = query?.limit ?? 20
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 20
  return { offset, limit }
}

/**
 * JSON Pointer 归一化。
 * - 空值、空串、'/' 统一映射为根节点 '/'
 * - 非 '/' 开头的路径自动补前导 '/'
 */
function normalizePointer(pointer?: string): string {
  if (pointer === undefined || pointer.trim() === '' || pointer === '/') return '/'
  return pointer.startsWith('/') ? pointer : `/${pointer}`
}

/** JSON Pointer 段编码：'~' -> '~0'，'/' -> '~1'。 */
function encodePointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}

/** JSON Pointer 段解码：'~1' -> '/'，'~0' -> '~'。 */
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

/** 提取数组 items 子节点。 */
function getSchemaItems(node: SchemaNode): SchemaProperty | undefined {
  return (node as SchemaNodeWithChildren).items
}

/**
 * 计算当前 schema 节点可继续下钻的子路径。
 * - 对象：列出所有 properties 子路径
 * - 数组：若存在 items，补充 '/items' 子路径
 */
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

/**
 * 依据 pointer 在工具参数 schema 中定位节点。
 * 返回命中节点与归一化后的 pointer，未命中返回 undefined。
 */
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

/** 把工具投影为 capability，便于统一能力目录查询。 */
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

function toolToSummary(scenarioId: string, tool: AiScenarioTool, critical: boolean): AiToolSummary {
  return {
    name: tool.name,
    description: tool.description,
    scenarioId,
    ...(tool.registration?.category !== undefined ? { category: tool.registration.category } : {}),
    ...(tool.registration?.tags !== undefined ? { tags: tool.registration.tags } : {}),
    ...(tool.registration?.execution !== undefined ? { execution: tool.registration.execution } : {}),
    critical,
  }
}

/** 汇总显式 capability + 工具 capability。 */
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

/**
 * 安全执行 legacy buildSteps。
 * 若用户场景实现抛错，避免影响 query 层，返回空步骤。
 */
function safeBuildLegacySteps(scenario: AiScenarioDefinition): readonly AiScenarioStep[] {
  try {
    return scenario.buildSteps?.({}, { userInput: '' } as AiScenarioContext) ?? []
  } catch {
    return []
  }
}

function resolveScenarioFlow(scenario: AiScenarioDefinition): AiScenarioFlowInfo {
  if (scenario.flow !== undefined) {
    return { scenarioId: scenario.id, flow: scenario.flow, source: 'registered' }
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

  return { scenarioId: scenario.id, flow: { steps: [] }, source: 'empty' }
}

/** 从流程契约提取关键工具集合。 */
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

/** 注册前基础校验：id 与工具名不能为空且工具名不能重复。 */
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

/**
 * 在场景集合中查找指定工具。
 * - 可选 scenarioId 做范围收敛，避免跨场景同名工具歧义。
 */
function findScenarioTool(
  scenarios: Iterable<AiScenarioDefinition>,
  toolName: string,
  scenarioId?: string,
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
// 查询阶段 6：工具函数映射解析
// ═══════════════════════════════════════════════════════════════════════════
// 语义优先级：
// 1) 显式注册：tool.registration.functions
// 2) 兼容回退：tool.name -> function.name + default payload(投影 tool.parameters)

/**
 * 构建兼容默认函数映射。
 *
 * 用途：当工具未显式声明 functions 时，确保 queryToolFunctions 仍返回稳定结果，
 * 让上层在“注册不完整”情况下也能按协议继续查询与展示。
 */
function buildDefaultToolFunction(tool: AiScenarioTool): AiScenarioToolFunctionRegistration {
  return {
    name: tool.name,
    description: tool.description,
    ...(tool.parameters !== undefined
      ? {
          payloads: [
            {
              name: 'default',
              description: '默认参数货载，复用工具 parameters。',
              schema: tool.parameters,
              ...(tool.parameters.required !== undefined ? { required: tool.parameters.required } : {}),
              ...(tool.registration?.example !== undefined ? { examples: [tool.registration.example] } : {}),
            },
          ],
        }
      : {}),
  }
}

/**
 * 解析工具函数映射（显式优先，兼容回退）。
 */
function resolveToolFunctions(tool: AiScenarioTool): readonly AiScenarioToolFunctionRegistration[] {
  const functions = tool.registration?.functions
  if (functions !== undefined && functions.length > 0) {
    return functions
  }
  return [buildDefaultToolFunction(tool)]
}

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：注册中心接口
// ═══════════════════════════════════════════════════════════════════════════

export interface AiScenarioRegistry extends AiScenarioQueryProtocol {
  register: (scenario: AiScenarioDefinition) => void
  unregister: (scenarioId: string) => boolean
  clear: () => void
  get: (scenarioId: string) => AiScenarioDefinition | undefined
  list: () => readonly AiScenarioDefinition[]
  resolve: (input: string, ctx: AiScenarioContext) => AiScenarioResolution | undefined
}

/**
 * 注册中心可选扩展：
 * 允许 runtime 把历史查询能力以代理形式挂到 registry 协议层。
 */
export interface AiScenarioRegistryOptions {
  queryRunHistory?: (query?: AiScenarioHistoryQuery) => AiScenarioHistoryPage
  queryRunRecord?: (runId: string) => AiScenarioRunRecord | undefined
}

// ═══════════════════════════════════════════════════════════════════════════
// 流程分区：注册中心实现
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 创建场景注册中心（Registry）。
 *
 * 用途：管理场景注册生命周期并实现协议化的查询接口（AiScenarioQueryProtocol），
 * 供 planner/LLM/runtime 在分级查询流程中逐步调用。
 *
 * 推荐调用顺序（时序）：
 * 1) registry.queryIntentCatalog() — 发现可选场景
 * 2) registry.queryScenarioInfo(scenarioId) — 获取场景详情
 * 3) registry.queryScenarioTools(...) — 按需分页查工具
 * 4) registry.queryToolSchemaNode(...) / queryToolSchema(...) — 精查参数结构
 * 5) registry.queryToolRegistration(...) — 读取规则/示例/修复提示
 * 6) registry.queryToolFunctions(...) — 读取工具函数映射（工具 -> 函数 -> payload）
 *
 * 参数：
 * - initial: 启动时预注册的场景数组。
 * - options: 可注入 runtime 的历史查询代理（queryRunHistory / queryRunRecord）。
 */
export function createScenarioRegistry(
  initial: readonly AiScenarioDefinition[] = [],
  options: AiScenarioRegistryOptions = {},
): AiScenarioRegistry {
  const map = new Map<string, AiScenarioDefinition>()

  // ----------------------------------------------
  // 阶段 0：外部代理能力接入
  // ----------------------------------------------

  /** 运行历史分页查询代理；未注入时返回空结果。 */
  function queryRunHistory(query?: AiScenarioHistoryQuery): AiScenarioHistoryPage {
    if (options.queryRunHistory !== undefined) {
      return options.queryRunHistory(query)
    }
    const { offset, limit } = toPage()
    return {
      total: 0,
      offset: query?.offset ?? offset,
      limit: query?.limit ?? limit,
      hasMore: false,
      items: [],
    }
  }

  /** 单条运行记录查询代理。 */
  function queryRunRecord(runId: string): AiScenarioRunRecord | undefined {
    if (options.queryRunRecord === undefined) return undefined
    const lookupId = runId.trim()
    if (lookupId === '') return undefined
    return options.queryRunRecord(lookupId)
  }

  // ----------------------------------------------
  // 阶段 1：初始化初始场景
  // ----------------------------------------------

  for (const scenario of initial) {
    validateScenarioRegistration(scenario)
    map.set(scenario.id, scenario)
  }

  /**
   * 注册或覆盖场景。
   * 同 id 再次注册时采用覆盖语义（Map.set）。
   */
  function register(scenario: AiScenarioDefinition): void {
    validateScenarioRegistration(scenario)
    map.set(scenario.id, scenario)
  }

  /** 注销单个场景，返回是否命中。 */
  function unregister(scenarioId: string): boolean {
    return map.delete(scenarioId)
  }

  /** 清空全部场景。 */
  function clear(): void {
    map.clear()
  }

  /** 按 id 获取场景。 */
  function get(scenarioId: string): AiScenarioDefinition | undefined {
    return map.get(scenarioId)
  }

  /** 获取当前全部注册场景快照。 */
  function list(): readonly AiScenarioDefinition[] {
    return Array.from(map.values())
  }

  /**
   * 场景路由：从用户输入解析最匹配场景。
   * 优先级：
   * 1) matchIntent 自定义匹配（若实现）
   * 2) intents 关键词评分
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

      const score = keywordMatchScore(input, getScenarioKeywords(scenario))
      if (score <= 0) continue
      if (best === undefined || score > best.score) {
        best = { scenario, score }
      }
    }

    return best
  }

  // ----------------------------------------------
  // 查询协议实现（按协议时序分层）
  // ----------------------------------------------

  /**
   * 步骤 1：意图目录查询。
   *
   * 返回值说明：
   * - entries: 每个条目为场景的轻量化元数据，供 LLM 或路由器快速浏览使用，
   *   不包含运行时实现（如 execute），仅用于发现与匹配。
   * - summary: 优先使用场景的 description；无描述时自动生成兜底文案，便于在提示词中直接展示。
   *
   * 使用建议（对 LLM）：
   * - 首先调用此 API 构建可选场景目录，再用分级查询协议精查目标场景详情。
   */
  function queryIntentCatalog(): AiIntentCatalog {
    const entries: AiIntentCatalogEntry[] = []
    for (const scenario of map.values()) {
      const keywords = getScenarioKeywords(scenario)
      const tools = getScenarioTools(scenario)
      const toolNames = tools.map((tool) => tool.name)
      const staticPrompt = scenario.promptPolicy.systemPrompt
      const prompt = typeof staticPrompt === 'string' ? staticPrompt : undefined
      entries.push({
        scenarioId: scenario.id,
        title: scenario.title,
        ...(prompt !== undefined && prompt !== '' ? { prompt } : {}),
        intents: keywords,
        summary: scenario.description ?? `场景标题：${scenario.title}。触发关键词：${keywords.join('、')}。可用工具：${toolNames.join('、')}。`,
      })
    }
    return { entries }
  }

  /** 步骤 2：场景详情查询。 */
  function queryScenarioInfo(scenarioId: string): AiScenarioInfo | undefined {
    const scenario = map.get(scenarioId)
    if (scenario === undefined) return undefined
    const flowInfo = resolveScenarioFlow(scenario)
    const staticPrompt = scenario.promptPolicy.systemPrompt
    const systemPrompt = typeof staticPrompt === 'function' ? '' : (staticPrompt ?? '')
    const criticalTools = listCriticalTools(flowInfo.flow)
    const tools: AiToolSummary[] = scenario.tools.map((tool) => toolToSummary(scenario.id, tool, criticalTools.has(tool.name)))
    return {
      scenarioId: scenario.id,
      title: scenario.title,
      ...(systemPrompt !== '' ? { prompt: systemPrompt } : {}),
      ...(scenario.description !== undefined ? { description: scenario.description } : {}),
      systemPrompt,
      defaultSteps: flowInfo.flow.steps.map((step) => ({
        id: step.id,
        title: step.title,
        description: step.description ?? (step.critical ? `[关键步骤] ${step.tool ?? step.tools?.join('、') ?? step.kind ?? '流程步骤'}` : `${step.tool ?? step.tools?.join('、') ?? step.kind ?? '流程步骤'}`),
      })),
      tools,
      capabilities: listScenarioCapabilities(scenario),
    }
  }

  /** 步骤 2.5：能力目录查询。 */
  function queryScenarioCapabilities(query?: AiScenarioCapabilitiesQuery): AiScenarioCapabilitiesPage {
    const { offset, limit } = toCapabilitiesPage(query)
    const scenarioId = query?.scenarioId?.trim()
    const keyword = query?.keyword?.trim().toLowerCase()
    const all: AiScenarioCapability[] = []
    for (const scenario of map.values()) {
      if (scenarioId !== undefined && scenarioId !== '' && scenario.id !== scenarioId) continue
      for (const capability of listScenarioCapabilities(scenario)) {
        if (keyword !== undefined && keyword !== '') {
          const haystack = [capability.id, capability.title, capability.kind, capability.description, ...(capability.tags ?? []), ...(capability.relatedTools ?? [])].join(' ').toLowerCase()
          if (!haystack.includes(keyword)) continue
        }
        all.push(capability)
      }
    }
    const items = all.slice(offset, offset + limit)
    return { total: all.length, offset, limit, hasMore: offset + items.length < all.length, items }
  }

  /** 步骤 2.6：payload 契约查询。 */
  function queryScenarioPayload(scenarioId: string): AiScenarioPayloadInfo | undefined {
    const scenario = map.get(scenarioId)
    if (scenario === undefined) return undefined
    return { scenarioId: scenario.id, payload: scenario.payload }
  }

  /** 步骤 2.7：流程契约查询。 */
  function queryScenarioFlow(scenarioId: string): AiScenarioFlowInfo | undefined {
    const scenario = map.get(scenarioId)
    if (scenario === undefined) return undefined
    return resolveScenarioFlow(scenario)
  }

  /** 步骤 2.8：闭合契约查询。 */
  function queryScenarioCompletion(scenarioId: string): AiScenarioCompletionInfo | undefined {
    const scenario = map.get(scenarioId)
    if (scenario === undefined) return undefined
    return { scenarioId: scenario.id, completion: scenario.completion }
  }

  /** 步骤 2.9：恢复建议查询。 */
  function queryScenarioRecovery(scenarioId: string): AiScenarioRecoveryInfo | undefined {
    const scenario = map.get(scenarioId)
    if (scenario === undefined) return undefined
    return { scenarioId: scenario.id, recovery: scenario.recovery ?? [] }
  }

  /** 步骤 3：工具目录分页查询。 */
  function queryScenarioTools(query?: AiScenarioToolsQuery): AiScenarioToolsPage {
    const { offset, limit } = toPage(query)
    const scenarioId = query?.scenarioId?.trim()
    const category = query?.category?.trim()
    const keyword = query?.keyword?.trim().toLowerCase()
    const all: AiToolSummary[] = []
    for (const scenario of map.values()) {
      if (scenarioId !== undefined && scenarioId !== '' && scenario.id !== scenarioId) continue
      const criticalTools = listCriticalTools(resolveScenarioFlow(scenario).flow)
      for (const tool of scenario.tools) {
        if (category !== undefined && category !== '' && tool.registration?.category !== category) continue
        if (keyword !== undefined && keyword !== '') {
          const haystack = [tool.name, tool.description, tool.registration?.category ?? '', ...(tool.registration?.tags ?? [])].join(' ').toLowerCase()
          if (!haystack.includes(keyword)) continue
        }
        all.push(toolToSummary(scenario.id, tool, criticalTools.has(tool.name)))
      }
    }
    const items = all.slice(offset, offset + limit)
    return { total: all.length, offset, limit, hasMore: offset + items.length < all.length, items }
  }

  /** 步骤 4A：完整 Schema 查询。 */
  function queryToolSchema(toolName: string, scenarioId?: string): AiToolSchemaInfo | undefined {
    const resolved = findScenarioTool(map.values(), toolName, scenarioId)
    if (resolved === undefined) return undefined
    return {
      scenarioId: resolved.scenario.id,
      toolName: resolved.tool.name,
      description: resolved.tool.description,
      parameters: resolved.tool.parameters,
      examples: resolved.tool.registration?.example !== undefined ? [{ description: '注册示例', args: resolved.tool.registration.example }] : [],
    }
  }

  /** 步骤 4B：节点级 Schema 查询。 */
  function queryToolSchemaNode(query: AiToolSchemaNodeQuery): AiToolSchemaNodeInfo | undefined {
    const lookupName = query.toolName.trim()
    if (lookupName === '') return undefined
    const resolvedTool = findScenarioTool(map.values(), lookupName, query.scenarioId)
    if (resolvedTool === undefined) return undefined
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

  /** 步骤 5：工具注册元数据查询。 */
  function queryToolRegistration(toolName: string, scenarioId?: string): AiToolRegistrationInfo | undefined {
    const lookupName = toolName.trim()
    if (lookupName === '') return undefined
    const resolved = findScenarioTool(map.values(), lookupName, scenarioId)
    if (resolved === undefined) return undefined
    const { scenario, tool } = resolved
    return {
      scenarioId: scenario.id,
      toolName: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      // 对未声明 registration 的工具返回可用默认注册信息，避免上层额外兜底。
      registration: tool.registration ?? {
        rules: ['调用前必须先查询 queryToolSchemaNode 或 queryToolSchema'],
        failureCodes: ['INVALID_PARAMS', 'TOOL_EXEC_FAILED'],
        fixHints: ['按 parameters 的 required 字段补齐参数后重试'],
        functions: resolveToolFunctions(tool),
      },
    }
  }

  /**
   * 步骤 6：工具函数映射查询。
   *
   * 行为约定：
   * - 空 toolName 返回 undefined（fail-fast 输入校验）。
   * - 工具不存在返回 undefined（协议约定：查询不抛错）。
   * - 工具存在时，返回“显式映射或兼容回退映射”。
   */
  function queryToolFunctions(toolName: string, scenarioId?: string): AiToolFunctionsInfo | undefined {
    const lookupName = toolName.trim()
    if (lookupName === '') return undefined
    const resolved = findScenarioTool(map.values(), lookupName, scenarioId)
    if (resolved === undefined) return undefined
    const { scenario, tool } = resolved
    return {
      scenarioId: scenario.id,
      toolName: tool.name,
      description: tool.description,
      functions: resolveToolFunctions(tool),
    }
  }

  // ----------------------------------------------
  // 阶段 2：对外暴露 registry API
  // ----------------------------------------------

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
    queryToolFunctions,
    queryRunHistory,
    queryRunRecord,
  }
}
