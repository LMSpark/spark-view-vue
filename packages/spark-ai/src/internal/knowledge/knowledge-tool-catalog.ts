/**
 * 知识投射工具目录。
 *
 * 定义知识投影内置函数的注册表（queryFunctions / queryModules / guideFunction），
 * 供 LLM 在运行时通过 knowledge 模块探索可用能力。
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │                 AiKnowledgeCatalog                        │
 * │                                                           │
 * │  内置函数（3 个）：                                       │
 * │    queryFunctions  → 按 modulePath/moduleId/keyword 过滤   │
 * │    queryModules    → 列出模块目录（无参数）                │
 * │    guideFunction   → 按 action 查询完整函数指南            │
 * │                                                           │
 * │  工作流程：                                                │
 * │    构造函数 → 注册 3 个内置函数到 parameterTable           │
 * │               → 建立 parameterIndex 索引                  │
 * │    getParameterRow() → 按 functionId 查找                 │
 * │    validateParams()  → 用 LlmParamsValidator 校验参数      │
 * └──────────────────────────────────────────────────────────┘
 */

import type { FunctionFailureMode } from '../../protocol/runtime-contracts'
import type { LlmJsonObject, LlmJsonSchemaObject, LlmParameterSchemaRoot } from '../../protocol/parameter-schema'
import { LlmParamsValidator } from '../llm-params-validator'

// ═══════════════════════════════════════════════════════
// 1. 函数 ID / 类型
// ═══════════════════════════════════════════════════════

export interface AiKnowledgeFunctionFailureMode extends FunctionFailureMode {}
export type AiKnowledgeFunctionTarget = 'knowledge'
export type AiKnowledgeFunctionId =
  | 'queryFunctions'
  | 'queryModules'
  | 'guideFunction'

interface AiKnowledgeFunctionBaseFields {
  functionId: AiKnowledgeFunctionId
  type: 'describe'
  description: string
  paramsSchema: LlmParameterSchemaRoot
  resultSchema: LlmJsonObject
  example: LlmJsonObject
  usageRules: readonly string[]
}

export interface AiKnowledgeFunctionParameterRow extends AiKnowledgeFunctionBaseFields {
  failureModes: readonly AiKnowledgeFunctionFailureMode[]
    target: AiKnowledgeFunctionTarget
}

export interface AiKnowledgeCatalogRowOptions extends Omit<
  AiKnowledgeFunctionParameterRow,
  'functionId' | 'type' | 'target'
> {}

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

// ═══════════════════════════════════════════════════════
// 2. 目录实现
// ═══════════════════════════════════════════════════════

export class AiKnowledgeCatalog {
  readonly parameterTable: readonly AiKnowledgeFunctionParameterRow[]

  /** functionId → 参数行索引，用于 O(1) 查找 */
  private readonly parameterIndex: ReadonlyMap<string, AiKnowledgeFunctionParameterRow>

  /** 构造函数：注册 3 个内置 knowledge 函数并建立索引 */
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

  /** 按 functionId 查找参数行 */
  getParameterRow(functionId: string): AiKnowledgeFunctionParameterRow | undefined {
    return this.parameterIndex.get(functionId)
  }

  /** 校验指定 knowledge 函数的参数，返回 null 表示通过 */
  validateParams(functionId: string, params: unknown): string | null {
    const row = this.getParameterRow(functionId)
    if (row === undefined) {
      return `未知 knowledge 函数: ${functionId}`
    }

    const result = LlmParamsValidator.validateLlmDeserializedParams(params ?? {}, row.paramsSchema)
    return result.ok ? null : LlmParamsValidator.formatLlmParamValidationIssues(result.issues)
  }
}
