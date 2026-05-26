/**
 * Module-semantic knowledge projection.
 *
 * The projector turns the registered ModuleKind graph into module summaries,
 * function summaries, function guides, human-question guidance, and a compact
 * prompt snapshot. ProtocolToolRouter exposes those projections through the
 * query/guide tools that are visible to the LLM.
 *
 * Types live in knowledge-types.ts; helper functions live in
 * knowledge-support.ts. This file owns only the projector class.
 */

import type { ModuleKindRegistry } from '../internal/module-kind-registry'
import { resolveModuleKindPath } from '../internal/module-kind-path'
import {
  ModuleOperationResult,
} from '../protocol'
import type {
  ModuleSemanticKnowledgeFunctionFilter,
  ModuleSemanticKnowledgeFunctionGuide,
  ModuleSemanticKnowledgeFunctionGuideInput,
  ModuleSemanticKnowledgeFunctionSummary,
  ModuleSemanticKnowledgeKindLayer,
  ModuleSemanticKnowledgeModuleFilter,
  ModuleSemanticKnowledgeModuleSummary,
  ModuleSemanticKnowledgeSnapshot,
} from './knowledge-types'
import type {
  ModuleSemanticHumanQuestionGuide,
  ModuleSemanticHumanQuestionGuideInput,
} from './knowledge-types'
import {
  buildHumanQuestion,
  createGuide,
  createKindLayer,
  createPayloadLookupSteps,
  discoverPayloadCatalogs,
  FIXED_PROTOCOL_TOOL_ROUTING_LINES,
  formatPayloadBinding,
  formatPromptKindIndexLine,
  moduleSummaryGuidesMatchKeyword,
  normalizeOptionalText,
  normalizeTextList,
  parseGuideInput,
  PROMPT_KIND_INDEX_LIMIT,
  summarizeFunction,
} from './knowledge-support'

// ── 投影器 class ──────────────────────────────────────────────

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
          kindPath: resolveModuleKindPath(moduleKind, moduleKinds),
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
      const kindPath = resolveModuleKindPath(moduleKind, allKinds)
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
      return summary.toolName.toLowerCase().includes(keyword)
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
        'guideFunction requires either toolName or kind + functionName.',
        'Use toolName format "<kindPath>_<functionName>", or pass kind and functionName separately.',
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
    const actualKindPath = resolveModuleKindPath(moduleKind, allKinds)
    if (parsed.kindPathFromTool !== undefined) {
      if (parsed.kindPathFromTool.length !== actualKindPath.length
        || parsed.kindPathFromTool.some((segment, i) => segment !== actualKindPath[i])) {
        return ModuleOperationResult.failCode(
          'KIND_PATH_MISMATCH',
          `toolName kindPath "${parsed.kindPathFromTool.join('_')}" does not match registered kind path "${actualKindPath.join('_')}".`,
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
        '具备足够事实后再调用对应 OpenAI function tool。',
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
