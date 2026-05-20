/**
 * 知识投射工具目录。
 *
 * 职责：定义 knowledge 模块的 3 个内置函数，
 * 供 LLM 在运行时动态探索可用能力。
 *
 * 内置函数说明：
 * ┌──────────────────────────────────────────────────────────────┐
 * │ queryFunctions  → 按 modulePath/moduleId/keyword 过滤函数摘要  │
 * │   - 用途：LLM 确认可用工具列表，决定下一步操作                 │
 * │   - 参数：modulePath（模糊）、moduleId（精确）、keyword（模糊） │
 * │   - 返回：轻量摘要（action、描述、参数名、失败码）             │
 * │                                                               │
 * │ queryModules    → 列出所有模块目录（无参数）                    │
 * │   - 用途：确认模块边界与模块路径                                │
 * │   - 参数：无                                                   │
 * │   - 返回：轻量模块摘要（ID、路径、名称、描述、函数数量）        │
 * │                                                               │
 * │ guideFunction   → 按 action 查询完整函数指南                    │
 * │   - 用途：执行函数前获取完整参数 schema/规则/失败模式           │
 * │   - 参数：action（必填，最小长度 1）                            │
 * │   - 返回：完整 AiRuntimeFunctionExposure                        │
 * │   - 失败：FUNCTION_NOT_FOUND → 先用 queryFunctions 确认 action  │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 渐进式工具暴露联动：
 * LLM 调用 guideFunction 成功后，addGuidedAiToolAction() 会解锁对应工具，
 * 使其在下一轮工具循环中对 LLM 可见。
 */

import type { FunctionFailureMode } from '../../protocol/runtime-contracts'
import type { LlmJsonObject, LlmJsonSchemaObject, LlmParameterSchemaRoot } from '../../protocol/parameter-schema'
import { LlmParamsValidator } from '../llm-params-validator'

// ═══════════════════════════════════════════════════════
// 1. 函数 ID / 目标类型
// ═══════════════════════════════════════════════════════

/** knowledge 模块函数失败模式（继承自 FunctionFailureMode） */
export interface AiKnowledgeFunctionFailureMode extends FunctionFailureMode {}

/** knowledge 模块固定目标标识 */
export type AiKnowledgeFunctionTarget = 'knowledge'

/** knowledge 模块内置函数 ID 联合类型 */
export type AiKnowledgeFunctionId =
  | 'queryFunctions'
  | 'queryModules'
  | 'guideFunction'

// ═══════════════════════════════════════════════════════
// 2. 参数行类型
// ═══════════════════════════════════════════════════════

/** 知识函数的基础字段（所有内置函数共有） */
interface AiKnowledgeFunctionBaseFields {
  /** 函数标识符 */
  functionId: AiKnowledgeFunctionId
  /** 函数类型（固定为 'describe'，表示描述型函数） */
  type: 'describe'
  /** 函数描述，展示给 LLM */
  description: string
  /** 参数 JSON Schema */
  paramsSchema: LlmParameterSchemaRoot
  /** 返回值 JSON Schema */
  resultSchema: LlmJsonObject
  /** 示例参数，用于 LLM 参考 */
  example: LlmJsonObject
  /** 使用规则列表，展示给 LLM */
  usageRules: readonly string[]
}

/** 知识函数参数行：包含完整注册信息，用于参数校验和工具编码 */
export interface AiKnowledgeFunctionParameterRow extends AiKnowledgeFunctionBaseFields {
  /** 失败模式列表 */
  readonly failureModes: readonly AiKnowledgeFunctionFailureMode[]
  /** 目标模块（固定为 'knowledge'） */
  readonly target: AiKnowledgeFunctionTarget
}

/** 创建参数行的选项（由调用方提供，不需要 functionId/type/target） */
export interface AiKnowledgeCatalogRowOptions extends Omit<
  AiKnowledgeFunctionParameterRow,
  'functionId' | 'type' | 'target'
> {}

// ═══════════════════════════════════════════════════════
// 3. 内置函数注册表 & 辅助构造器
// ═══════════════════════════════════════════════════════

/** knowledge 模块固定目标值 */
const KNOWLEDGE_TARGET: AiKnowledgeFunctionTarget = 'knowledge'

/** 无参数 schema：用于 queryModules（不接受任何参数） */
const NO_PARAMS: LlmParameterSchemaRoot = {
  type: 'object',
  properties: {},
  additionalProperties: false,
  description: 'queryModules 不接受参数，请传 {} 或留空。',
}

/** 构造字符串参数 schema，支持 minLength 选项 */
function stringParam(description: string, options: { minLength?: number } = {}): LlmJsonSchemaObject {
  return {
    type: 'string',
    description,
    ...(options.minLength !== undefined ? { minLength: options.minLength } : {}),
  }
}

// ═══════════════════════════════════════════════════════
// 4. AiKnowledgeCatalog 实现
// ═══════════════════════════════════════════════════════

/**
 * 知识工具目录。
 *
 * 构造函数中注册 3 个内置函数到 parameterTable，
 * 并建立 parameterIndex 索引（functionId → 参数行）用于 O(1) 查找。
 *
 * 调用方通过 getParameterRow() 和 validateParams() 使用。
 */
export class AiKnowledgeCatalog {
  /** 3 个内置知识函数的参数行列表 */
  readonly parameterTable: readonly AiKnowledgeFunctionParameterRow[]

  /** functionId → 参数行索引，用于 O(1) 查找 */
  private readonly parameterIndex: ReadonlyMap<string, AiKnowledgeFunctionParameterRow>

  constructor() {
    this.parameterTable = [
      // ── queryFunctions：按条件过滤函数目录 ──
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
      // ── queryModules：列出模块目录（无参数） ──
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
      // ── guideFunction：按 action 查询完整指南 ──
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

  /**
   * 按 functionId 查找参数行。
   * 未找到返回 undefined。
   */
  getParameterRow(functionId: string): AiKnowledgeFunctionParameterRow | undefined {
    return this.parameterIndex.get(functionId)
  }

  /**
   * 校验指定 knowledge 函数的参数。
   *
   * 校验流程：
   * 1. 查找 functionId 对应的参数行
   * 2. 使用 LlmParamsValidator 对反序列化后的参数做结构校验
   * 3. 返回 null 表示通过，否则返回格式化的错误信息
   */
  validateParams(functionId: string, params: unknown): string | null {
    const row = this.getParameterRow(functionId)
    if (row === undefined) {
      return `未知 knowledge 函数: ${functionId}`
    }

    const result = LlmParamsValidator.validateLlmDeserializedParams(params ?? {}, row.paramsSchema)
    return result.ok ? null : LlmParamsValidator.formatLlmParamValidationIssues(result.issues)
  }
}
