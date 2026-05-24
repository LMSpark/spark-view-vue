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
} from '../protocol'

export type ModuleSemanticKnowledgeModuleSummary = Readonly<{
  kind: string
  name: string
  description: string
  parentKind?: string
  attributeCount: number
  actionCount: number
  payloadCount: number
  payloadRefs: readonly string[]
  childKindCount: number
  children: readonly string[]
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
  example?: LlmJsonValue
}>

export type ModuleSemanticKnowledgeSnapshot = Readonly<{
  modules: readonly ModuleSemanticKnowledgeModuleSummary[]
  functions: readonly ModuleSemanticKnowledgeFunctionSummary[]
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

export class ModuleSemanticKnowledgeProjector {
  public constructor(private readonly kinds: ModuleKindRegistry) {}

  public project(): ModuleSemanticKnowledgeSnapshot {
    const modules = this.queryModules()
    const functions = this.queryFunctions()
    return {
      modules,
      functions,
      promptSnapshot: this.buildPromptSnapshot(modules, functions),
    }
  }

  public queryModules(
    filter: ModuleSemanticKnowledgeModuleFilter = {},
  ): readonly ModuleSemanticKnowledgeModuleSummary[] {
    const kindFilter = normalizeOptionalText(filter.kind)
    const parentKindFilter = normalizeOptionalText(filter.parentKind)
    const keyword = normalizeOptionalText(filter.keyword)?.toLowerCase()
    return this.kinds.list().map((moduleKind) => ({
      kind: moduleKind.kind,
      name: moduleKind.name,
      description: moduleKind.description,
      ...(moduleKind.parentKind === undefined ? {} : { parentKind: moduleKind.parentKind }),
      attributeCount: moduleKind.attributes.length,
      actionCount: moduleKind.actions.length,
      payloadCount: moduleKind.payloads.length,
      payloadRefs: moduleKind.payloads.map((payload) => payload.payloadRef),
      childKindCount: moduleKind.children.length,
      children: [...moduleKind.children],
    })).filter((summary) => {
      if (kindFilter !== undefined && summary.kind !== kindFilter) return false
      if (parentKindFilter !== undefined) {
        if (parentKindFilter === 'root' && summary.parentKind !== undefined) return false
        if (parentKindFilter !== 'root' && summary.parentKind !== parentKindFilter) return false
      }
      if (keyword === undefined) return true
      return summary.kind.toLowerCase().includes(keyword)
        || summary.name.toLowerCase().includes(keyword)
        || summary.description.toLowerCase().includes(keyword)
        || summary.payloadRefs.some((payloadRef) => payloadRef.toLowerCase().includes(keyword))
        || summary.children.some((childKind) => childKind.toLowerCase().includes(keyword))
    })
  }

  public queryFunctions(
    filter: ModuleSemanticKnowledgeFunctionFilter = {},
  ): readonly ModuleSemanticKnowledgeFunctionSummary[] {
    const kindFilter = filter.kind?.trim()
    const keyword = filter.keyword?.trim().toLowerCase()
    const summaries = this.kinds.list().flatMap((moduleKind) =>
      moduleKind.actions.map((action) => summarizeAction(moduleKind.kind, action)),
    )
    return summaries.filter((summary) => {
      if (kindFilter !== undefined && kindFilter.length > 0 && summary.kind !== kindFilter) return false
      if (keyword === undefined || keyword.length === 0) return true
      return summary.action.toLowerCase().includes(keyword)
        || summary.kind.toLowerCase().includes(keyword)
        || summary.actionName.toLowerCase().includes(keyword)
        || summary.description.toLowerCase().includes(keyword)
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
    return ModuleOperationResult.ok(createGuide(parsed.kind, action))
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
        '问题必须可由用户直接回答，不要夹带实现细节、工具名或 schema 字段名。',
        '当缺少用户意图、业务范围、日期含义、审批/提交确认或破坏性操作确认时，不要猜默认值。',
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
    modules: readonly ModuleSemanticKnowledgeModuleSummary[],
    functions: readonly ModuleSemanticKnowledgeFunctionSummary[],
  ): string {
    if (modules.length === 0) {
      return [
        '【AI Knowledge Snapshot】',
        '当前没有注册 ModuleKind。业务方需要先注册能力模块。',
      ].join('\n')
    }

    const lines = [
      '【AI Knowledge Snapshot】',
      '当前 AI 能力由 ModuleKind 元数据投影而来；不要猜测动作参数。',
      '硬规则：不假设、不猜测、不脑补 kind、path、actionName、args；缺少依据时先查询知识与实例。',
      '调用前必须确认真实实例路径与动作 schema；参数只按 paramsSchema.required/properties 填写。',
      '若模块目录显示 payloads=[...],这些只是外部参数指南引用；构造相关复杂参数前必须先读取业务提供的 payload 指南。',
      '知识流程：queryModules() -> queryFunctions({ kind/keyword }) -> guideFunction({ action })。',
      '反问流程：guideHumanQuestion({ context, reason, missingFacts }) -> 用自然语言向用户提问 -> 等待用户下一轮答复。',
      '执行流程：listChildren("/") -> findInstance("/", kind, query) -> describeKind(kind) -> invokeAction(path, actionName, args)。',
      '模块目录：',
      ...modules.map(formatModuleLine),
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

function summarizeAction(kind: string, action: ModuleActionMetadata): ModuleSemanticKnowledgeFunctionSummary {
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
  }
}

function createGuide(kind: string, action: ModuleActionMetadata): ModuleSemanticKnowledgeFunctionGuide {
  return {
    action: knowledgeAction(kind, action.name),
    kind,
    actionName: action.name,
    description: action.description,
    paramsSchema: action.paramsSchema,
    ...(action.resultSchema === undefined ? {} : { resultSchema: action.resultSchema }),
    usageRules: action.usageRules ?? [],
    failureModes: action.failureModes ?? [],
    ...(action.example === undefined ? {} : { example: action.example }),
  }
}

function paramNames(schema: LlmJsonSchemaObject): readonly string[] {
  return Object.keys(schema.properties ?? {})
}

function requiredParamNames(schema: LlmJsonSchemaObject): readonly string[] {
  return schema.required ?? []
}

function formatModuleLine(module: ModuleSemanticKnowledgeModuleSummary): string {
  const children = module.children.length === 0 ? '[]' : `[${module.children.join(', ')}]`
  const payloads = module.payloadRefs.length === 0 ? '[]' : `[${module.payloadRefs.join(', ')}]`
  const parent = module.parentKind === undefined ? 'root' : `parent=${module.parentKind}`
  return `- ${module.kind}(${module.name}; ${parent}): ${module.description}; actions=${String(module.actionCount)} attrs=${String(module.attributeCount)} payloads=${payloads} children=${children}`
}

function formatFunctionLine(summary: ModuleSemanticKnowledgeFunctionSummary): string {
  const params = summary.paramNames.length === 0 ? '[]' : `[${summary.paramNames.join(', ')}]`
  const required = summary.requiredParamNames.length === 0 ? '[]' : `[${summary.requiredParamNames.join(', ')}]`
  const failures = summary.failureCodes.length === 0 ? '[]' : `[${summary.failureCodes.join(', ')}]`
  return `- ${summary.action}: ${summary.description}; params=${params} required=${required} usageRules=${String(summary.usageRuleCount)} failureCodes=${failures}`
}
