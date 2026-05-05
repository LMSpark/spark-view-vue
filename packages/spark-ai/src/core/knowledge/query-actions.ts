import type {
  FunctionFailureMode,
  FunctionResult,
  RegisteredFunctionDefinition,
} from '../protocol/function-contracts'
import { noGuard } from '../protocol/function-contracts'
import { getAllFunctionDefinitions, getFunctionDefinition } from '../registry/function-registry'
import { actionToFunctionName, functionNameToAction } from '../protocol/fc-schema'
import { isNonEmptyString, missingParam } from '../protocol/function-utils'
import {
  getKnowledgePayloadProvider,
  getKnowledgePayloadProviders,
} from './registry'
import type {
  KnowledgeModuleSummary,
  KnowledgePayloadGuide,
  KnowledgePayloadSummary,
  KnowledgeToolGuide,
  KnowledgeToolSummary,
} from './types'

// 核心知识模块提示词
const CORE_KNOWLEDGE_MODULE_PROMPT = 'core@knowledge 只负责查询已注册函数事实和参数荷载规格；写动作参数不确定时先 guideTool，嵌套对象参数必须通过 queryPayloads/guidePayload 查询后再构造。'

// ─────────────────────────────────────────────────────────────────────────────
// 【功能分区1】接口定义 - 各种查询参数和返回值类型
// ─────────────────────────────────────────────────────────────────────────────

interface QueryToolsParams {
  business?: unknown
  module?: unknown
}

interface GuideToolParams {
  action?: unknown
}

interface QueryPayloadsParams {
  payloadRef?: unknown
  filter?: unknown
}

interface GuidePayloadParams {
  payloadRef?: unknown
  key?: unknown
}

interface AskOption {
  id: string
  label: string
  value?: unknown
  description?: string
}

interface AskQuestion {
  id: string
  prompt: string
  type: 'single' | 'multi'
  options: AskOption[]
  recommendedOptionIds: string[]
}

interface AskParams {
  title: string
  reason?: string
  questions: AskQuestion[]
}

// ─────────────────────────────────────────────────────────────────────────────
// 【功能分区2】工具函数 - 数据处理和验证辅助函数
// ─────────────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readOptionalString(params: Record<string, unknown>, key: string): string | null {
  const value = params[key]
  if (value === undefined) return ''
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function readRequiredString(params: Record<string, unknown>, key: string): string | null {
  const value = params[key]
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

interface ActionAddressParts {
  business: string
  module: string
  function: string
}

function parseActionAddress(action: string): ActionAddressParts {
  const parts = action.split('@')
  if (parts.length !== 3 || parts.some(part => part.trim().length === 0)) {
    throw new Error(`非法 action 地址: ${action}，必须使用 业务@模块@函数`)
  }
  const business = parts[0] ?? ''
  const moduleName = parts[1] ?? ''
  const functionName = parts[2] ?? ''
  return { business, module: moduleName, function: functionName }
}

function failureCodes(failureModes: readonly FunctionFailureMode[] | undefined): string[] | undefined {
  if (failureModes === undefined || failureModes.length === 0) return undefined
  return failureModes.map(failureMode => failureMode.code)
}

// ─────────────────────────────────────────────────────────────────────────────
// 【功能分区3】数据投影 - 将函数定义转换为查询结果
// ─────────────────────────────────────────────────────────────────────────────

function projectToolSummary(definition: RegisteredFunctionDefinition<never, unknown>): KnowledgeToolSummary {
  const address = parseActionAddress(definition.action)
  const knownFailureCodes = failureCodes(definition.failureModes)
  return {
    action: definition.action,
    business: address.business,
    module: address.module,
    function: address.function,
    functionName: actionToFunctionName(definition.action),
    type: definition.type,
    description: definition.description,
    ...(definition.modulePrompt ? { modulePrompt: definition.modulePrompt } : {}),
    ...(definition.guardDescription ? { guard: definition.guardDescription } : {}),
    ...(definition.usageRules && definition.usageRules.length > 0 ? { rules: definition.usageRules } : {}),
    ...(knownFailureCodes !== undefined ? { failureCodes: knownFailureCodes } : {}),
    ...(definition.paramsSchema && Object.keys(definition.paramsSchema).length > 0 ? { params: definition.paramsSchema } : {}),
    ...(definition.example && Object.keys(definition.example).length > 0 ? { example: definition.example } : {}),
  }
}

function projectToolGuide(definition: RegisteredFunctionDefinition<never, unknown>): KnowledgeToolGuide {
  return {
    ...projectToolSummary(definition),
    paramsSchema: definition.paramsSchema ?? null,
    resultSchema: definition.resultSchema ?? null,
    usageRules: definition.usageRules ?? [],
    failureModes: definition.failureModes ?? [],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 【功能分区4】参数验证 - 各种查询函数的参数验证逻辑
// ─────────────────────────────────────────────────────────────────────────────

function validateQueryToolsParams(params: unknown): string | null {
  if (params === undefined || params === null) return null
  if (!isRecord(params)) return 'core@knowledge@queryTools 参数必须是对象或空值'
  const unexpectedKeys = Object.keys(params).filter(key => key !== 'business' && key !== 'module')
  if (unexpectedKeys.length > 0) return `core@knowledge@queryTools 不支持参数: ${unexpectedKeys.join(', ')}`
  const business = readOptionalString(params, 'business')
  if (business === null) return 'business 必须是非空字符串'
  const moduleName = readOptionalString(params, 'module')
  if (moduleName === null) return 'module 忄须是非空字符串'
  return null
}

function validateGuideToolParams(params: unknown): string | null {
  if (!isRecord(params)) return missingParam('action')
  const unexpectedKeys = Object.keys(params).filter(key => key !== 'action')
  if (unexpectedKeys.length > 0) return `core@knowledge@guideTool 不支持参数: ${unexpectedKeys.join(', ')}`
  if (!isNonEmptyString(params['action'])) return missingParam('action')
  return null
}

function validateQueryPayloadsParams(params: unknown): string | null {
  if (params === undefined || params === null) return null
  if (!isRecord(params)) return 'core@knowledge@queryPayloads 参数必须是对象或空值'
  const unexpectedKeys = Object.keys(params).filter(key => key !== 'payloadRef' && key !== 'filter')
  if (unexpectedKeys.length > 0) return `core@knowledge@queryPayloads 不支持参数: ${unexpectedKeys.join(', ')}`
  if (params['payloadRef'] !== undefined && !isNonEmptyString(params['payloadRef'])) return 'payloadRef 必须是非空字符串'
  if (params['filter'] !== undefined && !isRecord(params['filter'])) return 'filter 必须是对象'
  return null
}

function validateGuidePayloadParams(params: unknown): string | null {
  if (!isRecord(params)) return missingParam('payloadRef')
  const unexpectedKeys = Object.keys(params).filter(key => key !== 'payloadRef' && key !== 'key')
  if (unexpectedKeys.length > 0) return `core@knowledge@guidePayload 不支持参数: ${unexpectedKeys.join(', ')}`
  if (!isNonEmptyString(params['payloadRef'])) return missingParam('payloadRef')
  if (!isNonEmptyString(params['key'])) return missingParam('key')
  return null
}

function validateAskParams(params: unknown): string | null {
  if (!isRecord(params)) return 'core@knowledge@ask 参数必须是对象'
  if (!isNonEmptyString(params['title'])) return missingParam('title')
  const rawQuestions = params['questions']
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) return 'questions 必须是非空数组'

  for (const [questionIndex, question] of rawQuestions.entries()) {
    const prefix = `questions[${questionIndex}]`
    if (!isRecord(question)) return `${prefix} 必须是对象`
    const questionType = question['type']
    const rawOptions = question['options']
    const rawRecommendedOptionIds = question['recommendedOptionIds']
    if (!isNonEmptyString(question['id'])) return `${prefix}.id 必须是非空字符串`
    if (!isNonEmptyString(question['prompt'])) return `${prefix}.prompt 必须是非空字符串`
    if (questionType !== 'single' && questionType !== 'multi') return `${prefix}.type 必须是 single 或 multi`
    if (!Array.isArray(rawOptions) || rawOptions.length < 2) return `${prefix}.options 至少提供 2 个备选项`
    if (!Array.isArray(rawRecommendedOptionIds) || rawRecommendedOptionIds.length === 0) return `${prefix}.recommendedOptionIds 必须提供推荐选项`
    if (questionType === 'single' && rawRecommendedOptionIds.length !== 1) return `${prefix}.recommendedOptionIds 单选题必须且只能推荐 1 个选项`

    const optionIds = new Set<string>()
    for (const [optionIndex, option] of rawOptions.entries()) {
      const optionPrefix = `${prefix}.options[${optionIndex}]`
      if (!isRecord(option)) return `${optionPrefix} 必须是对象`
      const optionId = option['id']
      if (!isNonEmptyString(optionId)) return `${optionPrefix}.id 必须是非空字符串`
      if (!isNonEmptyString(option['label'])) return `${optionPrefix}.label 必须是非空字符串`
      if (optionIds.has(optionId)) return `${prefix}.options 存在重复 id: ${optionId}`
      optionIds.add(optionId)
    }

    for (const recommendedId of rawRecommendedOptionIds) {
      if (!isNonEmptyString(recommendedId)) return `${prefix}.recommendedOptionIds 只能包含非空字符串`
      if (!optionIds.has(recommendedId)) return `${prefix}.recommendedOptionIds 包含不存在的选项: ${recommendedId}`
    }
  }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// 【功能分区5】数据收集 - 收集工具和模块信息
// ─────────────────────────────────────────────────────────────────────────────

function collectToolSummaries(): KnowledgeToolSummary[] {
  return Array.from(getAllFunctionDefinitions().values()).map(projectToolSummary)
}

function collectModuleSummaries(tools: readonly KnowledgeToolSummary[]): KnowledgeModuleSummary[] {
  const moduleMap = new Map<string, KnowledgeModuleSummary>()

  for (const tool of tools) {
    const key = `${tool.business}@${tool.module}`
    const existing = moduleMap.get(key)
    if (existing === undefined) {
      moduleMap.set(key, {
        business: tool.business,
        module: tool.module,
        prompt: tool.modulePrompt ?? '',
        toolCount: 1,
        actions: [tool.action],
      })
      continue
    }

    existing.toolCount += 1
    existing.actions.push(tool.action)
    if (existing.prompt.length === 0 && tool.modulePrompt !== undefined) {
      existing.prompt = tool.modulePrompt
    }
  }

  return Array.from(moduleMap.values())
}

function findToolGuide(action: string): KnowledgeToolGuide | null {
  const canonicalAction = functionNameToAction(action)
  const definition = getFunctionDefinition(action) ?? getFunctionDefinition(canonicalAction)
  if (definition !== undefined) return projectToolGuide(definition)
  return null
}

function findPayloadRefByKey(key: string): string | null {
  for (const provider of getKnowledgePayloadProviders()) {
    try {
      if (provider.guidePayload(key) !== null) return provider.payloadRef
    } catch {
      continue
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// 【功能分区6】知识查询函数实现 - 实现具体的查询功能
// ─────────────────────────────────────────────────────────────────────────────

export const knowledgeQueryTools: RegisteredFunctionDefinition<QueryToolsParams, unknown> = {
  action: 'core@knowledge@queryTools',
  type: 'describe',
  description: '查询当前会话可用 Agent tool/function 目录，可按 business/module 过滤。',
  modulePrompt: CORE_KNOWLEDGE_MODULE_PROMPT,
  guard: noGuard,
  usageRules: [
    '首次执行写动作前先调用本动作了解可用函数。',
    '返回的是目录摘要；需要完整参数结构时继续调用 core@knowledge@guideTool。',
    'action 地址统一为 业务@模块@函数；这里的 Agent tool 对应第三段函数。',
  ],
  paramsSchema: {
    kind: 'object',
    optional: {
      business: 'string? — 可选业务名；必须来自已注册 action 的第一段',
      module: 'string? — 可选模块名；必须来自已注册 action 的第二段',
    },
  },
  resultSchema: {
    modules: 'KnowledgeModuleSummary[] — 按 business@module 聚合的模块提示词、函数数和 action 列表',
    tools: 'KnowledgeToolSummary[]',
    total: 'number',
    hint: 'string',
  },
  example: {},
  validate: validateQueryToolsParams,
  execute: (_context, params): FunctionResult => {
    const business = isRecord(params) ? readOptionalString(params, 'business') : ''
    const moduleName = isRecord(params) ? readOptionalString(params, 'module') : ''
    const tools = collectToolSummaries()
      .filter(tool => business === '' || tool.business === business)
      .filter(tool => moduleName === '' || tool.module === moduleName)
    const modules = collectModuleSummaries(tools)

    return {
      ok: true,
      data: {
        modules,
        tools,
        total: tools.length,
        hint: '先阅读 modules[].prompt；用 core@knowledge@guideTool({ action }) 查询单个函数的 paramsSchema / usageRules / failureModes。',
      },
      summary: `返回 ${tools.length} 个可用函数`,
    }
  },
}

export const knowledgeGuideTool: RegisteredFunctionDefinition<GuideToolParams, unknown> = {
  action: 'core@knowledge@guideTool',
  type: 'describe',
  description: '查询单个函数/Agent tool 的完整参数指南，action 可传 业务@模块@函数 或 FC 下划线函数名。',
  modulePrompt: CORE_KNOWLEDGE_MODULE_PROMPT,
  guard: noGuard,
  usageRules: [
    '任何写动作参数不确定时，先调用本动作。',
    '本动作只查询函数；嵌套参数荷载请调用 core@knowledge@guidePayload。',
  ],
  paramsSchema: {
    kind: 'object',
    properties: {
      action: 'string — 函数地址，如 core@knowledge@queryTools；也可传 FC 函数名 core_knowledge_queryTools',
    },
  },
  resultSchema: {
    action: 'string',
    modulePrompt: 'string? — 目标函数所属模块的提示词',
    paramsSchema: 'Record<string, unknown> | null',
    usageRules: 'string[]',
    failureModes: 'FunctionFailureMode[]',
  },
  example: { action: 'core@knowledge@queryTools' },
  validate: validateGuideToolParams,
  execute: (_context, params): FunctionResult => {
    if (!isRecord(params)) {
      return { ok: false, code: 'INVALID_PARAMS', msg: missingParam('action'), fix: '请传 { action:"core@knowledge@queryTools" }' }
    }
    const action = readRequiredString(params, 'action')
    if (action === null) {
      return { ok: false, code: 'INVALID_PARAMS', msg: missingParam('action'), fix: '请传 { action:"core@knowledge@queryTools" }' }
    }

    const guide = findToolGuide(action)
    if (guide === null) {
      const payloadRef = findPayloadRefByKey(action)
      if (payloadRef !== null) {
        return {
          ok: false,
          code: 'PAYLOAD_QUERY_REQUIRED',
          msg: `${action} 是参数荷载 key，不是函数地址`,
          fix: `请改用 core@knowledge@guidePayload({ payloadRef:"${payloadRef}", key:"${action}" }) 查询参数荷载 JSON Schema。`,
        }
      }
      return {
        ok: false,
        code: 'UNKNOWN_TOOL',
        msg: `未知函数: ${action}`,
        fix: '请先调用 core@knowledge@queryTools 获取当前可用函数目录；若这是参数荷载 key，请改用 core@knowledge@guidePayload({ payloadRef, key })。',
      }
    }

    return {
      ok: true,
      data: guide,
      summary: `返回函数 ${guide.action} 的参数指南`,
    }
  },
}

export const knowledgeQueryPayloads: RegisteredFunctionDefinition<QueryPayloadsParams, unknown> = {
  action: 'core@knowledge@queryPayloads',
  type: 'describe',
  description: '查询可用参数荷载目录；无 payloadRef 时返回已注册荷载源列表。',
  modulePrompt: CORE_KNOWLEDGE_MODULE_PROMPT,
  guard: noGuard,
  usageRules: [
    '用于发现函数参数中的嵌套 JSON 荷载类型。',
    '拿到 key 后继续调用 core@knowledge@guidePayload 获取 JSON Schema。',
  ],
  paramsSchema: {
    kind: 'object',
    optional: {
      payloadRef: 'string? — 参数荷载源 ID；省略时返回已注册参数荷载源列表',
      filter: 'object? — provider 自定义过滤条件，由对应业务 payload provider 解释',
    },
  },
  resultSchema: {
    payloads: 'KnowledgePayloadSummary[]',
    total: 'number',
  },
  example: {},
  validate: validateQueryPayloadsParams,
  execute: (_context, params): FunctionResult => {
    const payloadRef = isRecord(params) && typeof params['payloadRef'] === 'string' ? params['payloadRef'].trim() : ''
    const filter = isRecord(params) && isRecord(params['filter']) ? params['filter'] : undefined

    if (payloadRef.length === 0) {
      const providers = getKnowledgePayloadProviders().map(provider => ({
        payloadRef: provider.payloadRef,
        description: provider.description,
      }))
      return {
        ok: true,
        data: { providers, total: providers.length },
        summary: `返回 ${providers.length} 个参数荷载源`,
      }
    }

    const provider = getKnowledgePayloadProvider(payloadRef)
    if (provider === undefined) {
      return {
        ok: false,
        code: 'UNKNOWN_PAYLOAD_REF',
        msg: `未知参数荷载源: ${payloadRef}`,
        fix: '请先调用 core@knowledge@queryPayloads({}) 获取已注册 payloadRef 列表。',
      }
    }

    let payloads: KnowledgePayloadSummary[]
    try {
      payloads = provider.queryPayloads(filter)
    } catch (error) {
      return {
        ok: false,
        code: 'PAYLOAD_PROVIDER_ERROR',
        msg: error instanceof Error ? error.message : '参数荷载源查询失败',
        fix: '请检查对应业务模块是否已完成参数荷载源初始化，再重新调用 core@knowledge@queryPayloads。',
      }
    }

    return {
      ok: true,
      data: { payloadRef, payloads, total: payloads.length },
      summary: `${payloadRef}: ${payloads.length} 个参数荷载`,
    }
  },
}

export const knowledgeGuidePayload: RegisteredFunctionDefinition<GuidePayloadParams, unknown> = {
  action: 'core@knowledge@guidePayload',
  type: 'describe',
  description: '查询单个参数荷载的 JSON Schema、最小示例与使用规则。',
  modulePrompt: CORE_KNOWLEDGE_MODULE_PROMPT,
  guard: noGuard,
  usageRules: [
    '用于构造函数参数中的嵌套对象。',
    '返回的 jsonSchema 是构造参数的事实源，禁止凭空补 props。',
  ],
  paramsSchema: {
    kind: 'object',
    properties: {
      payloadRef: 'string — 参数荷载源 ID；先由 core@knowledge@queryPayloads({}) 或业务文档确认',
      key: 'string — 荷载 key；必须来自对应 payloadRef 的参数荷载目录',
    },
  },
  resultSchema: {
    payloadRef: 'string',
    key: 'string',
    jsonSchema: 'Record<string, unknown>',
    minimalExample: 'Record<string, unknown>',
  },
  example: { payloadRef: '<registered-payload-ref>', key: '<payload-key>' },
  validate: validateGuidePayloadParams,
  execute: (_context, params): FunctionResult => {
    if (!isRecord(params)) {
      return { ok: false, code: 'INVALID_PARAMS', msg: missingParam('payloadRef'), fix: '请传 { payloadRef:"<已注册 payloadRef>", key:"<payload key>" }' }
    }
    const payloadRef = readRequiredString(params, 'payloadRef')
    const key = readRequiredString(params, 'key')
    if (payloadRef === null || key === null) {
      return { ok: false, code: 'INVALID_PARAMS', msg: 'payloadRef 和 key 必须是非空字符串', fix: '请传 { payloadRef:"<已注册 payloadRef>", key:"<payload key>" }' }
    }

    const provider = getKnowledgePayloadProvider(payloadRef)
    if (provider === undefined) {
      return {
        ok: false,
        code: 'UNKNOWN_PAYLOAD_REF',
        msg: `未知参数荷载源: ${payloadRef}`,
        fix: '请先调用 core@knowledge@queryPayloads({}) 获取已注册 payloadRef 列表。',
      }
    }

    let guide: KnowledgePayloadGuide | null
    try {
      guide = provider.guidePayload(key)
    } catch (error) {
      return {
        ok: false,
        code: 'PAYLOAD_PROVIDER_ERROR',
        msg: error instanceof Error ? error.message : '参数荷载指南查询失败',
        fix: '请检查对应业务模块是否已完成参数荷载源初始化，再重新调用 core@knowledge@guidePayload。',
      }
    }

    if (guide === null) {
      return {
        ok: false,
        code: 'PAYLOAD_NOT_FOUND',
        msg: `${payloadRef} 中不存在参数荷载: ${key}`,
        fix: `请先调用 core@knowledge@queryPayloads({ payloadRef:"${payloadRef}" }) 确认可用 key。`,
      }
    }

    return {
      ok: true,
      data: guide,
      summary: `返回参数荷载 ${payloadRef}/${key} 的 JSON Schema 指南`,
    }
  },
}

export const knowledgeAsk: RegisteredFunctionDefinition<AskParams, AskParams> = {
  action: 'core@knowledge@ask',
  type: 'describe',
  description: '向用户发起结构化反问；必须提供完整备选项与推荐选项。',
  modulePrompt: CORE_KNOWLEDGE_MODULE_PROMPT,
  guard: noGuard,
  usageRules: [
    '仅当关键事实无法从当前上下文或只读函数判定时调用。',
    '每个问题必须提供完整备选项；如存在开放场景，应提供"其他/自定义"选项。',
    '每个问题必须提供 recommendedOptionIds；推荐项只能来自 options[].id。',
    '调用后停止继续写入或尝试，等待用户点击选项回答。',
  ],
  paramsSchema: {
    kind: 'object',
    properties: {
      title: 'string — 反问主题，简短说明本次需要确认什么',
      questions: {
        kind: 'array',
        note: '问题列表；为保证点击即回答，优先一次只问 1 个关键问题',
        items: {
          kind: 'object',
          properties: {
            id: 'string — 问题稳定 id',
            prompt: 'string — 面向用户的问题文本',
            type: { kind: 'enum', enum: ['single', 'multi'], note: 'single=单选；multi=多选' },
            options: {
              kind: 'array',
              note: '完整备选项，至少 2 项；需要开放输入时提供 other/custom 选项',
              items: {
                kind: 'object',
                properties: {
                  id: 'string — 选项稳定 id',
                  label: 'string — 展示给用户的选项名称',
                },
                optional: {
                  value: 'string — 选项值；未提供时使用 id',
                  description: 'string? — 选项说明或适用场景',
                },
              },
            },
            recommendedOptionIds: {
              kind: 'array',
              note: '推荐选项 id；single 必须 1 个，multi 可多个',
              items: 'string — options[].id 中的值',
            },
          },
        },
      },
    },
    optional: {
      reason: 'string? — 为什么需要用户确认；写清缺失事实，不要泛泛描述',
    },
  },
  resultSchema: {
    title: 'string',
    reason: 'string?',
    questions: 'Array<{ id; prompt; type; options; recommendedOptionIds }>',
  },
  example: {
    title: '确认关键事实',
    reason: '当前请求缺少可由用户直接确认的关键事实。',
    questions: [
      {
        id: 'next-step',
        prompt: '请选择下一步处理方式。',
        type: 'single',
        options: [
          { id: 'inspect', label: '先查询当前状态' },
          { id: 'proceed', label: '按已确认事实继续执行' },
        ],
        recommendedOptionIds: ['inspect'],
      },
    ],
  },
  validate: validateAskParams,
  execute: (_context, params): FunctionResult<AskParams> => ({
    ok: true,
    data: params,
    summary: `等待用户回答反问：${params.title}（${params.questions.length} 题）`,
  }),
}

export const coreKnowledgeFunctions = [
  knowledgeQueryTools,
  knowledgeGuideTool,
  knowledgeQueryPayloads,
  knowledgeGuidePayload,
  knowledgeAsk,
] as const