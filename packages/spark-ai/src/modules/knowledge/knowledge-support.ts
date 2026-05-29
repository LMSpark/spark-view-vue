/**
 * ═══════════════════════════════════════════════════════════════
 * modules/knowledge/knowledge-support.ts — 知识投影共享辅助函数
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】knowledge 层的 helper 函数库。被 AiModuleKnowledgeProjector
 *   独家消费，提供字符串处理、schema 查询、lookup 步骤生成、payload 目录发现、
 *   关键字匹配、guide 输入解析、函数/kind 层投影等基础能力。
 *
 * 【函数分类】
 *   字符串工具     — normalizeOptionalText / normalizeTextList / uniqueTexts / containsKeyword
 *   Schema 工具    — paramNames / requiredParamNames
 *   属性与 payload — attributeAccessMode / payloadRefsForFunction / formatPayloadBinding
 *   Lookup 步骤    — createFunctionLookupSteps / createPayloadLookupSteps / createInstanceLookupSteps 等
 *   Payload 目录   — discoverPayloadCatalogs / formatPayloadCatalogLocator
 *   关键字匹配     — moduleSummaryGuidesMatchKeyword / childSummaryMatchesKeyword
 *   Guide 解析     — parseGuideInput / buildHumanQuestion
 *   投影函数       — summarizeFunction / createGuide / createKindLayer / summarizeChildKind
 *   Prompt 索引    — formatPromptKindIndexLine
 *
 * 【消费方】ai-module-knowledge.ts（AiModuleKnowledgeProjector 的所有方法）
 * ═══════════════════════════════════════════════════════════════
 */

import type { AiJsonSchemaObject, AiJsonValue } from '../../json'
import { resolveAiModulePath } from '../internal/ai-module-path'
import { PROTOCOL_TOOL_NAMES } from '../internal/protocol-tool-generator'
import type { AiModule, AiModulePayloadMetadata } from '../protocol'
import type {
  FunctionKnowledgeProjectionOptions,
  FunctionLookupStepsOptions,
  KindLayerOptions,
  AiModuleKnowledgeAttributeAccessMode,
  AiModuleKnowledgeAttributeGuide,
  AiModuleKnowledgeChildKindSummary,
  AiModuleKnowledgeFunctionGuide,
  AiModuleKnowledgeFunctionGuideInput,
  AiModuleKnowledgeFunctionSummary,
  AiModuleKnowledgeInstanceGuide,
  AiModuleKnowledgeKindLayer,
  AiModuleKnowledgeLayerFunction,
  AiModuleKnowledgeModuleSummary,
  ParsedKnowledgeFunction,
  PayloadCatalogDescriptor,
  PayloadLookupStepsOptions,
} from './knowledge-types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 常量
// ═══════════════════════════════════════════════════════════════

/** payload 目录的固定函数名 */
export const PAYLOAD_QUERY_FUNCTION_NAME = 'queryPayloads'
export const PAYLOAD_GUIDE_FUNCTION_NAME = 'guidePayload'

/** 固定协议工具路由描述（注入 LLM 系统 prompt） */
export const FIXED_PROTOCOL_TOOL_ROUTING_LINES: readonly string[] = [
  '协议硬约束：调用 module_* 或 human_question 时，必须使用 OpenAI function calling 的 tool_calls 通道；不要在正文中输出 {"tool_call":...}、module_call(...)、JSON 方案或代码块来冒充工具调用。',
  '如果下一步需要读取/写入/校验/创建任何注册能力事实，必须发起真实 tool_calls；正文只能用于没有工具调用后的最终总结。',
  '工具：目录=module_query；模块指南=module_guide；属性指南=module_attribute_guide；函数指南=module_function_guide；实例=module_find；属性=module_attr；函数=module_call；反问=human_question。',
  '所有知识都先目录概要后具体指南：先用 query 类工具选真实 kind/function/key，再用 guide 类工具读取具体契约。',
  'module_find 只定位实例，不代表已掌握函数表；首次 module_call 某 kind/functionName 前，先 module_query({kind,includeFunctions:true}) 选真实函数，再 module_function_guide({kind,functionName}) 读具体契约。',
  '禁止猜 functionName/attrName；FUNCTION_NOT_DECLARED 或 ATTRIBUTE_NOT_DECLARED 后必须回到 module_query/module_guide，再按 module_function_guide/module_attribute_guide 返回的真实契约重试。',
]

/** prompt 中最多展示的 kind 索引数量 */
export const PROMPT_KIND_INDEX_LIMIT = 12

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 字符串工具
// ═══════════════════════════════════════════════════════════════

/** 规范化可选文本：trim 后为空的返回 undefined */
export function normalizeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim()
  return normalized.length === 0 ? undefined : normalized
}

/** 规范化字符串列表：trim → 去空 → 去重 */
export function normalizeTextList(values: readonly string[] | undefined): readonly string[] {
  if (values === undefined) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const normalized = value.trim()
    if (normalized.length === 0 || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

/** 字符串列表去重（保留首次出现顺序） */
export function uniqueTexts(values: readonly string[]): readonly string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const normalized = value.trim()
    if (normalized.length === 0 || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

/** 列表中是否有包含 keyword 的字符串（大小写不敏感） */
export function containsKeyword(values: readonly string[], keyword: string): boolean {
  return values.some((value) => value.toLowerCase().includes(keyword))
}

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 工具名与调用格式
// ═══════════════════════════════════════════════════════════════

/** 生成统一的工具名（当前所有函数统一映射到 module_call） */
export function functionToolName(kindPath: readonly string[], functionName: string): string {
  void kindPath
  void functionName
  return PROTOCOL_TOOL_NAMES.moduleCall
}

/** 格式化函数调用示例文本 */
export function formatInvokeStep(kindPath: readonly string[], functionName: string): string {
  const path = kindPath.map((kind) => `/${kind}[<${kind}Id>]`).join('')
  return `${PROTOCOL_TOOL_NAMES.moduleCall}({ path: "${path}", functionName: "${functionName}", args })`
}

function formatPathPattern(kindPath: readonly string[]): string {
  return kindPath.map((kind) => `/${kind}[<${kind}Id>]`).join('')
}

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · Schema 工具
// ═══════════════════════════════════════════════════════════════

/** 获取 schema 中所有属性名 */
export function paramNames(schema: AiJsonSchemaObject): readonly string[] {
  return Object.keys(schema.properties ?? {})
}

/** 获取 schema 中的必填参数名列表 */
export function requiredParamNames(schema: AiJsonSchemaObject): readonly string[] {
  return schema.required ?? []
}

// ═══════════════════════════════════════════════════════════════
// 第 5 节 · 属性与 payload 工具
// ═══════════════════════════════════════════════════════════════

/** 根据 readable/writable 推导属性访问模式 */
export function attributeAccessMode(
  readable: boolean,
  writable: boolean,
): AiModuleKnowledgeAttributeAccessMode {
  if (readable && writable) return 'read-write'
  if (readable) return 'read'
  if (writable) return 'write'
  return 'none'
}

/** 获取模块声明中与指定函数关联的 payloadRef 列表 */
export function payloadRefsForFunction(
  payloads: readonly AiModulePayloadMetadata[],
  functionName: string,
): readonly string[] {
  return payloads
    .filter((payload) => {
      const requiredForFunctions = payload.requiredForFunctions ?? []
      return requiredForFunctions.length === 0 || requiredForFunctions.includes(functionName)
    })
    .map((payload) => payload.payloadRef)
}

/** 格式化 payload 绑定信息（用于展示） */
export function formatPayloadBinding(payload: AiModulePayloadMetadata): string {
  const functions = payload.requiredForFunctions ?? []
  if (functions.length === 0) return payload.payloadRef
  return `${payload.payloadRef}(functions=${functions.join('|')})`
}

// ═══════════════════════════════════════════════════════════════
// 第 6 节 · Lookup 步骤生成器
// ═══════════════════════════════════════════════════════════════

/** 生成函数查找步骤（query → guide → call 三阶段） */
export function createFunctionLookupSteps(options: FunctionLookupStepsOptions): readonly string[] {
  const keyword = options.functionName ?? '<functionName 或业务关键词>'
  const functionName = options.functionName ?? '<functionName>'
  return [
    `目录阶段：调用 module_query({ kind: "${options.kind}", keyword: "${keyword}", includeFunctions: true }) 查函数概要，选择真实 functionName。`,
    `具体阶段：调用 module_function_guide({ kind: "${options.kind}", functionName: "${functionName}" }) 读取 paramsSchema、usageRules 和 failureModes。`,
    `随后调用 module_call({ path, functionName: "${functionName}", args }) 执行业务函数。`,
  ]
}

// ═══════════════════════════════════════════════════════════════
// 第 7 节 · Payload 目录发现与格式化
// ═══════════════════════════════════════════════════════════════

/** 发现已注册的 payload 目录模块（同时声明 queryPayloads 和 guidePayload 的模块） */
export function discoverPayloadCatalogs(kinds: readonly AiModule[]): readonly PayloadCatalogDescriptor[] {
  return kinds
    .filter((moduleKind) =>
      moduleKind.functions.some((fn) => fn.name === PAYLOAD_QUERY_FUNCTION_NAME)
      && moduleKind.functions.some((fn) => fn.name === PAYLOAD_GUIDE_FUNCTION_NAME)
    )
    .map((moduleKind) => ({
      kind: moduleKind.kind,
      kindPath: resolveAiModulePath(moduleKind, kinds),
      ...(moduleKind.parentKind === undefined ? {} : { parentKind: moduleKind.parentKind }),
    }))
}

/** 生成 payload 查找步骤（定位目录 → 查询 → 读取指南 → 构造参数） */
export function createPayloadLookupSteps(options: PayloadLookupStepsOptions): readonly string[] {
  if (options.payloadRefs.length === 0) return []
  const payloadCatalogs = requirePayloadCatalogs(options)
  const catalogLocator = formatPayloadCatalogLocator(payloadCatalogs)
  const catalogFunctions = formatPayloadCatalogFunctionNames(payloadCatalogs)
  const catalogPathPattern = formatPayloadCatalogPathPattern(payloadCatalogs)
  const finalFunctionName = options.functionName ?? '<functionName>'
  return options.payloadRefs.flatMap((payloadRef) => [
    `先定位 payload 目录模块 ${catalogLocator}; 没有实例路径时用 module_find 获取目录实例。`,
    `目录阶段：调用 module_call({ path: "${catalogPathPattern}", functionName: "${catalogFunctions.queryPayloads}", args: { moduleKind: "${options.kind}", payloadRef: "${payloadRef}", keyword/category/key, limit } }) 查询概要并选择真实 key。`,
    `具体阶段：调用 module_call({ path: "${catalogPathPattern}", functionName: "${catalogFunctions.guidePayload}", args: { moduleKind: "${options.kind}", payloadRef: "${payloadRef}", key } }) 读取 paramsSchema、usageRules 和 failureModes。`,
    `最后调用 module_call({ path, functionName: "${finalFunctionName}", args }); 复杂参数只能按 guidePayload 返回的 schema 字段构造。`,
  ])
}

/** 断言 payload 目录存在，否则抛出明确错误 */
function requirePayloadCatalogs(options: PayloadLookupStepsOptions): readonly PayloadCatalogDescriptor[] {
  if (options.payloadCatalogs.length > 0) return options.payloadCatalogs
  throw new Error(
    `AiModule "${options.kind}" declares payloadRef ${options.payloadRefs.join(', ')} but no payload catalog AiModule is registered. ` +
    `Register a AiModule with functions "${PAYLOAD_QUERY_FUNCTION_NAME}" and "${PAYLOAD_GUIDE_FUNCTION_NAME}" before projecting knowledge.`,
  )
}

function formatPayloadCatalogFunctionNames(catalogs: readonly PayloadCatalogDescriptor[]): { queryPayloads: string, guidePayload: string } {
  const [catalog] = catalogs
  if (catalog === undefined) throw new Error('payload catalog descriptor is required')
  void catalog
  return { queryPayloads: PAYLOAD_QUERY_FUNCTION_NAME, guidePayload: PAYLOAD_GUIDE_FUNCTION_NAME }
}

function formatPayloadCatalogPathPattern(catalogs: readonly PayloadCatalogDescriptor[]): string {
  const [catalog] = catalogs
  if (catalog === undefined) throw new Error('payload catalog descriptor is required')
  return catalog.kindPath.map((kind) => `/${kind}[<${kind}Id>]`).join('')
}

function formatPayloadCatalogLocator(catalogs: readonly PayloadCatalogDescriptor[]): string {
  if (catalogs.length === 0) throw new Error('payload catalog descriptor is required')
  return catalogs.map((catalog) =>
    catalog.parentKind === undefined ? catalog.kind : `${catalog.parentKind}/${catalog.kind}`
  ).join('|')
}

// ═══════════════════════════════════════════════════════════════
// 第 8 节 · 关键字匹配
// ═══════════════════════════════════════════════════════════════

/** 检查模块摘要是否匹配关键字（递归检查所有 guide 文本） */
export function moduleSummaryGuidesMatchKeyword(
  summary: AiModuleKnowledgeModuleSummary,
  keyword: string,
): boolean {
  return containsKeyword([
    summary.pathPattern,
    ...summary.instanceGuide.queryFields,
    ...summary.instanceGuide.discoverySteps,
    ...summary.instanceGuide.pathBuildSteps,
    ...summary.instanceGuide.operationSteps,
    ...summary.instanceLookupSteps,
    ...summary.childLookupSteps,
    ...summary.attributeLookupSteps,
    ...summary.functionLookupSteps,
  ], keyword)
    || summary.attributeGuides.some((attribute) => containsKeyword([
      attribute.knowledgeLevel,
      attribute.name,
      attribute.description,
      attribute.access,
      attribute.detailToolName,
      attribute.detailLookupStep,
      attribute.readStep ?? '',
      attribute.writeStep ?? '',
    ], keyword))
    || summary.functionGuides.some((fn) => containsKeyword([
      fn.toolName,
      fn.functionName,
      fn.description,
      fn.detailToolName,
      fn.detailLookupStep,
      fn.invokeStep,
      ...fn.lookupSteps,
      ...fn.payloadRefs,
    ], keyword))
    || summary.childKindSummaries.some((child) => childSummaryMatchesKeyword(child, keyword))
    || summary.instanceGuide.queryExamples.some((example) =>
      Object.entries(example).some(([key, value]) =>
        key.toLowerCase().includes(keyword)
        || String(value).toLowerCase().includes(keyword),
      )
    )
}

function childSummaryMatchesKeyword(
  child: AiModuleKnowledgeChildKindSummary,
  keyword: string,
): boolean {
  return containsKeyword([
    child.kind,
    child.name,
    child.description,
    ...child.functionNames,
    ...child.attributeNames,
    ...child.payloadRefs,
    ...child.childKindNames,
  ], keyword)
    || child.attributeSummaries.some((attribute) => containsKeyword([
      attribute.knowledgeLevel,
      attribute.name,
      attribute.description,
      attribute.access,
      attribute.detailLookupStep,
    ], keyword))
    || child.functionSummaries.some((fn) => containsKeyword([
      fn.functionName,
      fn.description,
      fn.detailLookupStep,
      ...fn.payloadRefs,
    ], keyword))
    || containsKeyword(child.detailLookupSteps, keyword)
}

// ═══════════════════════════════════════════════════════════════
// 第 9 节 · Guide 输入解析
// ═══════════════════════════════════════════════════════════════

/** 解析函数 guide 输入：kind + functionName 均为非空时返回 ParsedKnowledgeFunction */
export function parseGuideInput(input: AiModuleKnowledgeFunctionGuideInput): ParsedKnowledgeFunction | null {
  const kind = input.kind?.trim()
  const functionName = input.functionName?.trim()
  if (kind === undefined || kind.length === 0 || functionName === undefined || functionName.length === 0) return null
  return { kind, functionName }
}

/** 构建人工提问文本 */
export function buildHumanQuestion(
  missingFacts: readonly string[],
  candidateOptions: readonly string[],
): string {
  const factText = missingFacts.length === 1
    ? missingFacts[0]
    : missingFacts.map((fact, index) => `${String(index + 1)}. ${fact}`).join('；')
  const options = candidateOptions.length === 0 ? '' : ` 可选项：${candidateOptions.join(' / ')}。`
  return `为了继续处理，我需要你确认：${factText}。${options}`
}

// ═══════════════════════════════════════════════════════════════
// 第 10 节 · 函数投影
// ═══════════════════════════════════════════════════════════════

/** 投影单个函数为摘要 */
export function summarizeFunction(options: FunctionKnowledgeProjectionOptions): AiModuleKnowledgeFunctionSummary {
  const { kind, kindPath, fn, payloads, payloadCatalogs } = options
  const payloadRefs = payloadRefsForFunction(payloads, fn.name)
  const toolName = functionToolName(kindPath, fn.name)
  const paramList = paramNames(fn.paramsSchema)
  return {
    knowledgeLevel: 'directory',
    toolName,
    kindPath,
    kind,
    functionName: fn.name,
    description: fn.description,
    detailToolName: PROTOCOL_TOOL_NAMES.moduleFunctionGuide,
    detailLookupStep: formatFunctionGuideLookupStep(kind, fn.name),
    hasParams: paramList.length > 0,
    hasUsageRules: (fn.usageRules?.length ?? 0) > 0,
    hasFailureModes: (fn.failureModes?.length ?? 0) > 0,
    usageRuleCount: fn.usageRules?.length ?? 0,
    failureModeCount: fn.failureModes?.length ?? 0,
    functionLookupSteps: createFunctionLookupSteps({ kind, kindPath, functionName: fn.name }),
    payloadRefs,
    requiresPayloadGuide: payloadRefs.length > 0,
    payloadLookupSteps: createPayloadLookupSteps({
      kind,
      kindPath,
      functionName: fn.name,
      payloadRefs,
      payloadCatalogs,
    }),
  }
}

/** 投影单个函数为完整指南 */
export function createGuide(options: FunctionKnowledgeProjectionOptions): AiModuleKnowledgeFunctionGuide {
  const { kind, kindPath, fn, payloads, payloadCatalogs } = options
  const payloadRefs = payloadRefsForFunction(payloads, fn.name)
  const toolName = functionToolName(kindPath, fn.name)
  const pathPattern = formatPathPattern(kindPath)
  const payloadLookupSteps = createPayloadLookupSteps({
    kind,
    kindPath,
    functionName: fn.name,
    payloadRefs,
    payloadCatalogs,
  })
  return {
    knowledgeLevel: 'detail',
    toolName,
    kindPath,
    kind,
    functionName: fn.name,
    description: fn.description,
    directoryLookupStep: `module_query({ kind: "${kind}", keyword: "${fn.name}", includeFunctions: true })`,
    callPattern: {
      toolName: PROTOCOL_TOOL_NAMES.moduleCall,
      path: pathPattern,
      functionName: fn.name,
      args: 'object matching paramsSchema',
    },
    paramNames: paramNames(fn.paramsSchema),
    requiredParamNames: requiredParamNames(fn.paramsSchema),
    paramsSchema: fn.paramsSchema,
    ...(fn.resultSchema === undefined ? {} : { resultSchema: fn.resultSchema }),
    usageRules: fn.usageRules ?? [],
    requiredBeforeCall: fn.requiredBeforeCall ?? [],
    failureModes: fn.failureModes ?? [],
    recoveryHints: createFunctionRecoveryHints({
      kind,
      functionName: fn.name,
      requiredBeforeCall: fn.requiredBeforeCall ?? [],
      failureModes: fn.failureModes ?? [],
      payloadLookupSteps,
    }),
    functionLookupSteps: createFunctionLookupSteps({ kind, kindPath, functionName: fn.name }),
    payloadRefs,
    requiresPayloadGuide: payloadRefs.length > 0,
    payloadLookupSteps,
    examples: fn.examples ?? [],
    antiExamples: fn.antiExamples ?? [],
  }
}

function createFunctionRecoveryHints(options: Readonly<{
  kind: string
  functionName: string
  requiredBeforeCall: readonly string[]
  failureModes: ReadonlyArray<Readonly<{ code: string, fix: string }>>
  payloadLookupSteps: readonly string[]
}>): readonly string[] {
  return [
    `参数或路径失败时，先重新调用 module_function_guide({ kind: "${options.kind}", functionName: "${options.functionName}" }) 对照 paramsSchema、requiredBeforeCall 和 failureModes。`,
    '如果 path 不存在，先用 module_find 从根实例或父实例重新定位 path。',
    ...options.requiredBeforeCall.map((step) => `调用前置条件：${step}`),
    ...options.failureModes.map((mode) => `遇到 ${mode.code} 时：${mode.fix}`),
    ...options.payloadLookupSteps.map((step) => `复杂参数恢复：${step}`),
  ]
}

// ═══════════════════════════════════════════════════════════════
// 第 11 节 · Kind 层投影
// ═══════════════════════════════════════════════════════════════

/** 投影单个模块为知识层次结构（属性 + 函数 + 子kind + 荷载指南） */
export function createKindLayer(options: KindLayerOptions): AiModuleKnowledgeKindLayer {
  const { moduleKind, allKinds, payloadCatalogs } = options
  const kindPath = resolveAiModulePath(moduleKind, allKinds)
  return {
    kind: moduleKind.kind,
    name: moduleKind.name,
    description: moduleKind.description,
    ...(moduleKind.parentKind === undefined ? {} : { parentKind: moduleKind.parentKind }),
    level: kindLayerLevel(moduleKind, allKinds),
    pathPattern: createPathPattern(moduleKind),
    instanceGuide: createInstanceGuide(moduleKind),
    instanceLookupSteps: createInstanceLookupSteps(moduleKind),
    childLookupSteps: createChildLookupSteps(moduleKind, allKinds),
    attributeLookupSteps: createAttributeLookupSteps(moduleKind),
    functionLookupSteps: createModuleFunctionLookupSteps(moduleKind, kindPath),
    payloadLookupSteps: createPayloadLookupSteps({
      kind: moduleKind.kind,
      kindPath,
      payloadRefs: moduleKind.payloads.map((payload) => payload.payloadRef),
      payloadCatalogs,
    }),
    attributes: createAttributeGuides(moduleKind),
    functions: createLayerFunctions(moduleKind, kindPath),
    childKinds: moduleKind.children.map((childKind) => summarizeChildKind(childKind, allKinds)),
  }
}

/** 为模块的每个属性生成属性指南 */
export function createAttributeGuides(moduleKind: AiModule): readonly AiModuleKnowledgeAttributeGuide[] {
  return moduleKind.attributes.map((attribute) => ({
    knowledgeLevel: 'directory',
    name: attribute.name,
    description: attribute.description,
    access: attributeAccessMode(attribute.readable, attribute.writable),
    readable: attribute.readable,
    writable: attribute.writable,
    detailToolName: PROTOCOL_TOOL_NAMES.moduleAttributeGuide,
    detailLookupStep: formatAttributeGuideLookupStep(moduleKind.kind, attribute.name),
    ...(attribute.readable ? { readStep: `module_attr({ op: "get", path, attrName: "${attribute.name}" })` } : {}),
    ...(attribute.writable ? { writeStep: `module_attr({ op: "set", path, attrName: "${attribute.name}", value })` } : {}),
  }))
}

/** 为模块的每个函数生成层次函数指南 */
export function createLayerFunctions(moduleKind: AiModule, kindPath: readonly string[]): readonly AiModuleKnowledgeLayerFunction[] {
  return moduleKind.functions.map((fn) => {
    const payloadRefs = payloadRefsForFunction(moduleKind.payloads, fn.name)
    const toolName = functionToolName(kindPath, fn.name)
    return {
      knowledgeLevel: 'directory',
      toolName,
      kindPath,
      functionName: fn.name,
      description: fn.description,
      detailToolName: PROTOCOL_TOOL_NAMES.moduleFunctionGuide,
      detailLookupStep: formatFunctionGuideLookupStep(moduleKind.kind, fn.name),
      lookupSteps: createFunctionLookupSteps({ kind: moduleKind.kind, kindPath, functionName: fn.name }),
      invokeStep: formatInvokeStep(kindPath, fn.name),
      payloadRefs,
      requiresPayloadGuide: payloadRefs.length > 0,
    }
  })
}

/** 计算模块在层次树中的层级（根为 0） */
export function kindLayerLevel(moduleKind: AiModule, allKinds: readonly AiModule[]): number {
  const kindPath = resolveAiModulePath(moduleKind, allKinds)
  return kindPath.length - 1
}

/** 生成路径模式（如 /Page[<PageId>]/Table[<TableId>]） */
export function createPathPattern(moduleKind: AiModule): string {
  const own = `/${moduleKind.kind}[<${moduleKind.kind}Id>]`
  if (moduleKind.parentKind === undefined) return own
  return `/<parentKind>[<parentId>]${own}`
}

/** 生成实例指南（refShape + pathPattern + queryFields + discoverySteps + pathBuildSteps + operationSteps） */
export function createInstanceGuide(moduleKind: AiModule): AiModuleKnowledgeInstanceGuide {
  const pathPattern = createPathPattern(moduleKind)
  return {
    refShape: '{ id: string, label: string, summary?: string }',
    pathPattern,
    discoveryScope: moduleKind.parentKind === undefined ? 'root' : 'parent',
    queryFields: createInstanceQueryFields(moduleKind),
    queryExamples: createInstanceQueryExamples(moduleKind),
    discoverySteps: createInstanceLookupSteps(moduleKind),
    pathBuildSteps: createInstancePathBuildSteps(moduleKind),
    operationSteps: [
      `用 module_guide({ kind: "${moduleKind.kind}" }) 读取元数据。`,
      `属性读写复用同一个实例 path：module_attr({ op, path, attrName, value })。`,
      `函数调用复用同一个实例 path：module_call({ path, functionName, args })。`,
      `进入子 kind 时，以当前实例 path 作为 parentPath 调用 module_find。`,
    ],
  }
}

/** 生成实例查询字段列表（id + label + keyword + hint + 所有属性名） */
export function createInstanceQueryFields(moduleKind: AiModule): readonly string[] {
  return uniqueTexts([
    'id',
    'label',
    'keyword',
    'hint',
    ...moduleKind.attributes.map((attribute) => attribute.name),
  ])
}

/** 生成实例查询示例（最多 6 个） */
export function createInstanceQueryExamples(
  moduleKind: AiModule,
): ReadonlyArray<Readonly<Record<string, AiJsonValue>>> {
  const examples: Array<Record<string, AiJsonValue>> = [
    { id: '<instanceId>' },
    { label: '<显示名>' },
    { keyword: '<关键词>' },
  ]
  for (const field of moduleKind.attributes.map((attribute) => attribute.name)) {
    if (examples.length >= 6) break
    if (field === 'id' || field === 'label' || field === 'keyword' || field === 'hint') continue
    examples.push({ [field]: `<${field}>` })
  }
  return examples
}

/** 生成实例查找步骤（根模块 vs 子模块） */
export function createInstanceLookupSteps(moduleKind: AiModule): readonly string[] {
  if (moduleKind.parentKind === undefined) {
    return [
      `module_find({ path: "/" }) 查看根级 kind。`,
      `module_find({ path: "/", childKind: "${moduleKind.kind}", query }) 获取 ${moduleKind.kind} 实例 id。`,
    ]
  }
  return [
    `先获得父路径 /${moduleKind.parentKind}[<parentId>]。`,
    `module_find({ path: parentPath, childKind: "${moduleKind.kind}" }) 查看 ${moduleKind.kind} 子实例。`,
    `module_find({ path: parentPath, childKind: "${moduleKind.kind}", query }) 获取 ${moduleKind.kind} 实例 id。`,
  ]
}

/** 生成实例路径构造步骤 */
export function createInstancePathBuildSteps(moduleKind: AiModule): readonly string[] {
  const segment = `${moduleKind.kind}[<instanceRef.id>]`
  if (moduleKind.parentKind === undefined) {
    return [
      `从 module_find({ path: "/", childKind: "${moduleKind.kind}", query }) 返回的 AiModuleInstanceRef.id 取实例 id。`,
      `拼接实例路径 /${segment}。`,
    ]
  }
  return [
    `保留父实例路径 parentPath。`,
    `从 module_find({ path: parentPath, childKind: "${moduleKind.kind}", query }) 返回的 AiModuleInstanceRef.id 取子实例 id。`,
    `拼接实例路径 parentPath/${segment}。`,
  ]
}

/** 生成子 kind 查找步骤 */
export function createChildLookupSteps(
  moduleKind: AiModule,
  allKinds: readonly AiModule[],
): readonly string[] {
  if (moduleKind.children.length === 0) return []
  return [
    `module_find({ path }) 查看 ${moduleKind.kind} 下可用子实例。`,
    ...moduleKind.children.map((childKind) => {
      const child = allKinds.find((candidate) => candidate.kind === childKind)
      const childName = child === undefined ? childKind : `${child.kind}(${child.name})`
      return `module_find({ path, childKind: "${childKind}", query }) 定位子 kind ${childName}。`
    }),
  ]
}

/** 生成属性查找步骤 */
export function createAttributeLookupSteps(moduleKind: AiModule): readonly string[] {
  if (moduleKind.attributes.length === 0) return []
  return [
    `目录阶段：调用 module_guide({ kind: "${moduleKind.kind}" }) 查看 attributes 概要，选择真实 attrName。`,
    `具体阶段：调用 module_attribute_guide({ kind: "${moduleKind.kind}", attrName: "<attrName>" }) 查看 schema、readable 和 writable。`,
    `读取属性使用 module_attr({ op: "get", path, attrName })。`,
    `写入属性使用 module_attr({ op: "set", path, attrName, value })。`,
  ]
}

/** 生成模块函数查找步骤 */
export function createModuleFunctionLookupSteps(moduleKind: AiModule, kindPath: readonly string[]): readonly string[] {
  if (moduleKind.functions.length === 0) return []
  const path = kindPath.map((kind) => `/${kind}[<${kind}Id>]`).join('')
  return [
    `module_query({ kind: "${moduleKind.kind}", includeFunctions: true }) 查看 ${moduleKind.kind} 函数目录。`,
    `module_function_guide({ kind: "${moduleKind.kind}", functionName: "<functionName>" }) 查看单个函数 paramsSchema、usageRules 和 failureModes。`,
    `module_call({ path: "${path}", functionName: "<functionName>", args }) 执行业务函数。`,
  ]
}

/** 投影子 kind 摘要（已注册 → 完整信息；未注册 → 占位提示） */
export function summarizeChildKind(
  childKind: string,
  allKinds: readonly AiModule[],
): AiModuleKnowledgeChildKindSummary {
  const child = allKinds.find((candidate) => candidate.kind === childKind)
  if (child === undefined) {
    return {
      kind: childKind,
      name: childKind,
      description: '子 kind 已声明但未注册，当前仅保留声明名。',
      functionNames: [],
      attributeNames: [],
      payloadRefs: [],
      childKindNames: [],
      attributeSummaries: [],
      functionSummaries: [],
      detailLookupSteps: [
        `注册 ${childKind} 后，module_query({ kind: "${childKind}" }) 才会返回该子层完整指南。`,
      ],
    }
  }
  return {
    kind: child.kind,
    name: child.name,
    description: child.description,
    functionNames: child.functions.map((fn) => fn.name),
    attributeNames: child.attributes.map((attribute) => attribute.name),
    payloadRefs: child.payloads.map((payload) => payload.payloadRef),
    childKindNames: [...child.children],
    attributeSummaries: child.attributes.map((attribute) => ({
      knowledgeLevel: 'directory',
      name: attribute.name,
      description: attribute.description,
      access: attributeAccessMode(attribute.readable, attribute.writable),
      detailLookupStep: formatAttributeGuideLookupStep(child.kind, attribute.name),
    })),
    functionSummaries: child.functions.map((fn) => ({
      knowledgeLevel: 'directory',
      functionName: fn.name,
      description: fn.description,
      payloadRefs: payloadRefsForFunction(child.payloads, fn.name),
      detailLookupStep: formatFunctionGuideLookupStep(child.kind, fn.name),
    })),
    detailLookupSteps: [
      `module_query({ kind: "${child.kind}", includeFunctions: true }) 读取 ${child.kind} 目录概要。`,
      `module_guide({ kind: "${child.kind}" }) 查看 ${child.kind} 的模块用途和函数说明。`,
      `在父实例 path 下 module_find({ path, childKind: "${child.kind}", query }) 定位子实例。`,
    ],
  }
}

function formatFunctionGuideLookupStep(kind: string, functionName: string): string {
  return `${PROTOCOL_TOOL_NAMES.moduleFunctionGuide}({ kind: "${kind}", functionName: "${functionName}" })`
}

export function formatAttributeGuideLookupStep(kind: string, attrName: string): string {
  return `${PROTOCOL_TOOL_NAMES.moduleAttributeGuide}({ kind: "${kind}", attrName: "${attrName}" })`
}

// ═══════════════════════════════════════════════════════════════
// 第 12 节 · Prompt 索引行格式化
// ═══════════════════════════════════════════════════════════════

/** 格式化单个 kind 的 prompt 索引行 */
export function formatPromptKindIndexLine(layer: AiModuleKnowledgeKindLayer): string {
  const prefix = layer.parentKind === undefined ? `root ${layer.kind}` : `${layer.parentKind}/${layer.kind}`
  const childKinds = layer.childKinds.map((child) => child.kind)
  const children = childKinds.length === 0 ? '' : ` -> [${childKinds.join('|')}]`
  const payload = layer.payloadLookupSteps.length === 0 ? '' : '; payload=payloadLookupSteps'
  return `${prefix}${children}${payload}`
}
