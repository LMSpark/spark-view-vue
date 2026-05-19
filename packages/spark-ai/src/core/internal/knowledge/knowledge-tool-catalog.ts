import type { FunctionFailureMode } from '../../protocol/runtime-contracts'
import type { LlmJsonObject, LlmJsonSchemaObject, LlmParameterSchemaRoot } from '../../protocol/parameter-schema'
import { LlmParamsValidator } from '../llm-params-validator'

export type AiKnowledgeFunctionFailureMode = FunctionFailureMode
export type AiKnowledgeFunctionTarget = 'knowledge'
export type AiKnowledgeFunctionId =
  | 'queryFunctions'
  | 'queryModules'
  | 'guideFunction'

type AiKnowledgeFunctionBaseFields = {
  functionId: AiKnowledgeFunctionId
  type: 'describe'
  description: string
  paramsSchema: LlmParameterSchemaRoot
  resultSchema: LlmJsonObject
  example: LlmJsonObject
  usageRules: readonly string[]
}

export type AiKnowledgeFunctionParameterRow = AiKnowledgeFunctionBaseFields & {
  failureModes: readonly AiKnowledgeFunctionFailureMode[]
  target: AiKnowledgeFunctionTarget
}

export type AiKnowledgeCatalogRowOptions = Omit<
  AiKnowledgeFunctionParameterRow,
  'functionId' | 'type' | 'target'
>

const KNOWLEDGE_TARGET: AiKnowledgeFunctionTarget = 'knowledge'
const NO_PARAMS: LlmParameterSchemaRoot = {
  type: 'object',
  properties: {},
  additionalProperties: false,
  description: 'queryModules 不接受参数，请传 {} 或留空。',
}
function stringParam(description: string, options: { minLength?: number } = {}): LlmJsonSchemaObject {
  return {
    type: 'string',
    description,
    ...(options.minLength !== undefined ? { minLength: options.minLength } : {}),
  }
}

export class AiKnowledgeCatalog {
  readonly parameterTable: readonly AiKnowledgeFunctionParameterRow[]

  private readonly parameterIndex: ReadonlyMap<string, AiKnowledgeFunctionParameterRow>

  constructor() {
    this.parameterTable = [
      {
        functionId: 'queryFunctions',
        type: 'describe',
        target: KNOWLEDGE_TARGET,
        description: '查询当前 AI 会话可调用的函数目录（按 modulePath/moduleId/keyword 过滤）。',
        paramsSchema: {
          type: 'object',
          properties: {
            modulePath: stringParam('按模块路径过滤，例如 root/child。'),
            moduleId: stringParam('按模块 ID 精确过滤。'),
            keyword: stringParam('按 action/description/modulePath 模糊搜索。'),
          },
        },
        resultSchema: {
          items: 'AiKnowledgeFunctionSummary[] — 轻量函数目录（action、模块、描述、顶层参数名、失败码）；完整 paramsSchema/usageRules/failureModes 请用 guideFunction(action) 按需查询。',
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
        paramsSchema: NO_PARAMS,
        resultSchema: {
          items: 'AiKnowledgeModuleSummary[] — 轻量模块目录（moduleId/modulePath/name/description/functionCount/childModuleCount），不包含函数 schema。',
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
          type: 'object',
          required: ['action'],
          properties: {
            action: stringParam('函数 action，例如 root-1@module@actionName。', { minLength: 1 }),
          },
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
    ]
    this.parameterIndex = new Map(this.parameterTable.map((row) => [row.functionId, row]))
  }

  getParameterRow(functionId: string): AiKnowledgeFunctionParameterRow | undefined {
    return this.parameterIndex.get(functionId)
  }

  validateParams(functionId: string, params: unknown): string | null {
    const row = this.getParameterRow(functionId)
    if (row === undefined) {
      return `未知 knowledge 函数: ${functionId}`
    }

    const result = LlmParamsValidator.validateLlmDeserializedParams(params ?? {}, row.paramsSchema)
    return result.ok ? null : LlmParamsValidator.formatLlmParamValidationIssues(result.issues)
  }
}
