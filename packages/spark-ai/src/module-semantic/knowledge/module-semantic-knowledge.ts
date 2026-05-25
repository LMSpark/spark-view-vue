/**
 * Module-semantic knowledge projection.
 *
 * This layer restores the old "knowledge" contract on top of the current
 * module-semantic protocol: it exposes module summaries, action summaries,
 * action guides, and a compact prompt snapshot. ProtocolToolRouter also
 * exposes the three query/guide operations as direct LLM-visible tools.
 */

import type { LlmJsonSchemaObject, LlmJsonValue } from '../../schema'
import type { ModuleKindRegistry } from '../internal/module-kind-registry'
import {
  ModuleOperationResult,
  type ModuleActionFailureMode,
  type ModuleActionMetadata,
  type ModuleActionResultSchema,
  type ModuleKind,
  type ModuleParameterPayloadMetadata,
} from '../protocol'

const PAYLOAD_QUERY_ACTION_NAME = 'queryPayloads'
const PAYLOAD_GUIDE_ACTION_NAME = 'guidePayload'
const FIXED_PROTOCOL_TOOL_USAGE_LINES: readonly string[] = [
  '固定协议工具用法：',
  '1. queryModules：查 ModuleKind 分层知识目录；先看入口 kind、子 kind 摘要、实例指南、属性指南、函数指南和 payload 查找步骤。',
  '2. listChildren：浏览根入口或父实例下的子实例，拿候选 ModuleInstanceRef。',
  '3. findInstance：按目标 kind 的 instanceGuide.queryFields 查询实例，返回 ref.id/ref.label/ref.summary。',
  '4. describeKind：查单个 kind 的原始元数据，确认 attributes/actions/payloads/children。',
  '5. getAttribute：读取具体实例 path 末段 kind 的 readable 属性。',
  '6. setAttribute：写入具体实例 path 末段 kind 的 writable 属性，value 按属性 schema 构造。',
  '7. queryFunctions：按 kind/keyword 查动作目录，确认 action、actionName、必填参数、失败码和 payloadRefs。',
  '8. guideFunction：查单个 action 的完整 paramsSchema、usageRules、failureModes、resultSchema 和 payloadLookupSteps。',
  '9. invokeAction：在具体实例 path 上执行 action；args 按 guideFunction/describeKind schema 组装。',
  '10. guideHumanQuestion：缺少用户事实或需要确认时生成反问，拿到用户回复后继续工具流程。',
]

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
  action: string
  actionName: string
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
  actionName: string
  description: string
  requiredParamNames: readonly string[]
  payloadRefs: readonly string[]
}>

export type ModuleSemanticKnowledgeChildKindSummary = Readonly<{
  kind: string
  name: string
  description: string
  actionNames: readonly string[]
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
  actionCount: number
  actionNames: readonly string[]
  payloadCount: number
  payloadRefs: readonly string[]
  payloadActionRefs: readonly string[]
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
  action: string
  kind: string
  actionName: string
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
  action: string
  kind: string
  actionName: string
  description: string
  paramsSchema: LlmJsonSchemaObject
  resultSchema?: ModuleActionResultSchema
  usageRules: readonly string[]
  failureModes: readonly ModuleActionFailureMode[]
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
  action?: string
  kind?: string
  actionName?: string
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

type ParsedKnowledgeAction = Readonly<{
  kind: string
  actionName: string
}>

type PayloadCatalogDescriptor = Readonly<{
  kind: string
  parentKind?: string
}>

type ActionKnowledgeProjectionOptions = Readonly<{
  kind: string
  action: ModuleActionMetadata
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
      promptSnapshot: this.buildPromptSnapshot(kindLayers, functions),
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
      const actionNames = moduleKind.actions.map((action) => action.name)
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
        actionCount: moduleKind.actions.length,
        actionNames,
        payloadCount: moduleKind.payloads.length,
        payloadRefs: moduleKind.payloads.map((payload) => payload.payloadRef),
        payloadActionRefs: moduleKind.payloads.map(formatPayloadBinding),
        payloadLookupSteps: createPayloadLookupSteps({
          kind: moduleKind.kind,
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
        || summary.actionNames.some((actionName) => actionName.toLowerCase().includes(keyword))
        || summary.payloadRefs.some((payloadRef) => payloadRef.toLowerCase().includes(keyword))
        || summary.payloadActionRefs.some((payloadRef) => payloadRef.toLowerCase().includes(keyword))
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
    const payloadCatalogs = discoverPayloadCatalogs(this.kinds.list())
    const summaries = this.kinds.list().flatMap((moduleKind) =>
      moduleKind.actions.map((action) => summarizeAction({
        kind: moduleKind.kind,
        action,
        payloads: moduleKind.payloads,
        payloadCatalogs,
      })),
    )
    return summaries.filter((summary) => {
      if (kindFilter !== undefined && kindFilter.length > 0 && summary.kind !== kindFilter) return false
      if (keyword === undefined || keyword.length === 0) return true
      return summary.action.toLowerCase().includes(keyword)
        || summary.kind.toLowerCase().includes(keyword)
        || summary.actionName.toLowerCase().includes(keyword)
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
        'guideFunction requires either action or kind + actionName.',
        'Use action format "<kind>.<actionName>", or pass kind and actionName separately.',
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
    const action = moduleKind.findAction(parsed.actionName)
    if (action === undefined) {
      return ModuleOperationResult.failCode(
        'FUNCTION_NOT_FOUND',
        `action "${parsed.actionName}" is not declared on kind "${parsed.kind}".`,
        'Call queryFunctions({ kind }) or describeKind(kind) before retrying.',
      )
    }
    return ModuleOperationResult.ok(createGuide({
      kind: parsed.kind,
      action,
      payloads: moduleKind.payloads,
      payloadCatalogs: discoverPayloadCatalogs(this.kinds.list()),
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
        '如仍不确定模块或动作，先 queryModules / queryFunctions。',
        '执行前用 guideFunction 或 describeKind 确认 action schema。',
        '具备足够事实后再 invokeAction。',
      ],
    })
  }

  private buildPromptSnapshot(
    kindLayers: readonly ModuleSemanticKnowledgeKindLayer[],
    functions: readonly ModuleSemanticKnowledgeFunctionSummary[],
  ): string {
    if (kindLayers.length === 0) {
      return [
        '【AI Knowledge Snapshot】',
        ...FIXED_PROTOCOL_TOOL_USAGE_LINES,
        '当前没有注册 ModuleKind。业务方需要先注册能力模块。',
      ].join('\n')
    }

    const lines = [
      '【AI Knowledge Snapshot】',
      '知识分层来源：ModuleKind 元数据、实例发现协议、属性协议、函数协议和参数目录协议。',
      ...FIXED_PROTOCOL_TOOL_USAGE_LINES,
      '总流程：queryModules -> listChildren/findInstance -> describeKind -> getAttribute/setAttribute 或 queryFunctions -> guideFunction -> invokeAction。',
      '实例流程：queryModules(kind/keyword).instanceGuide 查看 queryFields -> listChildren/findInstance 获取 ModuleInstanceRef -> 用 ref.id 拼接 path。',
      '子 kind 流程：queryModules(kind).childKindSummaries 查看子 kind 功能摘要 -> queryModules({ kind: childKind }) 读取子层完整指南 -> 以当前实例 path 查询子实例。',
      '属性流程：describeKind(kind).attributes -> getAttribute(path, attrName) 或 setAttribute(path, attrName, value)。',
      '函数流程：queryFunctions({ kind/keyword }) -> guideFunction({ action }) -> invokeAction(path, actionName, args)。',
      '复杂参数流程：payload-catalog.queryPayloads -> payload-catalog.guidePayload -> invokeAction(目标动作)。',
      '反问流程：guideHumanQuestion({ context, reason, missingFacts }) -> 用自然语言向用户提问 -> 等待用户下一轮答复。',
      '分层 kind 目录：',
      ...kindLayers.map(formatKindLayerLine),
      '函数目录摘要：',
      ...functions.map(formatFunctionLine),
    ]
    return lines.join('\n')
  }
}

function knowledgeAction(kind: string, actionName: string): string {
  return `${kind}.${actionName}`
}

function parseGuideInput(input: ModuleSemanticKnowledgeFunctionGuideInput): ParsedKnowledgeAction | null {
  const action = input.action?.trim()
  if (action !== undefined && action.length > 0) {
    const splitAt = action.indexOf('.')
    if (splitAt > 0 && splitAt < action.length - 1) {
      return {
        kind: action.slice(0, splitAt),
        actionName: action.slice(splitAt + 1),
      }
    }
    return null
  }

  const kind = input.kind?.trim()
  const actionName = input.actionName?.trim()
  if (kind === undefined || kind.length === 0 || actionName === undefined || actionName.length === 0) return null
  return { kind, actionName }
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

function summarizeAction(options: ActionKnowledgeProjectionOptions): ModuleSemanticKnowledgeFunctionSummary {
  const { kind, action, payloads, payloadCatalogs } = options
  const payloadRefs = payloadRefsForAction(payloads, action.name)
  return {
    action: knowledgeAction(kind, action.name),
    kind,
    actionName: action.name,
    description: action.description,
    paramNames: paramNames(action.paramsSchema),
    requiredParamNames: requiredParamNames(action.paramsSchema),
    failureCodes: action.failureModes?.map((mode) => mode.code) ?? [],
    usageRuleCount: action.usageRules?.length ?? 0,
    failureModeCount: action.failureModes?.length ?? 0,
    functionLookupSteps: createFunctionLookupSteps({ kind, actionName: action.name }),
    payloadRefs,
    requiresPayloadGuide: payloadRefs.length > 0,
    payloadLookupSteps: createPayloadLookupSteps({
      kind,
      actionName: action.name,
      payloadRefs,
      payloadCatalogs,
    }),
  }
}

function createGuide(options: ActionKnowledgeProjectionOptions): ModuleSemanticKnowledgeFunctionGuide {
  const { kind, action, payloads, payloadCatalogs } = options
  const payloadRefs = payloadRefsForAction(payloads, action.name)
  return {
    action: knowledgeAction(kind, action.name),
    kind,
    actionName: action.name,
    description: action.description,
    paramsSchema: action.paramsSchema,
    ...(action.resultSchema === undefined ? {} : { resultSchema: action.resultSchema }),
    usageRules: action.usageRules ?? [],
    failureModes: action.failureModes ?? [],
    functionLookupSteps: createFunctionLookupSteps({ kind, actionName: action.name }),
    payloadRefs,
    requiresPayloadGuide: payloadRefs.length > 0,
    payloadLookupSteps: createPayloadLookupSteps({
      kind,
      actionName: action.name,
      payloadRefs,
      payloadCatalogs,
    }),
    ...(action.example === undefined ? {} : { example: action.example }),
  }
}

type KindLayerOptions = Readonly<{
  moduleKind: ModuleKind
  allKinds: readonly ModuleKind[]
  payloadCatalogs: readonly PayloadCatalogDescriptor[]
}>

function createKindLayer(options: KindLayerOptions): ModuleSemanticKnowledgeKindLayer {
  const { moduleKind, allKinds, payloadCatalogs } = options
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
    functionLookupSteps: createModuleFunctionLookupSteps(moduleKind),
    payloadLookupSteps: createPayloadLookupSteps({
      kind: moduleKind.kind,
      payloadRefs: moduleKind.payloads.map((payload) => payload.payloadRef),
      payloadCatalogs,
    }),
    attributes: createAttributeGuides(moduleKind),
    functions: createLayerFunctions(moduleKind),
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

function createLayerFunctions(moduleKind: ModuleKind): readonly ModuleSemanticKnowledgeLayerFunction[] {
  return moduleKind.actions.map((action) => {
    const payloadRefs = payloadRefsForAction(moduleKind.payloads, action.name)
    return {
      action: knowledgeAction(moduleKind.kind, action.name),
      actionName: action.name,
      description: action.description,
      paramNames: paramNames(action.paramsSchema),
      requiredParamNames: requiredParamNames(action.paramsSchema),
      lookupSteps: createFunctionLookupSteps({ kind: moduleKind.kind, actionName: action.name }),
      invokeStep: `invokeAction({ path, actionName: "${action.name}", args })`,
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
      `函数调用复用同一个实例 path：invokeAction。`,
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

function createModuleFunctionLookupSteps(moduleKind: ModuleKind): readonly string[] {
  if (moduleKind.actions.length === 0) return []
  return [
    `queryFunctions({ kind: "${moduleKind.kind}" }) 查看 ${moduleKind.kind} 函数目录。`,
    `guideFunction({ action: "${moduleKind.kind}.<actionName>" }) 查看单个函数 paramsSchema、usageRules 和 failureModes。`,
    `invokeAction({ path, actionName, args }) 执行业务函数。`,
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
      actionNames: [],
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
    actionNames: child.actions.map((action) => action.name),
    attributeNames: child.attributes.map((attribute) => attribute.name),
    payloadRefs: child.payloads.map((payload) => payload.payloadRef),
    childKindNames: [...child.children],
    attributeSummaries: child.attributes.map((attribute) => ({
      name: attribute.name,
      description: attribute.description,
      access: attributeAccessMode(attribute.readable, attribute.writable),
    })),
    functionSummaries: child.actions.map((action) => ({
      actionName: action.name,
      description: action.description,
      requiredParamNames: requiredParamNames(action.paramsSchema),
      payloadRefs: payloadRefsForAction(child.payloads, action.name),
    })),
    detailLookupSteps: [
      `queryModules({ kind: "${child.kind}" }) 读取 ${child.kind} 自己的 instanceGuide、attributeGuides 和 functionGuides。`,
      `describeKind("${child.kind}") 查看 ${child.kind} 的 attributes/actions/payloads/children 元数据。`,
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

function payloadRefsForAction(
  payloads: readonly ModuleParameterPayloadMetadata[],
  actionName: string,
): readonly string[] {
  return payloads
    .filter((payload) => {
      const requiredForActions = payload.requiredForActions ?? []
      return requiredForActions.length === 0 || requiredForActions.includes(actionName)
    })
    .map((payload) => payload.payloadRef)
}

type FunctionLookupStepsOptions = Readonly<{
  kind: string
  actionName?: string
}>

function createFunctionLookupSteps(options: FunctionLookupStepsOptions): readonly string[] {
  const keyword = options.actionName ?? '<actionName 或业务关键词>'
  const action = options.actionName === undefined ? `${options.kind}.<actionName>` : knowledgeAction(options.kind, options.actionName)
  return [
    `先调用 queryFunctions({ kind: "${options.kind}", keyword: "${keyword}" }) 查函数目录，确认 actionName、必填参数和 failureCodes。`,
    `再调用 guideFunction({ action: "${action}" }) 读取完整 paramsSchema、usageRules 和 failureModes。`,
    `随后调用 invokeAction({ path, actionName: "${options.actionName ?? '<actionName>'}", args })。`,
  ]
}

function discoverPayloadCatalogs(kinds: readonly ModuleKind[]): readonly PayloadCatalogDescriptor[] {
  return kinds
    .filter((moduleKind) =>
      moduleKind.actions.some((action) => action.name === PAYLOAD_QUERY_ACTION_NAME)
      && moduleKind.actions.some((action) => action.name === PAYLOAD_GUIDE_ACTION_NAME)
    )
    .map((moduleKind) => ({
      kind: moduleKind.kind,
      ...(moduleKind.parentKind === undefined ? {} : { parentKind: moduleKind.parentKind }),
    }))
}

type PayloadLookupStepsOptions = Readonly<{
  kind: string
  actionName?: string
  payloadRefs: readonly string[]
  payloadCatalogs: readonly PayloadCatalogDescriptor[]
}>

function createPayloadLookupSteps(options: PayloadLookupStepsOptions): readonly string[] {
  if (options.payloadRefs.length === 0) return []
  const catalogLocator = formatPayloadCatalogLocator(options.payloadCatalogs)
  const catalogActionTarget = formatPayloadCatalogActionTarget(options.payloadCatalogs)
  const action = options.actionName === undefined ? `${options.kind}.<actionName>` : knowledgeAction(options.kind, options.actionName)
  return options.payloadRefs.flatMap((payloadRef) => [
    `先定位 payload 目录模块 ${catalogLocator}; 没有实例路径时用 listChildren/findInstance 获取目录实例。`,
    `先调用 ${catalogActionTarget}.${PAYLOAD_QUERY_ACTION_NAME}({ moduleKind: "${options.kind}", payloadRef: "${payloadRef}", keyword/category/key, limit }) 查询目录并选择真实 key。`,
    `再调用 ${catalogActionTarget}.${PAYLOAD_GUIDE_ACTION_NAME}({ moduleKind: "${options.kind}", payloadRef: "${payloadRef}", key }) 读取 paramsSchema、usageRules 和 failureModes。`,
    `最后才调用 ${action}; 复杂参数只能按 guidePayload 返回的 schema 字段构造。`,
  ])
}

function formatPayloadCatalogLocator(catalogs: readonly PayloadCatalogDescriptor[]): string {
  if (catalogs.length === 0) return 'payload-catalog(业务目录模块)'
  return catalogs.map((catalog) =>
    catalog.parentKind === undefined ? catalog.kind : `${catalog.parentKind}/${catalog.kind}`
  ).join('|')
}

function formatPayloadCatalogActionTarget(catalogs: readonly PayloadCatalogDescriptor[]): string {
  if (catalogs.length === 0) return 'payload-catalog(业务目录模块)'
  return catalogs.map((catalog) => catalog.kind).join('|')
}

function paramNames(schema: LlmJsonSchemaObject): readonly string[] {
  return Object.keys(schema.properties ?? {})
}

function requiredParamNames(schema: LlmJsonSchemaObject): readonly string[] {
  return schema.required ?? []
}

function formatFunctionLine(summary: ModuleSemanticKnowledgeFunctionSummary): string {
  const params = summary.paramNames.length === 0 ? '[]' : `[${summary.paramNames.join(', ')}]`
  const required = summary.requiredParamNames.length === 0 ? '[]' : `[${summary.requiredParamNames.join(', ')}]`
  const failures = summary.failureCodes.length === 0 ? '[]' : `[${summary.failureCodes.join(', ')}]`
  const functionFlow = summary.functionLookupSteps.length === 0 ? '[]' : '[queryFunctions -> guideFunction -> invokeAction]'
  const payloads = summary.payloadRefs.length === 0 ? '[]' : `[${summary.payloadRefs.join(', ')}]`
  const payloadFlow = summary.payloadLookupSteps.length === 0 ? '[]' : '[queryPayloads -> guidePayload -> invokeAction]'
  return `- ${summary.action}: ${summary.description}; params=${params} required=${required} usageRules=${String(summary.usageRuleCount)} failureCodes=${failures} functionFlow=${functionFlow} payloads=${payloads} payloadFlow=${payloadFlow}`
}

function formatKindLayerLine(layer: ModuleSemanticKnowledgeKindLayer): string {
  const indent = '  '.repeat(layer.level)
  const parent = layer.parentKind === undefined ? 'root' : `parent=${layer.parentKind}`
  const instance = `instance=[${layer.instanceGuide.discoveryScope}; ref=${layer.instanceGuide.refShape}; path=${layer.instanceGuide.pathPattern}; query=${formatList(layer.instanceGuide.queryFields)}]`
  const attrs = layer.attributes.length === 0
    ? '[]'
    : `[${layer.attributes.map((attribute) => `${attribute.name}(${attribute.access})`).join(', ')}]`
  const functions = layer.functions.length === 0
    ? '[]'
    : `[${layer.functions.map((fn) => `${fn.actionName}(required=${formatList(fn.requiredParamNames)})`).join(', ')}]`
  const children = layer.childKinds.length === 0
    ? '[]'
    : `[${layer.childKinds.map((child) => `${child.kind}(${child.name}; attrs=${formatList(child.attributeNames)}; actions=${formatList(child.actionNames)}; children=${formatList(child.childKindNames)})`).join(', ')}]`
  const payloads = layer.payloadLookupSteps.length === 0 ? '[]' : '[queryPayloads -> guidePayload -> invokeAction]'
  return `${indent}- ${layer.kind}(${layer.name}; ${parent}): ${layer.description}; ${instance}; children=${children}; attrs=${attrs}; functions=${functions}; instanceFlow=[listChildren/findInstance -> path]; attrFlow=[describeKind -> getAttribute/setAttribute]; functionFlow=[queryFunctions -> guideFunction -> invokeAction]; payloadFlow=${payloads}`
}

function formatList(values: readonly string[]): string {
  return values.length === 0 ? '[]' : `[${values.join('|')}]`
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
      fn.action,
      fn.actionName,
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
    ...child.actionNames,
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
      fn.actionName,
      fn.description,
      ...fn.requiredParamNames,
      ...fn.payloadRefs,
    ], keyword))
    || containsKeyword(child.detailLookupSteps, keyword)
}

function formatPayloadBinding(payload: ModuleParameterPayloadMetadata): string {
  const actions = payload.requiredForActions ?? []
  if (actions.length === 0) return payload.payloadRef
  return `${payload.payloadRef}(actions=${actions.join('|')})`
}
