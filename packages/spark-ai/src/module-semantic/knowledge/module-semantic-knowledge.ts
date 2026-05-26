/**
 * Module-semantic knowledge projection.
 *
 * This layer restores the old "knowledge" contract on top of the current
 * module-semantic protocol: it exposes module summaries, function summaries,
 * function guides, and a compact prompt snapshot. ProtocolToolRouter also
 * exposes the three query/guide operations as direct LLM-visible tools.
 */

import type { LlmJsonSchemaObject, LlmJsonValue } from '../../schema'
import type { ModuleKindRegistry } from '../internal/module-kind-registry'
import {
  createBusinessFunctionToolName,
} from '../internal/business-function-tool-name'
import {
  ModuleOperationResult,
  type ModuleFunctionFailureMode,
  type ModuleFunctionMetadata,
  type ModuleFunctionResultSchema,
  type ModuleKind,
  type ModuleParameterPayloadMetadata,
} from '../protocol'

const PAYLOAD_QUERY_ACTION_NAME = 'queryPayloads'
const PAYLOAD_GUIDE_ACTION_NAME = 'guidePayload'
const FIXED_PROTOCOL_TOOL_ROUTING_LINES: readonly string[] = [
  '工具：知识=queryModules/queryFunctions/guideFunction；实例=listChildren/findInstance；元数据=describeKind；执行=get/set/invoke；反问=guideHumanQuestion。',
]
const PROMPT_KIND_INDEX_LIMIT = 12

export type ModuleSemanticKnowledgeAttributeAccessMode = 'read' | 'write' | 'read-write' | 'none'

export type ModuleSemanticKnowledgeAttributeGuide = Readonly<{
  name: string
  description: string
  access: ModuleSemanticKnowledgeAttributeAccessMode
  readable: boolean
  writable: boolean
  schemaLookupStep: string
  readStep?: string
  writeStep?: string
}>

export type ModuleSemanticKnowledgeLayerFunction = Readonly<{
  functionId: string
  toolName: string
  kindPath: readonly string[]
  functionName: string
  description: string
  paramNames: readonly string[]
  requiredParamNames: readonly string[]
  lookupSteps: readonly string[]
  invokeStep: string
  payloadRefs: readonly string[]
}>

export type ModuleSemanticKnowledgeChildAttributeSummary = Readonly<{
  name: string
  description: string
  access: ModuleSemanticKnowledgeAttributeAccessMode
}>

export type ModuleSemanticKnowledgeChildFunctionSummary = Readonly<{
  functionName: string
  description: string
  requiredParamNames: readonly string[]
  payloadRefs: readonly string[]
}>

export type ModuleSemanticKnowledgeChildKindSummary = Readonly<{
  kind: string
  name: string
  description: string
  functionNames: readonly string[]
  attributeNames: readonly string[]
  payloadRefs: readonly string[]
  childKindNames: readonly string[]
  attributeSummaries: readonly ModuleSemanticKnowledgeChildAttributeSummary[]
  functionSummaries: readonly ModuleSemanticKnowledgeChildFunctionSummary[]
  detailLookupSteps: readonly string[]
}>

export type ModuleSemanticKnowledgeInstanceGuide = Readonly<{
  refShape: string
  pathPattern: string
  discoveryScope: 'root' | 'parent'
  queryFields: readonly string[]
  queryExamples: ReadonlyArray<Readonly<Record<string, LlmJsonValue>>>
  discoverySteps: readonly string[]
  pathBuildSteps: readonly string[]
  operationSteps: readonly string[]
}>

export type ModuleSemanticKnowledgeKindLayer = Readonly<{
  kind: string
  name: string
  description: string
  parentKind?: string
  level: number
  pathPattern: string
  instanceGuide: ModuleSemanticKnowledgeInstanceGuide
  instanceLookupSteps: readonly string[]
  childLookupSteps: readonly string[]
  attributeLookupSteps: readonly string[]
  functionLookupSteps: readonly string[]
  payloadLookupSteps: readonly string[]
  attributes: readonly ModuleSemanticKnowledgeAttributeGuide[]
  functions: readonly ModuleSemanticKnowledgeLayerFunction[]
  childKinds: readonly ModuleSemanticKnowledgeChildKindSummary[]
}>

export type ModuleSemanticKnowledgeModuleSummary = Readonly<{
  kind: string
  name: string
  description: string
  parentKind?: string
  attributeCount: number
  attributeNames: readonly string[]
  readableAttributeNames: readonly string[]
  writableAttributeNames: readonly string[]
  functionCount: number
  functionNames: readonly string[]
  payloadCount: number
  payloadRefs: readonly string[]
  payloadFunctionRefs: readonly string[]
  payloadLookupSteps: readonly string[]
  childKindCount: number
  children: readonly string[]
  level: number
  pathPattern: string
  instanceGuide: ModuleSemanticKnowledgeInstanceGuide
  instanceLookupSteps: readonly string[]
  childLookupSteps: readonly string[]
  attributeLookupSteps: readonly string[]
  functionLookupSteps: readonly string[]
  attributeGuides: readonly ModuleSemanticKnowledgeAttributeGuide[]
  functionGuides: readonly ModuleSemanticKnowledgeLayerFunction[]
  childKindSummaries: readonly ModuleSemanticKnowledgeChildKindSummary[]
}>

export type ModuleSemanticKnowledgeModuleFilter = Readonly<{
  kind?: string
  parentKind?: string
  keyword?: string
}>

export type ModuleSemanticKnowledgeFunctionSummary = Readonly<{
  functionId: string
  toolName: string
  kindPath: readonly string[]
  kind: string
  functionName: string
  description: string
  paramNames: readonly string[]
  requiredParamNames: readonly string[]
  failureCodes: readonly string[]
  usageRuleCount: number
  failureModeCount: number
  functionLookupSteps: readonly string[]
  payloadRefs: readonly string[]
  requiresPayloadGuide: boolean
  payloadLookupSteps: readonly string[]
}>

export type ModuleSemanticKnowledgeFunctionGuide = Readonly<{
  functionId: string
  toolName: string
  kindPath: readonly string[]
  kind: string
  functionName: string
  description: string
  paramsSchema: LlmJsonSchemaObject
  resultSchema?: ModuleFunctionResultSchema
  usageRules: readonly string[]
  failureModes: readonly ModuleFunctionFailureMode[]
  functionLookupSteps: readonly string[]
  payloadRefs: readonly string[]
  requiresPayloadGuide: boolean
  payloadLookupSteps: readonly string[]
  example?: LlmJsonValue
}>

export type ModuleSemanticKnowledgeSnapshot = Readonly<{
  modules: readonly ModuleSemanticKnowledgeModuleSummary[]
  functions: readonly ModuleSemanticKnowledgeFunctionSummary[]
  kindLayers: readonly ModuleSemanticKnowledgeKindLayer[]
  promptSnapshot: string
}>

export type ModuleSemanticKnowledgeFunctionFilter = Readonly<{
  kind?: string
  keyword?: string
}>

export type ModuleSemanticKnowledgeFunctionGuideInput = Readonly<{
  functionId?: string
  kind?: string
  functionName?: string
}>

export type ModuleSemanticHumanQuestionGuideInput = Readonly<{
  context: string
  reason: string
  missingFacts?: readonly string[]
  candidateOptions?: readonly string[]
}>

export type ModuleSemanticHumanQuestionGuide = Readonly<{
  kind: 'human-question-guide'
  shouldAskHuman: true
  stopToolCalls: true
  context: string
  reason: string
  missingFacts: readonly string[]
  candidateOptions: readonly string[]
  question: string
  usageRules: readonly string[]
  resumeFlow: readonly string[]
}>

type ParsedKnowledgeFunction = Readonly<{
  kind: string
  functionName: string
  kindPathFromId?: readonly string[]
}>

type PayloadCatalogDescriptor = Readonly<{
  kind: string
  kindPath: readonly string[]
  parentKind?: string
}>

type FunctionKnowledgeProjectionOptions = Readonly<{
  kind: string
  kindPath: readonly string[]
  fn: ModuleFunctionMetadata
  payloads: readonly ModuleParameterPayloadMetadata[]
  payloadCatalogs: readonly PayloadCatalogDescriptor[]
}>

export class ModuleSemanticKnowledgeProjector {
  public constructor(private readonly kinds: ModuleKindRegistry) {}

  public project(): ModuleSemanticKnowledgeSnapshot {
    const modules = this.queryModules()
    const functions = this.queryFunctions()
    const kindLayers = this.queryKindLayers()
    return {
      modules,
      functions,
      kindLayers,
      promptSnapshot: this.buildPromptSnapshot(kindLayers),
    }
  }

  public queryKindLayers(): readonly ModuleSemanticKnowledgeKindLayer[] {
    const moduleKinds = this.kinds.list()
    const payloadCatalogs = discoverPayloadCatalogs(moduleKinds)
    return moduleKinds.map((moduleKind) => createKindLayer({
      moduleKind,
      allKinds: moduleKinds,
      payloadCatalogs,
    }))
  }

  public queryModules(
    filter: ModuleSemanticKnowledgeModuleFilter = {},
  ): readonly ModuleSemanticKnowledgeModuleSummary[] {
    const kindFilter = normalizeOptionalText(filter.kind)
    const parentKindFilter = normalizeOptionalText(filter.parentKind)
    const keyword = normalizeOptionalText(filter.keyword)?.toLowerCase()
    const moduleKinds = this.kinds.list()
    const payloadCatalogs = discoverPayloadCatalogs(moduleKinds)
    return moduleKinds.map((moduleKind) => {
      const layer = createKindLayer({
        moduleKind,
        allKinds: moduleKinds,
        payloadCatalogs,
      })
      const attributeNames = moduleKind.attributes.map((attribute) => attribute.name)
      const functionNames = moduleKind.functions.map((fn) => fn.name)
      return {
        kind: moduleKind.kind,
        name: moduleKind.name,
        description: moduleKind.description,
        ...(moduleKind.parentKind === undefined ? {} : { parentKind: moduleKind.parentKind }),
        attributeCount: moduleKind.attributes.length,
        attributeNames,
        readableAttributeNames: moduleKind.attributes
          .filter((attribute) => attribute.readable)
          .map((attribute) => attribute.name),
        writableAttributeNames: moduleKind.attributes
          .filter((attribute) => attribute.writable)
          .map((attribute) => attribute.name),
        functionCount: moduleKind.functions.length,
        functionNames,
        payloadCount: moduleKind.payloads.length,
        payloadRefs: moduleKind.payloads.map((payload) => payload.payloadRef),
        payloadFunctionRefs: moduleKind.payloads.map(formatPayloadBinding),
        payloadLookupSteps: createPayloadLookupSteps({
          kind: moduleKind.kind,
          kindPath: layer.functionLookupSteps.length > 0 ? kindPathFor(moduleKind, moduleKinds) : [moduleKind.kind],
          payloadRefs: moduleKind.payloads.map((payload) => payload.payloadRef),
          payloadCatalogs,
        }),
        childKindCount: moduleKind.children.length,
        children: [...moduleKind.children],
        level: layer.level,
        pathPattern: layer.pathPattern,
        instanceGuide: layer.instanceGuide,
        instanceLookupSteps: layer.instanceLookupSteps,
        childLookupSteps: layer.childLookupSteps,
        attributeLookupSteps: layer.attributeLookupSteps,
        functionLookupSteps: layer.functionLookupSteps,
        attributeGuides: layer.attributes,
        functionGuides: layer.functions,
        childKindSummaries: layer.childKinds,
      }
    }).filter((summary) => {
      if (kindFilter !== undefined && summary.kind !== kindFilter) return false
      if (parentKindFilter !== undefined) {
        if (parentKindFilter === 'root' && summary.parentKind !== undefined) return false
        if (parentKindFilter !== 'root' && summary.parentKind !== parentKindFilter) return false
      }
      if (keyword === undefined) return true
      return summary.kind.toLowerCase().includes(keyword)
        || summary.name.toLowerCase().includes(keyword)
        || summary.description.toLowerCase().includes(keyword)
        || summary.attributeNames.some((attrName) => attrName.toLowerCase().includes(keyword))
        || summary.functionNames.some((functionName) => functionName.toLowerCase().includes(keyword))
        || summary.payloadRefs.some((payloadRef) => payloadRef.toLowerCase().includes(keyword))
        || summary.payloadFunctionRefs.some((payloadRef) => payloadRef.toLowerCase().includes(keyword))
        || summary.payloadLookupSteps.some((step) => step.toLowerCase().includes(keyword))
        || summary.children.some((childKind) => childKind.toLowerCase().includes(keyword))
        || moduleSummaryGuidesMatchKeyword(summary, keyword)
    })
  }

  public queryFunctions(
    filter: ModuleSemanticKnowledgeFunctionFilter = {},
  ): readonly ModuleSemanticKnowledgeFunctionSummary[] {
    const kindFilter = filter.kind?.trim()
    const keyword = filter.keyword?.trim().toLowerCase()
    const allKinds = this.kinds.list()
    const payloadCatalogs = discoverPayloadCatalogs(allKinds)
    const summaries = allKinds.flatMap((moduleKind) => {
      const kindPath = kindPathFor(moduleKind, allKinds)
      return moduleKind.functions.map((fn) => summarizeFunction({
        kind: moduleKind.kind,
        kindPath,
        fn,
        payloads: moduleKind.payloads,
        payloadCatalogs,
      }))
    })
    return summaries.filter((summary) => {
      if (kindFilter !== undefined && kindFilter.length > 0 && summary.kind !== kindFilter) return false
      if (keyword === undefined || keyword.length === 0) return true
      return summary.functionId.toLowerCase().includes(keyword)
        || summary.kind.toLowerCase().includes(keyword)
        || summary.functionName.toLowerCase().includes(keyword)
        || summary.description.toLowerCase().includes(keyword)
        || summary.functionLookupSteps.some((step) => step.toLowerCase().includes(keyword))
        || summary.payloadRefs.some((payloadRef) => payloadRef.toLowerCase().includes(keyword))
        || summary.payloadLookupSteps.some((step) => step.toLowerCase().includes(keyword))
    })
  }

  public guideFunction(
    input: ModuleSemanticKnowledgeFunctionGuideInput,
  ): ModuleOperationResult<ModuleSemanticKnowledgeFunctionGuide> {
    const parsed = parseGuideInput(input)
    if (parsed === null) {
      return ModuleOperationResult.failCode(
        'INVALID_GUIDE_REQUEST',
        'guideFunction requires either functionId or kind + functionName.',
        'Use functionId format "<kind>.<functionName>", or pass kind and functionName separately.',
      )
    }

    const moduleKind = this.kinds.get(parsed.kind)
    if (moduleKind === undefined) {
      return ModuleOperationResult.failCode(
        'KIND_NOT_REGISTERED',
        `kind "${parsed.kind}" is not registered.`,
        'Call queryModules() or listChildren("/") to inspect available kinds.',
      )
    }
    const allKinds = this.kinds.list()
    const actualKindPath = kindPathFor(moduleKind, allKinds)
    if (parsed.kindPathFromId !== undefined) {
      if (parsed.kindPathFromId.length !== actualKindPath.length
        || parsed.kindPathFromId.some((segment, i) => segment !== actualKindPath[i])) {
        return ModuleOperationResult.failCode(
          'KIND_PATH_MISMATCH',
          `functionId prefix "${parsed.kindPathFromId.join('.')}" does not match registered kind path "${actualKindPath.join('.')}".`,
          'Call queryModules() or describeKind(kind) to verify the correct kindPath.',
        )
      }
    }
    const fn = moduleKind.findFunction(parsed.functionName)
    if (fn === undefined) {
      return ModuleOperationResult.failCode(
        'FUNCTION_NOT_FOUND',
        `function "${parsed.functionName}" is not declared on kind "${parsed.kind}".`,
        'Call queryFunctions({ kind }) or describeKind(kind) before retrying.',
      )
    }
    return ModuleOperationResult.ok(createGuide({
      kind: parsed.kind,
      kindPath: actualKindPath,
      fn,
      payloads: moduleKind.payloads,
      payloadCatalogs: discoverPayloadCatalogs(allKinds),
    }))
  }

  public guideHumanQuestion(
    input: ModuleSemanticHumanQuestionGuideInput,
  ): ModuleOperationResult<ModuleSemanticHumanQuestionGuide> {
    const context = input.context.trim()
    const reason = input.reason.trim()
    if (context.length === 0 || reason.length === 0) {
      return ModuleOperationResult.failCode(
        'INVALID_HUMAN_QUESTION_REQUEST',
        'guideHumanQuestion requires non-empty context and reason.',
        'Pass context describing the current task and reason explaining why guessing is unsafe.',
      )
    }

    const missingFacts = normalizeTextList(input.missingFacts)
    const candidateOptions = normalizeTextList(input.candidateOptions)
    const facts = missingFacts.length === 0 ? ['完成下一步所必需的用户事实'] : missingFacts
    return ModuleOperationResult.ok({
      kind: 'human-question-guide',
      shouldAskHuman: true,
      stopToolCalls: true,
      context,
      reason,
      missingFacts: facts,
      candidateOptions,
      question: buildHumanQuestion(facts, candidateOptions),
      usageRules: [
        '只问完成下一步所需的最少问题；优先 1 个，最多 3 个。',
        '问题使用用户可直接回答的自然语言，省略实现细节、工具名或 schema 字段名。',
        '当缺少用户意图、业务范围、日期含义、审批/提交确认或破坏性操作确认时，通过本指南收集事实。',
        '拿到本指南后停止继续调用写工具，把 question 改写为自然语言发给用户并等待下一轮。',
      ],
      resumeFlow: [
        '用户回答后，把回答并入当前任务事实。',
        '如仍不确定模块或函数，先 queryModules / queryFunctions。',
        '执行前用 guideFunction 或 describeKind 确认 function schema。',
        '具备足够事实后再调用对应标准 function tool。',
      ],
    })
  }

  private buildPromptSnapshot(
    kindLayers: readonly ModuleSemanticKnowledgeKindLayer[],
  ): string {
    if (kindLayers.length === 0) {
      return [
        ...FIXED_PROTOCOL_TOOL_ROUTING_LINES,
        '当前没有注册 ModuleKind。业务方需要先注册能力模块。',
      ].join('\n')
    }

    const roots = kindLayers.filter((layer) => layer.parentKind === undefined)
    const promptKinds = (roots.length === 0 ? kindLayers : roots).slice(0, PROMPT_KIND_INDEX_LIMIT)
    const hiddenKindCount = (roots.length === 0 ? kindLayers : roots).length - promptKinds.length
    const lines = [
      ...FIXED_PROTOCOL_TOOL_ROUTING_LINES,
      ...promptKinds.map(formatPromptKindIndexLine),
      ...(hiddenKindCount > 0 ? [`...还有 ${String(hiddenKindCount)} 个 kind，使用 queryModules({ keyword }) 查询。`] : []),
      '流程：实例->schema/元数据->执行；复杂参数按 payloadLookupSteps 查 payload-catalog。',
    ]
    return lines.join('\n')
  }
}

function knowledgeFunctionId(kindPath: readonly string[], functionName: string): string {
  return `${kindPath.join('.')}.${functionName}`
}

function kindPathFor(moduleKind: ModuleKind, allKinds: readonly ModuleKind[]): readonly string[] {
  const path = [moduleKind.kind]
  const seen = new Set<string>(path)
  let parentKind = moduleKind.parentKind
  while (parentKind !== undefined) {
    if (seen.has(parentKind)) {
      throw new Error(`ModuleKind parent cycle detected at "${parentKind}"`)
    }
    const parent = allKinds.find((candidate) => candidate.kind === parentKind)
    if (parent === undefined) break
    path.unshift(parent.kind)
    seen.add(parent.kind)
    parentKind = parent.parentKind
  }
  return path
}

function functionToolName(kindPath: readonly string[], functionName: string): string {
  return createBusinessFunctionToolName(kindPath, functionName)
}

function formatInvokeStep(kindPath: readonly string[], functionName: string): string {
  const toolName = functionToolName(kindPath, functionName)
  const pathPlaceholders = kindPath.map((kind) => `<${kind}Id>`).join(', ')
  return `${toolName}({ $paths: [${pathPlaceholders}] })`
}

function parseGuideInput(input: ModuleSemanticKnowledgeFunctionGuideInput): ParsedKnowledgeFunction | null {
  const functionId = input.functionId?.trim()
  if (functionId !== undefined && functionId.length > 0) {
    const lastDot = functionId.lastIndexOf('.')
    if (lastDot > 0 && lastDot < functionId.length - 1) {
      const prefix = functionId.slice(0, lastDot)
      const kindPathFromId = prefix.split('.')
      const kind = kindPathFromId[kindPathFromId.length - 1]
      if (kind === undefined) return null
      return {
        kind,
        functionName: functionId.slice(lastDot + 1),
        kindPathFromId,
      }
    }
    return null
  }

  const kind = input.kind?.trim()
  const functionName = input.functionName?.trim()
  if (kind === undefined || kind.length === 0 || functionName === undefined || functionName.length === 0) return null
  return { kind, functionName }
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim()
  return normalized.length === 0 ? undefined : normalized
}

function normalizeTextList(values: readonly string[] | undefined): readonly string[] {
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

function buildHumanQuestion(
  missingFacts: readonly string[],
  candidateOptions: readonly string[],
): string {
  const factText = missingFacts.length === 1
    ? missingFacts[0]
    : missingFacts.map((fact, index) => `${String(index + 1)}. ${fact}`).join('；')
  const options = candidateOptions.length === 0 ? '' : ` 可选项：${candidateOptions.join(' / ')}。`
  return `为了继续处理，我需要你确认：${factText}。${options}`
}

function summarizeFunction(options: FunctionKnowledgeProjectionOptions): ModuleSemanticKnowledgeFunctionSummary {
  const { kind, kindPath, fn, payloads, payloadCatalogs } = options
  const payloadRefs = payloadRefsForFunction(payloads, fn.name)
  const toolName = functionToolName(kindPath, fn.name)
  return {
    functionId: knowledgeFunctionId(kindPath, fn.name),
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

function createGuide(options: FunctionKnowledgeProjectionOptions): ModuleSemanticKnowledgeFunctionGuide {
  const { kind, kindPath, fn, payloads, payloadCatalogs } = options
  const payloadRefs = payloadRefsForFunction(payloads, fn.name)
  const toolName = functionToolName(kindPath, fn.name)
  return {
    functionId: knowledgeFunctionId(kindPath, fn.name),
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

type KindLayerOptions = Readonly<{
  moduleKind: ModuleKind
  allKinds: readonly ModuleKind[]
  payloadCatalogs: readonly PayloadCatalogDescriptor[]
}>

function createKindLayer(options: KindLayerOptions): ModuleSemanticKnowledgeKindLayer {
  const { moduleKind, allKinds, payloadCatalogs } = options
  const kindPath = kindPathFor(moduleKind, allKinds)
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

function createAttributeGuides(moduleKind: ModuleKind): readonly ModuleSemanticKnowledgeAttributeGuide[] {
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

function createLayerFunctions(moduleKind: ModuleKind, kindPath: readonly string[]): readonly ModuleSemanticKnowledgeLayerFunction[] {
  return moduleKind.functions.map((fn) => {
    const payloadRefs = payloadRefsForFunction(moduleKind.payloads, fn.name)
    const toolName = functionToolName(kindPath, fn.name)
    return {
      functionId: knowledgeFunctionId(kindPath, fn.name),
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

function kindLayerLevel(moduleKind: ModuleKind, allKinds: readonly ModuleKind[]): number {
  let level = 0
  let currentParent = moduleKind.parentKind
  const seen = new Set<string>([moduleKind.kind])
  while (currentParent !== undefined && !seen.has(currentParent)) {
    seen.add(currentParent)
    const parent = allKinds.find((candidate) => candidate.kind === currentParent)
    if (parent === undefined) return level + 1
    level += 1
    currentParent = parent.parentKind
  }
  return level
}

function createPathPattern(moduleKind: ModuleKind): string {
  const own = `/${moduleKind.kind}[<${moduleKind.kind}Id>]`
  if (moduleKind.parentKind === undefined) return own
  return `/<parentKind>[<parentId>]${own}`
}

function createInstanceGuide(moduleKind: ModuleKind): ModuleSemanticKnowledgeInstanceGuide {
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
      `函数调用复用同一个实例 path：标准 function tool。`,
      `进入子 kind 时，以当前实例 path 作为 parentPath 调用 listChildren/findInstance。`,
    ],
  }
}

function createInstanceQueryFields(moduleKind: ModuleKind): readonly string[] {
  return uniqueTexts([
    'id',
    'label',
    'keyword',
    'hint',
    ...moduleKind.attributes.map((attribute) => attribute.name),
  ])
}

function createInstanceQueryExamples(
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

function createInstanceLookupSteps(moduleKind: ModuleKind): readonly string[] {
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

function createInstancePathBuildSteps(moduleKind: ModuleKind): readonly string[] {
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

function createChildLookupSteps(
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

function createAttributeLookupSteps(moduleKind: ModuleKind): readonly string[] {
  if (moduleKind.attributes.length === 0) return []
  return [
    `describeKind("${moduleKind.kind}") 查看 attributes 的 schema、readable 和 writable。`,
    `读取属性使用 getAttribute({ path, attrName })。`,
    `写入属性使用 setAttribute({ path, attrName, value })。`,
  ]
}

function createModuleFunctionLookupSteps(moduleKind: ModuleKind, kindPath: readonly string[]): readonly string[] {
  if (moduleKind.functions.length === 0) return []
  return [
    `queryFunctions({ kind: "${moduleKind.kind}" }) 查看 ${moduleKind.kind} 函数目录。`,
    `guideFunction({ functionId: "${kindPath.join('.')}.<functionName>" }) 查看单个函数 paramsSchema、usageRules 和 failureModes。`,
    `<toolName>({ $paths: [${kindPath.map((k) => `<${k}Id>`).join(', ')}] }) 执行业务函数。`,
  ]
}

function summarizeChildKind(
  childKind: string,
  allKinds: readonly ModuleKind[],
): ModuleSemanticKnowledgeChildKindSummary {
  const child = allKinds.find((candidate) => candidate.kind === childKind)
  if (child === undefined) {
    return {
      kind: childKind,
      name: childKind,
      description: '子 kind 已声明，当前注册表未提供详细元数据。',
      functionNames: [],
      attributeNames: [],
      payloadRefs: [],
      childKindNames: [],
      attributeSummaries: [],
      functionSummaries: [],
      detailLookupSteps: [
        `注册 ${childKind} 后，queryModules({ kind: "${childKind}" }) 返回该子层完整指南。`,
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

function attributeAccessMode(
  readable: boolean,
  writable: boolean,
): ModuleSemanticKnowledgeAttributeAccessMode {
  if (readable && writable) return 'read-write'
  if (readable) return 'read'
  if (writable) return 'write'
  return 'none'
}

function payloadRefsForFunction(
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

type FunctionLookupStepsOptions = Readonly<{
  kind: string
  kindPath: readonly string[]
  functionName?: string
}>

function createFunctionLookupSteps(options: FunctionLookupStepsOptions): readonly string[] {
  const keyword = options.functionName ?? '<functionName 或业务关键词>'
  const functionId = options.functionName === undefined
    ? `${options.kindPath.join('.')}.<functionName>`
    : knowledgeFunctionId(options.kindPath, options.functionName)
  const toolRef = options.functionName === undefined
    ? '<toolName>'
    : functionToolName(options.kindPath, options.functionName)
  return [
    `先调用 queryFunctions({ kind: "${options.kind}", keyword: "${keyword}" }) 查函数目录，确认 functionName、必填参数和 failureCodes。`,
    `再调用 guideFunction({ functionId: "${functionId}" }) 读取完整 paramsSchema、usageRules 和 failureModes。`,
    `随后调用 ${toolRef}({ $paths: [...] }) 执行业务函数。`,
  ]
}

function discoverPayloadCatalogs(kinds: readonly ModuleKind[]): readonly PayloadCatalogDescriptor[] {
  const kindMap = new Map(kinds.map((k) => [k.kind, k]))
  return kinds
    .filter((moduleKind) =>
      moduleKind.functions.some((fn) => fn.name === PAYLOAD_QUERY_ACTION_NAME)
      && moduleKind.functions.some((fn) => fn.name === PAYLOAD_GUIDE_ACTION_NAME)
    )
    .map((moduleKind) => ({
      kind: moduleKind.kind,
      kindPath: computeKindPath(moduleKind, kindMap),
      ...(moduleKind.parentKind === undefined ? {} : { parentKind: moduleKind.parentKind }),
    }))
}

function computeKindPath(moduleKind: ModuleKind, kindMap: Map<string, ModuleKind>): readonly string[] {
  const segments: string[] = []
  let current: ModuleKind | undefined = moduleKind
  while (current !== undefined) {
    segments.push(current.kind)
    current = current.parentKind !== undefined ? kindMap.get(current.parentKind) : undefined
  }
  return segments.reverse()
}

type PayloadLookupStepsOptions = Readonly<{
  kind: string
  kindPath: readonly string[]
  functionName?: string
  payloadRefs: readonly string[]
  payloadCatalogs: readonly PayloadCatalogDescriptor[]
}>

function createPayloadLookupSteps(options: PayloadLookupStepsOptions): readonly string[] {
  if (options.payloadRefs.length === 0) return []
  const catalogLocator = formatPayloadCatalogLocator(options.payloadCatalogs)
  const catalogToolNames = formatPayloadCatalogToolNames(options.payloadCatalogs)
  const catalogPathPlaceholders = formatPayloadCatalogPathPlaceholders(options.payloadCatalogs)
  const functionId = options.functionName === undefined
    ? `${options.kindPath.join('.')}.<functionName>`
    : knowledgeFunctionId(options.kindPath, options.functionName)
  return options.payloadRefs.flatMap((payloadRef) => [
    `先定位 payload 目录模块 ${catalogLocator}; 没有实例路径时用 listChildren/findInstance 获取目录实例。`,
    `先调用 ${catalogToolNames.queryPayloads}({ $paths: [${catalogPathPlaceholders}], moduleKind: "${options.kind}", payloadRef: "${payloadRef}", keyword/category/key, limit }) 查询目录并选择真实 key。`,
    `再调用 ${catalogToolNames.guidePayload}({ $paths: [${catalogPathPlaceholders}], moduleKind: "${options.kind}", payloadRef: "${payloadRef}", key }) 读取 paramsSchema、usageRules 和 failureModes。`,
    `最后才调用 ${functionId}; 复杂参数只能按 guidePayload 返回的 schema 字段构造。`,
  ])
}

function formatPayloadCatalogToolNames(catalogs: readonly PayloadCatalogDescriptor[]): { queryPayloads: string, guidePayload: string } {
  const [catalog] = catalogs
  if (catalog === undefined) {
    const fallback = 'payload-catalog'
    return { queryPayloads: `${fallback}_${PAYLOAD_QUERY_ACTION_NAME}`, guidePayload: `${fallback}_${PAYLOAD_GUIDE_ACTION_NAME}` }
  }
  const queryTool = createBusinessFunctionToolName(catalog.kindPath, PAYLOAD_QUERY_ACTION_NAME)
  const guideTool = createBusinessFunctionToolName(catalog.kindPath, PAYLOAD_GUIDE_ACTION_NAME)
  return { queryPayloads: queryTool, guidePayload: guideTool }
}

function formatPayloadCatalogPathPlaceholders(catalogs: readonly PayloadCatalogDescriptor[]): string {
  const [catalog] = catalogs
  if (catalog === undefined) return '<catalogInstanceId>'
  return catalog.kindPath.map((kind) => `<${kind}Id>`).join(', ')
}

function formatPayloadCatalogLocator(catalogs: readonly PayloadCatalogDescriptor[]): string {
  if (catalogs.length === 0) return 'payload-catalog(业务目录模块)'
  return catalogs.map((catalog) =>
    catalog.parentKind === undefined ? catalog.kind : `${catalog.parentKind}/${catalog.kind}`
  ).join('|')
}

function paramNames(schema: LlmJsonSchemaObject): readonly string[] {
  return Object.keys(schema.properties ?? {})
}

function requiredParamNames(schema: LlmJsonSchemaObject): readonly string[] {
  return schema.required ?? []
}

function formatPromptKindIndexLine(layer: ModuleSemanticKnowledgeKindLayer): string {
  const prefix = layer.parentKind === undefined ? `root ${layer.kind}` : `${layer.parentKind}/${layer.kind}`
  const childKinds = layer.childKinds.map((child) => child.kind)
  const children = childKinds.length === 0 ? '' : ` -> [${childKinds.join('|')}]`
  const payload = layer.payloadLookupSteps.length === 0 ? '' : '; payload=payload-catalog'
  return `${prefix}${children}${payload}`
}

function uniqueTexts(values: readonly string[]): readonly string[] {
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

function moduleSummaryGuidesMatchKeyword(
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
      fn.functionId,
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

function containsKeyword(values: readonly string[], keyword: string): boolean {
  return values.some((value) => value.toLowerCase().includes(keyword))
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

function formatPayloadBinding(payload: ModuleParameterPayloadMetadata): string {
  const functions = payload.requiredForFunctions ?? []
  if (functions.length === 0) return payload.payloadRef
  return `${payload.payloadRef}(functions=${functions.join('|')})`
}
