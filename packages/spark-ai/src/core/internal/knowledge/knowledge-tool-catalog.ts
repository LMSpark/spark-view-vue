import type { FunctionFailureMode } from '../../protocol/runtime-contracts'

export type AiKnowledgeFunctionFailureMode = FunctionFailureMode
export type AiKnowledgeFunctionTarget = 'knowledge'
export type AiKnowledgeFunctionId =
  | 'queryFunctions'
  | 'queryModules'
  | 'guideFunction'
  | 'queryPayloads'
  | 'guidePayload'

type AiKnowledgeFunctionBaseFields = {
  functionId: AiKnowledgeFunctionId
  type: 'describe'
  description: string
  paramsSchema: Record<string, unknown>
  resultSchema: Record<string, unknown>
  example: Record<string, unknown>
  usageRules: readonly string[]
}

export type AiKnowledgeFunctionParameterRow = AiKnowledgeFunctionBaseFields & {
  failureModes: readonly AiKnowledgeFunctionFailureMode[]
  target: AiKnowledgeFunctionTarget
}

export type AiKnowledgeFunctionCapabilityRow = Pick<
  AiKnowledgeFunctionParameterRow,
  'functionId' | 'type' | 'target' | 'description'
> & {
  integrationStatus: 'runtime-wired'
  paramsRef: string
  rules?: readonly string[]
  failureCodes?: readonly string[]
  params?: Record<string, unknown>
  example?: Record<string, unknown>
}

export type AiKnowledgeCatalogRowOptions = Omit<
  AiKnowledgeFunctionParameterRow,
  'functionId' | 'type' | 'target'
>

export interface AiKnowledgeCatalogOptions {
  queryPayloads: AiKnowledgeCatalogRowOptions
  guidePayload: AiKnowledgeCatalogRowOptions
}

const KNOWLEDGE_TARGET: AiKnowledgeFunctionTarget = 'knowledge'

function createAiKnowledgeCapabilityRow(row: AiKnowledgeFunctionParameterRow): AiKnowledgeFunctionCapabilityRow {
  return {
    functionId: row.functionId,
    type: row.type,
    target: row.target,
    description: row.description,
    integrationStatus: 'runtime-wired',
    paramsRef: row.functionId,
    ...(row.usageRules.length > 0 ? { rules: row.usageRules } : {}),
    ...(row.failureModes.length > 0 ? { failureCodes: row.failureModes.map((item) => item.code) } : {}),
    ...(Object.keys(row.paramsSchema).length > 0 ? { params: row.paramsSchema } : {}),
    ...(Object.keys(row.example).length > 0 ? { example: row.example } : {}),
  }
}

function isPlainObject(params: unknown): params is Record<string, unknown> {
  return typeof params === 'object' && params !== null && !Array.isArray(params)
}

export class AiKnowledgeCatalog {
  readonly parameterTable: readonly AiKnowledgeFunctionParameterRow[]

  readonly capabilityTable: readonly AiKnowledgeFunctionCapabilityRow[]

  private readonly parameterIndex: ReadonlyMap<string, AiKnowledgeFunctionParameterRow>

  private readonly capabilityIndex: ReadonlyMap<string, AiKnowledgeFunctionCapabilityRow>

  constructor(options: AiKnowledgeCatalogOptions) {
    this.parameterTable = [
      {
        functionId: 'queryFunctions',
        type: 'describe',
        target: KNOWLEDGE_TARGET,
        description: '查询当前 AI 会话可调用的函数目录（按 modulePath/moduleId/keyword 过滤）。',
        paramsSchema: {
          modulePath: 'string? — 按模块路径过滤，例如 root/child。',
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
        failureModes: [],
      },
      {
        functionId: 'guideFunction',
        type: 'describe',
        target: KNOWLEDGE_TARGET,
        description: '查询单个函数指南（按 action 精确查询）。',
        paramsSchema: {
          required: ['action'],
          action: 'string — 函数 action，例如 root-1@module@actionName。',
        },
        resultSchema: {
          guide: 'AiRuntimeFunctionExposure — 函数完整指南（参数 schema、规则、失败模式）。',
        },
        example: {
          action: 'root-1@module@actionName',
        },
        usageRules: [
          '执行函数前先查 guideFunction，避免参数结构猜测。',
        ],
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
        ...options.queryPayloads,
      },
      {
        functionId: 'guidePayload',
        type: 'describe',
        target: KNOWLEDGE_TARGET,
        ...options.guidePayload,
      },
    ]
    this.capabilityTable = this.parameterTable.map(createAiKnowledgeCapabilityRow)
    this.parameterIndex = new Map(this.parameterTable.map((row) => [row.functionId, row]))
    this.capabilityIndex = new Map(this.capabilityTable.map((row) => [row.functionId, row]))
  }

  getParameterRow(functionId: string): AiKnowledgeFunctionParameterRow | undefined {
    return this.parameterIndex.get(functionId)
  }

  getCapabilityRow(functionId: string): AiKnowledgeFunctionCapabilityRow | undefined {
    return this.capabilityIndex.get(functionId)
  }

  validateParams(functionId: string, params: unknown): string | null {
    const row = this.getParameterRow(functionId)
    if (row === undefined) {
      return `未知 knowledge 函数: ${functionId}`
    }

    if (functionId === 'queryModules') {
      if (params === undefined || params === null) return null
      if (isPlainObject(params) && Object.keys(params).length === 0) return null
      return 'queryModules 不接受参数，请传 {} 或留空'
    }

    if (!isPlainObject(params)) {
      return `${functionId} 参数必须是对象`
    }

    if (functionId === 'guideFunction') {
      return typeof params['action'] === 'string' && params['action'].trim().length > 0
        ? null
        : 'guideFunction 缺少 action（非空字符串）'
    }

    if (functionId === 'guidePayload') {
      return typeof params['key'] === 'string' && params['key'].trim().length > 0
        ? null
        : 'guidePayload 缺少 key（非空字符串）'
    }

    const optionalKeys = functionId === 'queryFunctions'
      ? ['modulePath', 'moduleId', 'keyword']
      : ['category', 'keyword']

    for (const key of optionalKeys) {
      const value = params[key]
      if (value !== undefined && typeof value !== 'string') {
        return `${functionId}.${key} 必须是字符串`
      }
    }

    return null
  }
}
