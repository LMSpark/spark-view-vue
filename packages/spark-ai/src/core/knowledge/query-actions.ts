import type { IStillSession, StillDefinition, StillFailureMode } from '../stills/types'
import { noGuard } from '../stills/types'
import { getAllStills, getStill } from '../stills/dispatcher'
import { actionToFunctionName, functionNameToAction } from '../fc-schema'
import { isNonEmptyString, missingParam } from '../stills/meta-common-utils'
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

const CORE_KNOWLEDGE_MODULE_PROMPT = 'core@knowledge 只负责查询已注册函数事实和参数荷载规格；写动作参数不确定时先 guideTool，嵌套对象参数必须通过 queryPayloads/guidePayload 查询后再构造。'

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

function failureCodes(failureModes: readonly StillFailureMode[] | undefined): string[] | undefined {
  if (failureModes === undefined || failureModes.length === 0) return undefined
  return failureModes.map(failureMode => failureMode.code)
}

function projectToolSummary(still: StillDefinition<never, unknown>): KnowledgeToolSummary {
  const address = parseActionAddress(still.action)
  const knownFailureCodes = failureCodes(still.failureModes)
  return {
    action: still.action,
    business: address.business,
    module: address.module,
    function: address.function,
    functionName: actionToFunctionName(still.action),
    type: still.type,
    description: still.description,
    ...(still.modulePrompt ? { modulePrompt: still.modulePrompt } : {}),
    ...(still.guardDescription ? { guard: still.guardDescription } : {}),
    ...(still.usageRules && still.usageRules.length > 0 ? { rules: still.usageRules } : {}),
    ...(knownFailureCodes !== undefined ? { failureCodes: knownFailureCodes } : {}),
    ...(still.paramsSchema && Object.keys(still.paramsSchema).length > 0 ? { params: still.paramsSchema } : {}),
    ...(still.example && Object.keys(still.example).length > 0 ? { example: still.example } : {}),
  }
}

function projectToolGuide(still: StillDefinition<never, unknown>): KnowledgeToolGuide {
  return {
    ...projectToolSummary(still),
    paramsSchema: still.paramsSchema ?? null,
    resultSchema: still.resultSchema ?? null,
    usageRules: still.usageRules ?? [],
    failureModes: still.failureModes ?? [],
  }
}

function validateQueryToolsParams(params: unknown): string | null {
  if (params === undefined || params === null) return null
  if (!isRecord(params)) return 'core@knowledge@queryTools 参数必须是对象或空值'
  const unexpectedKeys = Object.keys(params).filter(key => key !== 'business' && key !== 'module')
  if (unexpectedKeys.length > 0) return `core@knowledge@queryTools 不支持参数: ${unexpectedKeys.join(', ')}`
  const business = readOptionalString(params, 'business')
  if (business === null) return 'business 必须是非空字符串'
  const moduleName = readOptionalString(params, 'module')
  if (moduleName === null) return 'module 必须是非空字符串'
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

function collectToolSummaries(): KnowledgeToolSummary[] {
  return Array.from(getAllStills().values()).map(projectToolSummary)
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
  const still = getStill(action) ?? getStill(canonicalAction)
  if (still !== undefined) return projectToolGuide(still)
  return null
}

function findPayloadRefByKey(session: IStillSession, key: string): string | null {
  for (const provider of getKnowledgePayloadProviders()) {
    try {
      if (provider.guidePayload(session, key) !== null) return provider.payloadRef
    } catch {
      continue
    }
  }
  return null
}

export const knowledgeQueryTools: StillDefinition<QueryToolsParams, unknown> = {
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
  execute: (session, params): ReturnType<StillDefinition<QueryToolsParams, unknown>['execute']> => {
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

export const knowledgeGuideTool: StillDefinition<GuideToolParams, unknown> = {
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
    failureModes: 'StillFailureMode[]',
  },
  example: { action: 'core@knowledge@queryTools' },
  validate: validateGuideToolParams,
  execute: (session, params): ReturnType<StillDefinition<GuideToolParams, unknown>['execute']> => {
    if (!isRecord(params)) {
      return { ok: false, code: 'INVALID_PARAMS', msg: missingParam('action'), fix: '请传 { action:"core@knowledge@queryTools" }' }
    }
    const action = readRequiredString(params, 'action')
    if (action === null) {
      return { ok: false, code: 'INVALID_PARAMS', msg: missingParam('action'), fix: '请传 { action:"core@knowledge@queryTools" }' }
    }

    const guide = findToolGuide(action)
    if (guide === null) {
      const payloadRef = findPayloadRefByKey(session, action)
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

export const knowledgeQueryPayloads: StillDefinition<QueryPayloadsParams, unknown> = {
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
  execute: (session, params): ReturnType<StillDefinition<QueryPayloadsParams, unknown>['execute']> => {
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
      payloads = provider.queryPayloads(session, filter)
    } catch (error) {
      return {
        ok: false,
        code: 'PAYLOAD_PROVIDER_ERROR',
        msg: error instanceof Error ? error.message : '参数荷载源查询失败',
        fix: '请检查当前会话是否已完成对应业务域初始化，再重新调用 core@knowledge@queryPayloads。',
      }
    }

    return {
      ok: true,
      data: { payloadRef, payloads, total: payloads.length },
      summary: `${payloadRef}: ${payloads.length} 个参数荷载`,
    }
  },
}

export const knowledgeGuidePayload: StillDefinition<GuidePayloadParams, unknown> = {
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
  execute: (session, params): ReturnType<StillDefinition<GuidePayloadParams, unknown>['execute']> => {
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
      guide = provider.guidePayload(session, key)
    } catch (error) {
      return {
        ok: false,
        code: 'PAYLOAD_PROVIDER_ERROR',
        msg: error instanceof Error ? error.message : '参数荷载指南查询失败',
        fix: '请检查当前会话是否已完成对应业务域初始化，再重新调用 core@knowledge@guidePayload。',
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

export const coreKnowledgeStills = [
  knowledgeQueryTools,
  knowledgeGuideTool,
  knowledgeQueryPayloads,
  knowledgeGuidePayload,
] as const
