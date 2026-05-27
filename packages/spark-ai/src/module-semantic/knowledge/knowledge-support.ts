/**
 * Module-semantic knowledge projection — shared helpers.
 */

import type { LlmJsonSchemaObject, LlmJsonValue } from '../../schema'
import {
  createBusinessFunctionToolName,
  parseBusinessFunctionToolName,
} from '../internal/business-function-tool-name'
import { resolveModuleKindPath } from '../internal/module-kind-path'
import type { ModuleKind, ModuleParameterPayloadMetadata } from '../protocol'
import type {
  FunctionKnowledgeProjectionOptions,
  FunctionLookupStepsOptions,
  KindLayerOptions,
  ModuleSemanticKnowledgeAttributeAccessMode,
  ModuleSemanticKnowledgeAttributeGuide,
  ModuleSemanticKnowledgeChildKindSummary,
  ModuleSemanticKnowledgeFunctionGuide,
  ModuleSemanticKnowledgeFunctionGuideInput,
  ModuleSemanticKnowledgeFunctionSummary,
  ModuleSemanticKnowledgeInstanceGuide,
  ModuleSemanticKnowledgeKindLayer,
  ModuleSemanticKnowledgeLayerFunction,
  ModuleSemanticKnowledgeModuleSummary,
  ParsedKnowledgeFunction,
  PayloadCatalogDescriptor,
  PayloadLookupStepsOptions,
} from './knowledge-types'

export const PAYLOAD_QUERY_FUNCTION_NAME = 'queryPayloads'
export const PAYLOAD_GUIDE_FUNCTION_NAME = 'guidePayload'
export const FIXED_PROTOCOL_TOOL_ROUTING_LINES: readonly string[] = [
  '工具：知识=queryModules/queryFunctions/guideFunction；实例=listChildren/findInstance；元数据=describeKind；属性=getAttribute/setAttribute；反问=guideHumanQuestion。',
]
export const PROMPT_KIND_INDEX_LIMIT = 12

// ── 字符串工具 ────────────────────────────────────────────────

export function normalizeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim()
  return normalized.length === 0 ? undefined : normalized
}

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

export function containsKeyword(values: readonly string[], keyword: string): boolean {
  return values.some((value) => value.toLowerCase().includes(keyword))
}

// ── kind 路径与工具名 ────────────────────────────────────────

export function functionToolName(kindPath: readonly string[], functionName: string): string {
  return createBusinessFunctionToolName(kindPath, functionName)
}

export function formatInvokeStep(kindPath: readonly string[], functionName: string): string {
  const toolName = functionToolName(kindPath, functionName)
  const pathPlaceholders = kindPath.map((kind) => `<${kind}Id>`).join(', ')
  return `${toolName}({ $paths: [${pathPlaceholders}] })`
}

// ── Schema 工具 ───────────────────────────────────────────────

export function paramNames(schema: LlmJsonSchemaObject): readonly string[] {
  return Object.keys(schema.properties ?? {})
}

export function requiredParamNames(schema: LlmJsonSchemaObject): readonly string[] {
  return schema.required ?? []
}

// ── 属性与 payload ────────────────────────────────────────────

export function attributeAccessMode(
  readable: boolean,
  writable: boolean,
): ModuleSemanticKnowledgeAttributeAccessMode {
  if (readable && writable) return 'read-write'
  if (readable) return 'read'
  if (writable) return 'write'
  return 'none'
}

export function payloadRefsForFunction(
  payloads: readonly ModuleParameterPayloadMetadata[],
  functionName: string,
): readonly string[] {
  return payloads
    .filter((payload) => {
      const requiredForFunctions = payload.requiredForFunctions ?? []
      return requiredForFunctions.length === 0 || requiredForFunctions.includes(functionName)
    })
    .map((payload) => payload.payloadRef)
}

export function formatPayloadBinding(payload: ModuleParameterPayloadMetadata): string {
  const functions = payload.requiredForFunctions ?? []
  if (functions.length === 0) return payload.payloadRef
  return `${payload.payloadRef}(functions=${functions.join('|')})`
}

// ── Lookup 步骤生成器 ─────────────────────────────────────────

export function createFunctionLookupSteps(options: FunctionLookupStepsOptions): readonly string[] {
  const keyword = options.functionName ?? '<functionName 或业务关键词>'
  const toolRef = options.functionName === undefined
    ? '<toolName>'
    : functionToolName(options.kindPath, options.functionName)
  const guideToolRef = options.functionName === undefined
    ? '<toolName>'
    : toolRef
  return [
    `先调用 queryFunctions({ kind: "${options.kind}", keyword: "${keyword}" }) 查函数目录，确认 functionName、必填参数和 failureCodes。`,
    `再调用 guideFunction({ toolName: "${guideToolRef}" }) 读取完整 paramsSchema、usageRules 和 failureModes。`,
    `随后调用 ${toolRef}({ $paths: [...] }) 执行业务函数。`,
  ]
}

// ── Payload catalog 发现与格式化 ──────────────────────────────

export function discoverPayloadCatalogs(kinds: readonly ModuleKind[]): readonly PayloadCatalogDescriptor[] {
  return kinds
    .filter((moduleKind) =>
      moduleKind.functions.some((fn) => fn.name === PAYLOAD_QUERY_FUNCTION_NAME)
      && moduleKind.functions.some((fn) => fn.name === PAYLOAD_GUIDE_FUNCTION_NAME)
    )
    .map((moduleKind) => ({
      kind: moduleKind.kind,
      kindPath: resolveModuleKindPath(moduleKind, kinds),
      ...(moduleKind.parentKind === undefined ? {} : { parentKind: moduleKind.parentKind }),
    }))
}

export function createPayloadLookupSteps(options: PayloadLookupStepsOptions): readonly string[] {
  if (options.payloadRefs.length === 0) return []
  const payloadCatalogs = requirePayloadCatalogs(options)
  const catalogLocator = formatPayloadCatalogLocator(payloadCatalogs)
  const catalogToolNames = formatPayloadCatalogToolNames(payloadCatalogs)
  const catalogPathPlaceholders = formatPayloadCatalogPathPlaceholders(payloadCatalogs)
  const finalToolRef = options.functionName === undefined
    ? '<toolName>'
    : functionToolName(options.kindPath, options.functionName)
  return options.payloadRefs.flatMap((payloadRef) => [
    `先定位 payload 目录模块 ${catalogLocator}; 没有实例路径时用 listChildren/findInstance 获取目录实例。`,
    `先调用 ${catalogToolNames.queryPayloads}({ $paths: [${catalogPathPlaceholders}], moduleKind: "${options.kind}", payloadRef: "${payloadRef}", keyword/category/key, limit }) 查询目录并选择真实 key。`,
    `再调用 ${catalogToolNames.guidePayload}({ $paths: [${catalogPathPlaceholders}], moduleKind: "${options.kind}", payloadRef: "${payloadRef}", key }) 读取 paramsSchema、usageRules 和 failureModes。`,
    `最后才调用 ${finalToolRef}; 复杂参数只能按 guidePayload 返回的 schema 字段构造。`,
  ])
}

function requirePayloadCatalogs(options: PayloadLookupStepsOptions): readonly PayloadCatalogDescriptor[] {
  if (options.payloadCatalogs.length > 0) return options.payloadCatalogs
  throw new Error(
    `ModuleKind "${options.kind}" declares payloadRef ${options.payloadRefs.join(', ')} but no payload catalog ModuleKind is registered. ` +
    `Register a ModuleKind with functions "${PAYLOAD_QUERY_FUNCTION_NAME}" and "${PAYLOAD_GUIDE_FUNCTION_NAME}" before projecting knowledge.`,
  )
}

function formatPayloadCatalogToolNames(catalogs: readonly PayloadCatalogDescriptor[]): { queryPayloads: string, guidePayload: string } {
  const [catalog] = catalogs
  if (catalog === undefined) throw new Error('payload catalog descriptor is required')
  const queryTool = createBusinessFunctionToolName(catalog.kindPath, PAYLOAD_QUERY_FUNCTION_NAME)
  const guideTool = createBusinessFunctionToolName(catalog.kindPath, PAYLOAD_GUIDE_FUNCTION_NAME)
  return { queryPayloads: queryTool, guidePayload: guideTool }
}

function formatPayloadCatalogPathPlaceholders(catalogs: readonly PayloadCatalogDescriptor[]): string {
  const [catalog] = catalogs
  if (catalog === undefined) throw new Error('payload catalog descriptor is required')
  return catalog.kindPath.map((kind) => `<${kind}Id>`).join(', ')
}

function formatPayloadCatalogLocator(catalogs: readonly PayloadCatalogDescriptor[]): string {
  if (catalogs.length === 0) throw new Error('payload catalog descriptor is required')
  return catalogs.map((catalog) =>
    catalog.parentKind === undefined ? catalog.kind : `${catalog.parentKind}/${catalog.kind}`
  ).join('|')
}

// ── 关键字匹配 ────────────────────────────────────────────────

export function moduleSummaryGuidesMatchKeyword(
  summary: ModuleSemanticKnowledgeModuleSummary,
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
      attribute.name,
      attribute.description,
      attribute.access,
      attribute.schemaLookupStep,
      attribute.readStep ?? '',
      attribute.writeStep ?? '',
    ], keyword))
    || summary.functionGuides.some((fn) => containsKeyword([
      fn.toolName,
      fn.functionName,
      fn.description,
      fn.invokeStep,
      ...fn.paramNames,
      ...fn.requiredParamNames,
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
  child: ModuleSemanticKnowledgeChildKindSummary,
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
      attribute.name,
      attribute.description,
      attribute.access,
    ], keyword))
    || child.functionSummaries.some((fn) => containsKeyword([
      fn.functionName,
      fn.description,
      ...fn.requiredParamNames,
      ...fn.payloadRefs,
    ], keyword))
    || containsKeyword(child.detailLookupSteps, keyword)
}

// ── Guide 输入解析 ────────────────────────────────────────────

export function parseGuideInput(input: ModuleSemanticKnowledgeFunctionGuideInput): ParsedKnowledgeFunction | null {
  const toolName = input.toolName?.trim()
  if (toolName !== undefined && toolName.length > 0) {
    const ref = parseBusinessFunctionToolName(toolName)
    if (ref === null) return null
    const kind = ref.kindPath[ref.kindPath.length - 1]
    if (kind === undefined) return null
    return {
      kind,
      functionName: ref.functionName,
      kindPathFromTool: ref.kindPath,
    }
  }

  const kind = input.kind?.trim()
  const functionName = input.functionName?.trim()
  if (kind === undefined || kind.length === 0 || functionName === undefined || functionName.length === 0) return null
  return { kind, functionName }
}

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

// ── 函数投影 ──────────────────────────────────────────────────

export function summarizeFunction(options: FunctionKnowledgeProjectionOptions): ModuleSemanticKnowledgeFunctionSummary {
  const { kind, kindPath, fn, payloads, payloadCatalogs } = options
  const payloadRefs = payloadRefsForFunction(payloads, fn.name)
  const toolName = functionToolName(kindPath, fn.name)
  return {
    toolName,
    kindPath,
    kind,
    functionName: fn.name,
    description: fn.description,
    paramNames: paramNames(fn.paramsSchema),
    requiredParamNames: requiredParamNames(fn.paramsSchema),
    failureCodes: fn.failureModes?.map((mode) => mode.code) ?? [],
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

export function createGuide(options: FunctionKnowledgeProjectionOptions): ModuleSemanticKnowledgeFunctionGuide {
  const { kind, kindPath, fn, payloads, payloadCatalogs } = options
  const payloadRefs = payloadRefsForFunction(payloads, fn.name)
  const toolName = functionToolName(kindPath, fn.name)
  return {
    toolName,
    kindPath,
    kind,
    functionName: fn.name,
    description: fn.description,
    paramsSchema: fn.paramsSchema,
    ...(fn.resultSchema === undefined ? {} : { resultSchema: fn.resultSchema }),
    usageRules: fn.usageRules ?? [],
    failureModes: fn.failureModes ?? [],
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
    ...(fn.example === undefined ? {} : { example: fn.example }),
  }
}

// ── Kind 层投影 ───────────────────────────────────────────────

export function createKindLayer(options: KindLayerOptions): ModuleSemanticKnowledgeKindLayer {
  const { moduleKind, allKinds, payloadCatalogs } = options
  const kindPath = resolveModuleKindPath(moduleKind, allKinds)
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

export function createAttributeGuides(moduleKind: ModuleKind): readonly ModuleSemanticKnowledgeAttributeGuide[] {
  return moduleKind.attributes.map((attribute) => ({
    name: attribute.name,
    description: attribute.description,
    access: attributeAccessMode(attribute.readable, attribute.writable),
    readable: attribute.readable,
    writable: attribute.writable,
    schemaLookupStep: `describeKind("${moduleKind.kind}").attributes["${attribute.name}"].schema`,
    ...(attribute.readable ? { readStep: `getAttribute({ path, attrName: "${attribute.name}" })` } : {}),
    ...(attribute.writable ? { writeStep: `setAttribute({ path, attrName: "${attribute.name}", value })` } : {}),
  }))
}

export function createLayerFunctions(moduleKind: ModuleKind, kindPath: readonly string[]): readonly ModuleSemanticKnowledgeLayerFunction[] {
  return moduleKind.functions.map((fn) => {
    const payloadRefs = payloadRefsForFunction(moduleKind.payloads, fn.name)
    const toolName = functionToolName(kindPath, fn.name)
    return {
      toolName,
      kindPath,
      functionName: fn.name,
      description: fn.description,
      paramNames: paramNames(fn.paramsSchema),
      requiredParamNames: requiredParamNames(fn.paramsSchema),
      lookupSteps: createFunctionLookupSteps({ kind: moduleKind.kind, kindPath, functionName: fn.name }),
      invokeStep: formatInvokeStep(kindPath, fn.name),
      payloadRefs,
    }
  })
}

export function kindLayerLevel(moduleKind: ModuleKind, allKinds: readonly ModuleKind[]): number {
  const kindPath = resolveModuleKindPath(moduleKind, allKinds)
  return kindPath.length - 1
}

export function createPathPattern(moduleKind: ModuleKind): string {
  const own = `/${moduleKind.kind}[<${moduleKind.kind}Id>]`
  if (moduleKind.parentKind === undefined) return own
  return `/<parentKind>[<parentId>]${own}`
}

export function createInstanceGuide(moduleKind: ModuleKind): ModuleSemanticKnowledgeInstanceGuide {
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
      `用实例 path 调用 describeKind("${moduleKind.kind}") 读取元数据。`,
      `属性读写复用同一个实例 path：getAttribute/setAttribute。`,
      `函数调用复用同一个实例 path：OpenAI function tool。`,
      `进入子 kind 时，以当前实例 path 作为 parentPath 调用 listChildren/findInstance。`,
    ],
  }
}

export function createInstanceQueryFields(moduleKind: ModuleKind): readonly string[] {
  return uniqueTexts([
    'id',
    'label',
    'keyword',
    'hint',
    ...moduleKind.attributes.map((attribute) => attribute.name),
  ])
}

export function createInstanceQueryExamples(
  moduleKind: ModuleKind,
): ReadonlyArray<Readonly<Record<string, LlmJsonValue>>> {
  const examples: Array<Record<string, LlmJsonValue>> = [
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

export function createInstanceLookupSteps(moduleKind: ModuleKind): readonly string[] {
  if (moduleKind.parentKind === undefined) {
    return [
      `listChildren("/") 查看根级 kind。`,
      `findInstance("/", "${moduleKind.kind}", query) 获取 ${moduleKind.kind} 实例 id。`,
    ]
  }
  return [
    `先获得父路径 /${moduleKind.parentKind}[<parentId>]。`,
    `listChildren(parentPath, "${moduleKind.kind}") 查看 ${moduleKind.kind} 子实例。`,
    `findInstance(parentPath, "${moduleKind.kind}", query) 获取 ${moduleKind.kind} 实例 id。`,
  ]
}

export function createInstancePathBuildSteps(moduleKind: ModuleKind): readonly string[] {
  const segment = `${moduleKind.kind}[<instanceRef.id>]`
  if (moduleKind.parentKind === undefined) {
    return [
      `从 findInstance("/", "${moduleKind.kind}", query) 返回的 ModuleInstanceRef.id 取实例 id。`,
      `拼接实例路径 /${segment}。`,
    ]
  }
  return [
    `保留父实例路径 parentPath。`,
    `从 findInstance(parentPath, "${moduleKind.kind}", query) 返回的 ModuleInstanceRef.id 取子实例 id。`,
    `拼接实例路径 parentPath/${segment}。`,
  ]
}

export function createChildLookupSteps(
  moduleKind: ModuleKind,
  allKinds: readonly ModuleKind[],
): readonly string[] {
  if (moduleKind.children.length === 0) return []
  return [
    `listChildren(path) 查看 ${moduleKind.kind} 下可用子实例。`,
    ...moduleKind.children.map((childKind) => {
      const child = allKinds.find((candidate) => candidate.kind === childKind)
      const childName = child === undefined ? childKind : `${child.kind}(${child.name})`
      return `findInstance(path, "${childKind}", query) 定位子 kind ${childName}。`
    }),
  ]
}

export function createAttributeLookupSteps(moduleKind: ModuleKind): readonly string[] {
  if (moduleKind.attributes.length === 0) return []
  return [
    `describeKind("${moduleKind.kind}") 查看 attributes 的 schema、readable 和 writable。`,
    `读取属性使用 getAttribute({ path, attrName })。`,
    `写入属性使用 setAttribute({ path, attrName, value })。`,
  ]
}

export function createModuleFunctionLookupSteps(moduleKind: ModuleKind, kindPath: readonly string[]): readonly string[] {
  if (moduleKind.functions.length === 0) return []
  return [
    `queryFunctions({ kind: "${moduleKind.kind}" }) 查看 ${moduleKind.kind} 函数目录。`,
    `guideFunction({ toolName: "${kindPath.join('_')}_<functionName>" }) 查看单个函数 paramsSchema、usageRules 和 failureModes。`,
    `<toolName>({ $paths: [${kindPath.map((k) => `<${k}Id>`).join(', ')}] }) 执行业务函数。`,
  ]
}

export function summarizeChildKind(
  childKind: string,
  allKinds: readonly ModuleKind[],
): ModuleSemanticKnowledgeChildKindSummary {
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
        `注册 ${childKind} 后，queryModules({ kind: "${childKind}" }) 才会返回该子层完整指南。`,
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
      name: attribute.name,
      description: attribute.description,
      access: attributeAccessMode(attribute.readable, attribute.writable),
    })),
    functionSummaries: child.functions.map((fn) => ({
      functionName: fn.name,
      description: fn.description,
      requiredParamNames: requiredParamNames(fn.paramsSchema),
      payloadRefs: payloadRefsForFunction(child.payloads, fn.name),
    })),
    detailLookupSteps: [
      `queryModules({ kind: "${child.kind}" }) 读取 ${child.kind} 自己的 instanceGuide、attributeGuides 和 functionGuides。`,
      `describeKind("${child.kind}") 查看 ${child.kind} 的 attributes/functions/payloads/children 元数据。`,
      `在父实例 path 下 listChildren/findInstance(path, "${child.kind}", query) 定位子实例。`,
    ],
  }
}

export function formatPromptKindIndexLine(layer: ModuleSemanticKnowledgeKindLayer): string {
  const prefix = layer.parentKind === undefined ? `root ${layer.kind}` : `${layer.parentKind}/${layer.kind}`
  const childKinds = layer.childKinds.map((child) => child.kind)
  const children = childKinds.length === 0 ? '' : ` -> [${childKinds.join('|')}]`
  const payload = layer.payloadLookupSteps.length === 0 ? '' : '; payload=payloadLookupSteps'
  return `${prefix}${children}${payload}`
}
