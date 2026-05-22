/**
 * Module-semantic knowledge projection.
 *
 * This layer restores the old "knowledge" contract on top of the current
 * fixed six-tool protocol: it exposes module summaries, action summaries,
 * action guides, and a compact prompt snapshot without adding new LLM-visible
 * tools.
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
  parentKind?: string | undefined
  attributeCount: number
  actionCount: number
  payloadCount: number
  payloadRefs: readonly string[]
  childKindCount: number
  children: readonly string[]
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
  resultSchema?: ModuleActionResultSchema | undefined
  usageRules: readonly string[]
  failureModes: readonly ModuleActionFailureMode[]
  example?: LlmJsonValue | undefined
}>

export type ModuleSemanticKnowledgeSnapshot = Readonly<{
  modules: readonly ModuleSemanticKnowledgeModuleSummary[]
  functions: readonly ModuleSemanticKnowledgeFunctionSummary[]
  promptSnapshot: string
}>

export type ModuleSemanticKnowledgeFunctionFilter = Readonly<{
  kind?: string | undefined
  keyword?: string | undefined
}>

export type ModuleSemanticKnowledgeFunctionGuideInput = Readonly<{
  action?: string | undefined
  kind?: string | undefined
  actionName?: string | undefined
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

  public queryModules(): readonly ModuleSemanticKnowledgeModuleSummary[] {
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
    }))
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
      '发现流程：listChildren("/") -> findInstance("/", kind, query) -> describeKind(kind) -> invokeAction(path, actionName, args)。',
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
