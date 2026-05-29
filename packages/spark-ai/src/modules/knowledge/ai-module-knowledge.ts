/**
 * ═══════════════════════════════════════════════════════════════
 * modules/knowledge/ai-module-knowledge.ts — AiModule 知识投影器
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】modules 层的知识投影入口。将已注册的 AiModule 图转换为
 *   LLM 可读的结构化知识产物：模块摘要、模块指南、函数摘要、函数指南、人工提问指南
 *   以及紧凑的 prompt 快照。ProtocolToolRouter 通过 module_query / module_attribute_guide / module_function_guide
 *   等工具将这些投影暴露给 LLM。
 *
 * 【核心类】
 *   AiModuleKnowledgeProjector — 知识投影器
 *     ├─ project()              — 投影完整快照（模块 + 函数 + kindLayer + prompt 文本）
 *     ├─ queryModules(filter)   — 查询模块目录摘要
 *     ├─ guideKind(kind)        — 查询单个模块轻量指南
 *     ├─ queryFunctions(filter) — 查询函数目录摘要
 *     ├─ guideAttribute(input)  — 查询单个属性完整指南
 *     ├─ guideFunction(input)   — 查询单个函数完整指南
 *     └─ guideHumanQuestion()   — 生成人工提问指南
 *
 * 【数据流】
 *   1. AiModuleRuntime 构造时创建 AiModuleKnowledgeProjector
 *   2. runtime.projectKnowledge() → projector.project() → AiModuleKnowledgeSnapshot
 *   3. tool-loop-runner 将 promptSnapshot 拼接到系统提示词
 *   4. LLM 调用 module_query → projector.queryModules / queryFunctions
 *   5. LLM 调用 module_attribute_guide / module_function_guide → projector.guideAttribute / guideFunction
 *
 * 【依赖】内部 registry + knowledge-support.ts（helper 函数）+ knowledge-types.ts（类型定义）
 * ═══════════════════════════════════════════════════════════════
 */

import type { AiModuleRegistry } from '../internal/ai-module-registry'
import { resolveAiModulePath } from '../internal/ai-module-path'
import {
  AiModuleResult,
} from '../protocol'
import type {
  AiModuleKnowledgeAttributeDetailGuide,
  AiModuleKnowledgeAttributeGuideInput,
  AiModuleKnowledgeFunctionFilter,
  AiModuleKnowledgeFunctionGuide,
  AiModuleKnowledgeFunctionGuideInput,
  AiModuleKnowledgeFunctionSummary,
  AiModuleHumanQuestionGuide,
  AiModuleHumanQuestionGuideInput,
  AiModuleKnowledgeKindGuide,
  AiModuleKnowledgeKindLayer,
  AiModuleKnowledgeModuleFilter,
  AiModuleKnowledgeModuleSummary,
  AiModuleKnowledgeSnapshot,
} from './knowledge-types'
import {
  attributeAccessMode,
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

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · AiModuleKnowledgeProjector 类
// ═══════════════════════════════════════════════════════════════

/**
 * 知识投影器。
 *
 * 将注册表中的 AiModule 图投影为 LLM 可读的结构化知识。
 * 所有方法均为同步（基于内存中的注册表），不涉及异步 I/O。
 */
export class AiModuleKnowledgeProjector {
  public constructor(private readonly kinds: AiModuleRegistry) {}

  // ── 完整快照投影 ──────────────────────────────────────────

  /** 投影完整知识快照：模块目录 + 函数目录 + kindLayer + prompt 文本 */
  public project(): AiModuleKnowledgeSnapshot {
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

  // ── kindLayer 投影 ─────────────────────────────────────────

  /** 为所有已注册模块生成知识层次结构（含属性/函数/子kind/荷载指南） */
  public queryKindLayers(): readonly AiModuleKnowledgeKindLayer[] {
    const moduleKinds = this.kinds.list()
    const payloadCatalogs = discoverPayloadCatalogs(moduleKinds)
    return moduleKinds.map((moduleKind) => createKindLayer({
      moduleKind,
      allKinds: moduleKinds,
      payloadCatalogs,
    }))
  }

  // ── kind 指南查询 ──────────────────────────────────────────

  /**
   * 查询单个 kind 的轻量指南。
   *
   * 只返回模块用途、使用路线、属性/子模块/payload 摘要和函数说明。
   * 单个属性的 schema/example 通过 module_attribute_guide(kind,attrName) 按需读取；
   * 单个函数的 paramsSchema、usageRules、failureModes 等细节通过
   * module_function_guide(kind,functionName) 按需读取。
   */
  public guideKind(kind: string): AiModuleResult<AiModuleKnowledgeKindGuide> {
    const normalizedKind = normalizeOptionalText(kind)
    if (normalizedKind === undefined) {
      return AiModuleResult.failCode(
        'INVALID_GUIDE_REQUEST',
        'module_guide requires a non-empty kind.',
        'Call module_guide({ kind }) to inspect module purpose and function descriptions.',
      )
    }

    const moduleKind = this.kinds.get(normalizedKind)
    if (moduleKind === undefined) {
      return AiModuleResult.failCode(
        'KIND_NOT_REGISTERED',
        `kind "${normalizedKind}" is not registered.`,
        'Call module_query() or module_find({ path: "/" }) to inspect available kinds.',
      )
    }

    const allKinds = this.kinds.list()
    const layer = createKindLayer({
      moduleKind,
      allKinds,
      payloadCatalogs: discoverPayloadCatalogs(allKinds),
    })
    return AiModuleResult.ok({
      knowledgeLevel: 'overview',
      kind: layer.kind,
      name: layer.name,
      description: layer.description,
      registeredPrompt: layer.description,
      ...(layer.parentKind === undefined ? {} : { parentKind: layer.parentKind }),
      pathPattern: layer.pathPattern,
      directoryFirstRule: '先用 module_query/module_guide 获取目录概要并选择目标，再用 module_attribute_guide/module_function_guide 或 payload guide 获取具体契约。',
      howToUse: [
        ...layer.instanceLookupSteps,
        ...layer.childLookupSteps,
        ...layer.attributeLookupSteps,
        ...layer.functionLookupSteps,
      ],
      nextSteps: [
        '用 module_query({ kind, includeFunctions:true }) 获取函数目录。',
        '选定 attrName 后，用 module_attribute_guide({ kind, attrName }) 获取属性 schema、读写权限和示例。',
        '选定 functionName 后，用 module_function_guide({ kind, functionName }) 获取参数、规则和失败恢复。',
        '定位实例 path 后，用 module_call({ path, functionName, args }) 执行。',
      ],
      attributes: layer.attributes.map((attribute) => ({
        knowledgeLevel: 'directory',
        name: attribute.name,
        description: attribute.description,
        access: attribute.access,
        readable: attribute.readable,
        writable: attribute.writable,
        detailToolName: attribute.detailToolName,
        detailLookupStep: attribute.detailLookupStep,
      })),
      functions: layer.functions.map((fn) => ({
        knowledgeLevel: 'directory',
        name: fn.functionName,
        functionName: fn.functionName,
        description: fn.description,
        detailLookupStep: fn.detailLookupStep,
      })),
      payloads: moduleKind.payloads.map((payload) => ({
        payloadRef: payload.payloadRef,
        description: payload.description,
        requiredForFunctions: payload.requiredForFunctions === undefined ? [] : [...payload.requiredForFunctions],
      })),
      children: [...moduleKind.children],
      childKinds: layer.childKinds.map((child) => ({
        kind: child.kind,
        name: child.name,
        description: child.description,
      })),
    })
  }

  // ── 属性详细指南 ──────────────────────────────────────────

  /**
   * 查询单个属性的完整指南（schema、读写权限、读写步骤等）。
   * 失败时返回 AiModuleResult.failCode 带机器可读错误码。
   */
  public guideAttribute(
    input: AiModuleKnowledgeAttributeGuideInput,
  ): AiModuleResult<AiModuleKnowledgeAttributeDetailGuide> {
    const kind = normalizeOptionalText(input.kind)
    const attrName = normalizeOptionalText(input.attrName)
    if (kind === undefined || attrName === undefined) {
      return AiModuleResult.failCode(
        'INVALID_ATTRIBUTE_GUIDE_REQUEST',
        'module_attribute_guide requires kind and attrName for attribute guidance.',
        'Call module_attribute_guide({ kind, attrName }) after module_guide({ kind }) selects a real attribute name.',
      )
    }

    const moduleKind = this.kinds.get(kind)
    if (moduleKind === undefined) {
      return AiModuleResult.failCode(
        'KIND_NOT_REGISTERED',
        `kind "${kind}" is not registered.`,
        'Call module_query() or module_find({ path: "/" }) to inspect available kinds.',
      )
    }

    const attribute = moduleKind.findAttribute(attrName)
    if (attribute === undefined) {
      return AiModuleResult.failCode(
        'ATTRIBUTE_NOT_FOUND',
        `attribute "${attrName}" is not declared on kind "${kind}".`,
        'Call module_guide({ kind }) to inspect real attribute names before retrying.',
      )
    }

    return AiModuleResult.ok({
      knowledgeLevel: 'detail',
      kind,
      attrName,
      name: attribute.name,
      description: attribute.description,
      access: attributeAccessMode(attribute.readable, attribute.writable),
      readable: attribute.readable,
      writable: attribute.writable,
      directoryLookupStep: `module_guide({ kind: "${kind}" })`,
      schema: attribute.schema,
      ...(attribute.readable ? { readStep: `module_attr({ op: "get", path, attrName: "${attribute.name}" })` } : {}),
      ...(attribute.writable ? { writeStep: `module_attr({ op: "set", path, attrName: "${attribute.name}", value })` } : {}),
      ...(attribute.example === undefined ? {} : { example: attribute.example }),
    })
  }

  // ── 模块目录查询 ──────────────────────────────────────────

  /** 查询模块目录摘要，支持 kind / parentKind / keyword 过滤 */
  public queryModules(
    filter: AiModuleKnowledgeModuleFilter = {},
  ): readonly AiModuleKnowledgeModuleSummary[] {
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
          kindPath: resolveAiModulePath(moduleKind, moduleKinds),
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

  // ── 函数目录查询 ──────────────────────────────────────────

  /** 查询函数目录摘要，支持 kind / keyword 过滤 */
  public queryFunctions(
    filter: AiModuleKnowledgeFunctionFilter = {},
  ): readonly AiModuleKnowledgeFunctionSummary[] {
    const kindFilter = filter.kind?.trim()
    const keyword = filter.keyword?.trim().toLowerCase()
    const allKinds = this.kinds.list()
    const payloadCatalogs = discoverPayloadCatalogs(allKinds)
    const summaries = allKinds.flatMap((moduleKind) => {
      const kindPath = resolveAiModulePath(moduleKind, allKinds)
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

  // ── 函数详细指南 ──────────────────────────────────────────

  /**
   * 查询单个函数的完整指南（schema、用法规则、失败模式等）。
   * 失败时返回 AiModuleResult.failCode 带机器可读错误码。
   */
  public guideFunction(
    input: AiModuleKnowledgeFunctionGuideInput,
  ): AiModuleResult<AiModuleKnowledgeFunctionGuide> {
    const parsed = parseGuideInput(input)
    if (parsed === null) {
      return AiModuleResult.failCode(
        'INVALID_GUIDE_REQUEST',
        'module_function_guide requires kind and functionName for function guidance.',
        'Call module_function_guide({ kind, functionName }) after module_query({ includeFunctions: true }).',
      )
    }

    const moduleKind = this.kinds.get(parsed.kind)
    if (moduleKind === undefined) {
      return AiModuleResult.failCode(
        'KIND_NOT_REGISTERED',
        `kind "${parsed.kind}" is not registered.`,
        'Call queryModules() or listChildren("/") to inspect available kinds.',
      )
    }
    const allKinds = this.kinds.list()
    const actualKindPath = resolveAiModulePath(moduleKind, allKinds)
    const fn = moduleKind.findFunction(parsed.functionName)
    if (fn === undefined) {
      return AiModuleResult.failCode(
        'FUNCTION_NOT_FOUND',
        `function "${parsed.functionName}" is not declared on kind "${parsed.kind}".`,
        'Call module_query({ kind, includeFunctions: true }) to inspect real function names, or module_guide({ kind }) for kind metadata before retrying.',
      )
    }
    return AiModuleResult.ok(createGuide({
      kind: parsed.kind,
      kindPath: actualKindPath,
      fn,
      payloads: moduleKind.payloads,
      payloadCatalogs: discoverPayloadCatalogs(allKinds),
    }))
  }

  // ── 人工提问指南 ──────────────────────────────────────────

  /**
   * 生成人工提问指南。
   *
   * 当 LLM 遇到不确定信息（缺失用户事实、需要确认等）时，
   * 通过 human_question 工具触点本方法，获得结构化的提问指引。
   * 返回的 usageRules 和 resumeFlow 指导 LLM 暂停工具调用并向用户发问。
   */
  public guideHumanQuestion(
    input: AiModuleHumanQuestionGuideInput,
  ): AiModuleResult<AiModuleHumanQuestionGuide> {
    const context = input.context.trim()
    const reason = input.reason.trim()
    if (context.length === 0 || reason.length === 0) {
      return AiModuleResult.failCode(
        'INVALID_HUMAN_QUESTION_REQUEST',
        'guideHumanQuestion requires non-empty context and reason.',
        'Pass context describing the current task and reason explaining why guessing is unsafe.',
      )
    }

    const missingFacts = normalizeTextList(input.missingFacts)
    const candidateOptions = normalizeTextList(input.candidateOptions)
    const facts = missingFacts.length === 0 ? ['完成下一步所必需的用户事实'] : missingFacts
    return AiModuleResult.ok({
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
        '如仍不确定模块或函数，先 module_query 查询目录。',
        '执行前用 module_query/module_function_guide 确认 functionName 和 schema。',
        '具备足够事实后再调用对应 OpenAI function tool。',
      ],
    })
  }

  // ═══════════════════════════════════════════════════════════
  // 第 2 节 · Prompt 快照构造（内部）
  // ═══════════════════════════════════════════════════════════

  /**
   * 构建 LLM 系统提示词中的知识快照文本。
   *
   * 只包含根模块（parentKind === undefined），截断到 PROMPT_KIND_INDEX_LIMIT。
   * 超出部分提示用 queryModules({ keyword }) 补充查询。
   */
  private buildPromptSnapshot(
    kindLayers: readonly AiModuleKnowledgeKindLayer[],
  ): string {
    if (kindLayers.length === 0) {
      return [
        ...FIXED_PROTOCOL_TOOL_ROUTING_LINES,
        '当前没有注册 AiModule。业务方需要先注册能力模块。',
      ].join('\n')
    }

    const roots = kindLayers.filter((layer) => layer.parentKind === undefined)
    const promptKinds = (roots.length === 0 ? kindLayers : roots).slice(0, PROMPT_KIND_INDEX_LIMIT)
    const hiddenKindCount = (roots.length === 0 ? kindLayers : roots).length - promptKinds.length
    const lines = [
      ...FIXED_PROTOCOL_TOOL_ROUTING_LINES,
      ...promptKinds.map(formatPromptKindIndexLine),
      ...(hiddenKindCount > 0 ? [`...还有 ${String(hiddenKindCount)} 个 kind，使用 queryModules({ keyword }) 查询。`] : []),
      '消费顺序：module_find 定位实例 -> module_query 选真实函数 -> module_function_guide 消费函数契约 -> module_call 执行；payload 也必须 queryPayloads 选 key -> guidePayload 取详情。',
    ]
    return lines.join('\n')
  }
}
