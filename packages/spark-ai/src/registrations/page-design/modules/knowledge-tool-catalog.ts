import type { FunctionFailureMode, LlmJsonObject, LlmParameterSchemaRoot } from '../../../core'
import { SPARK_COMPONENT_PAYLOAD_REF } from '../payloads/component-payload-catalog'
import {
  createPageDesignCapabilityRow,
  type PageDesignFunctionRuntimeBinding,
  type PageDesignKnowledgeRuntimeBinding,
  PageDesignToolCatalog,
} from './tool-catalog'

export type PageDesignKnowledgeFunctionFailureMode = FunctionFailureMode
export type PageDesignKnowledgeFunctionTarget = 'knowledge'
export type PageDesignKnowledgeFunctionId =
  | 'queryFunctions'
  | 'queryModules'
  | 'guideFunction'
  | 'queryPayloads'
  | 'guidePayload'

type PageDesignKnowledgeFunctionBaseFields = {
  functionId: PageDesignKnowledgeFunctionId
  type: 'describe'
  description: string
  paramsSchema: LlmParameterSchemaRoot
  resultSchema: LlmJsonObject
  example: LlmJsonObject
  usageRules: readonly string[]
}

export type PageDesignKnowledgeFunctionParameterRow = PageDesignKnowledgeFunctionBaseFields & {
  failureModes: readonly PageDesignKnowledgeFunctionFailureMode[]
  target: PageDesignKnowledgeFunctionTarget
  runtimeBinding: PageDesignFunctionRuntimeBinding
  runtimeRegistration: 'registered'
}

export type PageDesignKnowledgeFunctionCapabilityRow = Pick<
  PageDesignKnowledgeFunctionParameterRow,
  'functionId' | 'type' | 'target' | 'description'
> & {
  integrationStatus: 'runtime-wired'
  paramsRef: string
  rules?: readonly string[]
  failureCodes?: readonly string[]
  params?: LlmParameterSchemaRoot
  example?: LlmJsonObject
}

const KNOWLEDGE_TARGET = 'knowledge'

function toCapabilityRow(row: PageDesignKnowledgeFunctionParameterRow): PageDesignKnowledgeFunctionCapabilityRow {
  return createPageDesignCapabilityRow(row, 'runtime-wired')
}

function isPlainObject(params: unknown): params is Record<string, unknown> {
  return typeof params === 'object' && params !== null && !Array.isArray(params)
}

type PageDesignKnowledgeParamsValidator = (functionId: string, params: unknown) => string | null

function validateNoParams(functionId: string, params: unknown): string | null {
  if (params === undefined || params === null) return null
  if (isPlainObject(params) && Object.keys(params).length === 0) return null
  return `${functionId} 不接受参数，请传 {} 或留空`
}

function validateRequiredStringParam(functionId: string, params: unknown, key: string): string | null {
  if (!isPlainObject(params)) return `${functionId} 参数必须是对象`
  return typeof params[key] === 'string' && params[key].trim().length > 0
    ? null
    : `${functionId} 缺少 ${key}（非空字符串）`
}

function validateOptionalStringParams(functionId: string, params: unknown, optionalKeys: readonly string[]): string | null {
  if (!isPlainObject(params)) return `${functionId} 参数必须是对象`
  for (const key of optionalKeys) {
    const value = params[key]
    if (value !== undefined && typeof value !== 'string') {
      return `${functionId}.${key} 必须是字符串`
    }
  }
  return null
}

const PAGE_DESIGN_KNOWLEDGE_PARAM_VALIDATORS: Record<PageDesignKnowledgeRuntimeBinding['method'], PageDesignKnowledgeParamsValidator> = {
  queryFunctions: (functionId, params) => validateOptionalStringParams(functionId, params, ['modulePath', 'moduleId', 'keyword']),
  queryModules: validateNoParams,
  guideFunction: (functionId, params) => validateRequiredStringParam(functionId, params, 'action'),
  queryPayloads: (functionId, params) => validateOptionalStringParams(functionId, params, ['category', 'keyword']),
  guidePayload: (functionId, params) => validateRequiredStringParam(functionId, params, 'key'),
}

const PAGE_DESIGN_KNOWLEDGE_FUNCTION_PARAMETER_TABLE = [
  {
    functionId: 'queryFunctions',
    type: 'describe',
    target: KNOWLEDGE_TARGET,
    description: '查询当前 AI 会话可调用的函数目录（按 modulePath/moduleId/keyword 过滤）。',
    paramsSchema: {
      modulePath: 'string? — 按模块路径过滤，例如 knowledge、nodeTree、dataset。',
      moduleId: 'string? — 按模块 ID 精确过滤。',
      keyword: 'string? — 按 action/description/modulePath 模糊搜索。',
    },
    resultSchema: {
      items: 'AiRuntimeFunctionExposure[] — 函数目录（action、参数 schema、规则、失败模式）。',
    },
    example: {},
    usageRules: [
      '需要确认某个能力是否可调用，先查函数目录。',
      '再用 guideFunction(action) 查看单函数完整指南。',
    ],
    runtimeBinding: {
      kind: 'page-design-knowledge',
      method: 'queryFunctions',
    },
    runtimeRegistration: 'registered',
    failureModes: [],
  },
  {
    functionId: 'queryModules',
    type: 'describe',
    target: KNOWLEDGE_TARGET,
    description: '查询当前 AI 会话的模块目录（含根模块与子模块）。',
    paramsSchema: {},
    resultSchema: {
      items: 'AiRuntimeModuleExposure[] — 模块目录（moduleId/modulePath/name/description）。',
    },
    example: {},
    usageRules: [
      '用于确认模块边界与模块路径。',
    ],
    runtimeBinding: {
      kind: 'page-design-knowledge',
      method: 'queryModules',
    },
    runtimeRegistration: 'registered',
    failureModes: [],
  },
  {
    functionId: 'guideFunction',
    type: 'describe',
    target: KNOWLEDGE_TARGET,
    description: '查询单个函数指南（按 action 精确查询）。',
    paramsSchema: {
      required: ['action'],
      action: 'string — 函数 action，例如 page-1@nodeTree@addNode。',
    },
    resultSchema: {
      guide: 'AiRuntimeFunctionExposure — 函数完整指南（参数 schema、规则、失败模式）。',
    },
    example: {
      action: 'page-1@nodeTree@addNode',
    },
    usageRules: [
      '执行函数前先查 guideFunction，避免参数结构猜测。',
    ],
    runtimeBinding: {
      kind: 'page-design-knowledge',
      method: 'guideFunction',
    },
    runtimeRegistration: 'registered',
    failureModes: [
      {
        code: 'FUNCTION_NOT_FOUND',
        when: 'action 不在当前会话函数目录中。',
        fix: '先调用 queryFunctions 确认 action，再重试。',
      },
    ],
  },
  {
    functionId: 'queryPayloads',
    type: 'describe',
    target: KNOWLEDGE_TARGET,
    description: '查询 page-design 组件参数荷载目录，返回可用于 SparkNode node 参数的组件 type 摘要。',
    paramsSchema: {
      category: 'string? — 组件分类过滤，例如 container / field / group / meta。',
      keyword: 'string? — 按组件 type、描述或标签模糊搜索。',
    },
    resultSchema: {
      payloadRef: `string — 固定为 ${SPARK_COMPONENT_PAYLOAD_REF}`,
      items: 'ParameterPayloadSummary[] — 组件参数荷载摘要列表。',
    },
    example: {
      category: 'container',
    },
    usageRules: [
      '新增或替换组件前，若不确定 type，先查询目录。',
      `无需传 payloadRef；本模块固定查询 ${SPARK_COMPONENT_PAYLOAD_REF}。`,
    ],
    runtimeBinding: {
      kind: 'page-design-knowledge',
      method: 'queryPayloads',
    },
    runtimeRegistration: 'registered',
    failureModes: [],
  },
  {
    functionId: 'guidePayload',
    type: 'describe',
    target: KNOWLEDGE_TARGET,
    description: '读取指定组件 type 的 SparkNode 参数荷载指南，返回 paramsSchema、最小参数示例和使用规则。',
    paramsSchema: {
      required: ['key'],
      key: 'string — 组件 type，例如 r-table、r-form、el-button。',
    },
    resultSchema: {
      guide: 'ParameterPayloadGuide — 组件 SparkNode 参数荷载指南（paramsSchema 与函数参数协议同源）。',
    },
    example: {
      key: 'r-table',
    },
    usageRules: [
      '构造 nodeTree.addNode / replaceNode / addNodes / replaceNodes 的 node 参数前，必须先读取目标 type 的指南。',
      '返回 PAYLOAD_NOT_FOUND 时改用 queryPayloads 重新选择可用组件，不要反复用同一个缺失 key 重试。',
    ],
    runtimeBinding: {
      kind: 'page-design-knowledge',
      method: 'guidePayload',
    },
    runtimeRegistration: 'registered',
    failureModes: [
      {
        code: 'PAYLOAD_NOT_FOUND',
        when: `key 不存在于 ${SPARK_COMPONENT_PAYLOAD_REF} 参数荷载目录。`,
        fix: '先调用 queryPayloads 选择可用组件 type。',
      },
    ],
  },
] as const satisfies readonly PageDesignKnowledgeFunctionParameterRow[]

const PAGE_DESIGN_KNOWLEDGE_FUNCTION_CAPABILITY_TABLE = PAGE_DESIGN_KNOWLEDGE_FUNCTION_PARAMETER_TABLE.map(toCapabilityRow)

export class PageDesignKnowledgeCatalog extends PageDesignToolCatalog<
  PageDesignKnowledgeFunctionParameterRow,
  PageDesignKnowledgeFunctionCapabilityRow
> {
  constructor() {
    super(PAGE_DESIGN_KNOWLEDGE_FUNCTION_PARAMETER_TABLE, PAGE_DESIGN_KNOWLEDGE_FUNCTION_CAPABILITY_TABLE)
  }

  validateParams(functionId: string, params: unknown): string | null {
    const row = this.getParameterRow(functionId)
    if (row === undefined) {
      return `未知 knowledge 函数: ${functionId}`
    }

    if (row.runtimeBinding.kind !== 'page-design-knowledge') {
      return `${functionId} 缺少 knowledge runtime binding`
    }

    return PAGE_DESIGN_KNOWLEDGE_PARAM_VALIDATORS[row.runtimeBinding.method](functionId, params)
  }
}
