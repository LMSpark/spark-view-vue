/**
 * ═══════════════════════════════════════════════════════════════
 * json/validator.ts — 通用 AI JSON 参数校验器
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】schema 层顶部，依赖 types.ts 和 AJV 2020。
 *   负责将 LLM 传入的 JSON 参数按 paramsSchema 校验，输出中文诊断。
 *
 * 【设计决策】
 *   - 基于 AJV 2020（标准 JSON Schema 校验引擎），不自己实现校验逻辑。
 *   - 所有方法为 static，类不持有状态，全局复用单一 Ajv2020 实例。
 *   - AJV error keyword → 中文消息映射集中在一处，便于统一调整措辞。
 *   - JSON Pointer 路径转 $.a.b[0] 格式，方便 LLM 理解错误位置。
 *
 * 【消费方】modules/internal/function-invoker.ts（参数校验）
 *
 * ═══════════════════════════════════════════════════════════════
 * 校验流程（validateDeserializedParams）：
 *
 *   ① params 必须是 JSON 对象（非 null/非数组）
 *   ② schema 根必须是 type=object 的标准 JSON Schema
 *   ③ ajv.compile(schema) → 编译校验器
 *   ④ validate(params) → 收集 issues
 *   ⑤ ok=false 时用 formatAiJsonValidationIssues 生成中文诊断
 * ═══════════════════════════════════════════════════════════════
 */

import Ajv2020, { type ErrorObject } from 'ajv/dist/2020.js'
import { isRecord } from '@spark-view/spark-utils'
import type { AiJsonSchema, AiJsonSchemaObject } from './types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 公共类型 — 校验结果
// ═══════════════════════════════════════════════════════════════

/** 单条校验问题 */
export type AiJsonValidationIssue = {
  path: string
  message: string
}

/** 校验结果：ok + issues 列表 */
export type AiJsonValidationResult = Readonly<{
  ok: boolean
  issues: readonly AiJsonValidationIssue[]
}>

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · AJV 实例 — 全局复用，全量错误收集
// ═══════════════════════════════════════════════════════════════

const ajv = new Ajv2020({
  allErrors: true,        // 收集所有错误，不只是第一个
  strict: false,          // 放宽严格模式，允许非标准关键字
  validateSchema: true,   // 编译时校验 schema 自身合法性
})

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 内部类型守卫 — 运行时结构判断
// ═══════════════════════════════════════════════════════════════

/** 是否为 type=object 的标准 JSON Schema 根 */
function isObjectSchemaRoot(value: unknown): value is AiJsonSchemaObject & { readonly type: 'object' } {
  return isRecord(value) && value['type'] === 'object'
}

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · AJV error 参数安全访问器
// ═══════════════════════════════════════════════════════════════

function errorParam(error: ErrorObject, key: string): unknown {
  return isRecord(error.params) ? error.params[key] : undefined
}

function stringParam(error: ErrorObject, key: string): string | undefined {
  const value = errorParam(error, key)
  return typeof value === 'string' ? value : undefined
}

function numberParam(error: ErrorObject, key: string): number | undefined {
  const value = errorParam(error, key)
  return typeof value === 'number' ? value : undefined
}

function unknownArrayParam(error: ErrorObject, key: string): readonly unknown[] | undefined {
  const value = errorParam(error, key)
  return Array.isArray(value) ? value : undefined
}

// ═══════════════════════════════════════════════════════════════
// 第 5 节 · AiJsonSchemaValidator — 核心校验器（全 static）
// ═══════════════════════════════════════════════════════════════

export class AiJsonSchemaValidator {
  private constructor() {}

  // ── 公共 API ──

  /**
   * 校验反序列化后的 LLM 参数。
   *
   * 调用时序：
   *   1. LLM 返回 function call arguments（JSON 字符串）
   *   2. Host 层 JSON.parse → params
   *   3. FunctionInvoker 调用本方法校验 params 是否符合 function.paramsSchema
   */
  static validateDeserializedParams(
    params: unknown,
    schema: unknown,
  ): AiJsonValidationResult {
    const issues: AiJsonValidationIssue[] = []

    // 步骤 ①：params 必须是普通 JSON 对象
    if (!isRecord(params)) {
      return {
        ok: false,
        issues: [{ path: '$', message: '参数必须是 JSON 对象' }],
      }
    }

    // 步骤 ②：schema 根必须是 type=object
    if (!isObjectSchemaRoot(schema)) {
      return {
        ok: false,
        issues: [{ path: '$', message: 'schema 根节点必须是 type=object 的标准 JSON Schema' }],
      }
    }

    // 步骤 ③④：AJV 编译并校验
    const validate = ajv.compile(schema)
    if (!validate(params)) {
      issues.push(...(validate.errors ?? []).map(AiJsonSchemaValidator.issueFromAjvError))
    }

    return {
      ok: issues.length === 0,
      issues,
    }
  }

  /** 校验任意 JSON 值是否符合 JSON Schema。用于属性值与直调 function 参数兜底校验。 */
  static validateJsonValue(
    value: unknown,
    schema: AiJsonSchema,
  ): AiJsonValidationResult {
    const validate = ajv.compile(schema)
    if (validate(value)) {
      return { ok: true, issues: [] }
    }
    return {
      ok: false,
      issues: (validate.errors ?? []).map(AiJsonSchemaValidator.issueFromAjvError),
    }
  }

  /**
   * 将校验问题格式化为中文诊断字符串。
   * 默认最多显示 5 条，超出时追加 "另有 N 个问题"。
   */
  static formatAiJsonValidationIssues(
    issues: readonly AiJsonValidationIssue[],
    maxCount = 5,
  ): string {
    if (issues.length === 0) return '参数校验通过'
    const head = issues.slice(0, maxCount).map(issue => `${issue.path} ${issue.message}`)
    const suffix = issues.length > maxCount ? `；另有 ${issues.length - maxCount} 个问题` : ''
    return `参数校验失败：${head.join('；')}${suffix}`
  }

  // ── 私有：AJV error → AiJsonValidationIssue ──

  /** 将 AJV error 对象转换为 AiJsonValidationIssue */
  private static issueFromAjvError(error: ErrorObject): AiJsonValidationIssue {
    const path = AiJsonSchemaValidator.pathFromAjvError(error)
    return {
      path,
      message: AiJsonSchemaValidator.messageFromAjvError(error),
    }
  }

  // ── 私有：JSON Pointer → $.a.b[0] 路径格式 ──

  /**
   * 从 AJV error 中提取最佳路径表达。
   * - required 错误：在父路径后追加缺失属性名
   * - additionalProperties 错误：在父路径后追加多余属性名
   * - 其他错误：直接转换 instancePath
   */
  private static pathFromAjvError(error: ErrorObject): string {
    if (error.keyword === 'required') {
      const missingProperty = stringParam(error, 'missingProperty')
      return missingProperty === undefined
        ? AiJsonSchemaValidator.jsonPointerToPath(error.instancePath)
        : `${AiJsonSchemaValidator.jsonPointerToPath(error.instancePath)}.${missingProperty}`
    }
    if (error.keyword === 'additionalProperties') {
      const additionalProperty = stringParam(error, 'additionalProperty')
      return additionalProperty === undefined
        ? AiJsonSchemaValidator.jsonPointerToPath(error.instancePath)
        : `${AiJsonSchemaValidator.jsonPointerToPath(error.instancePath)}.${additionalProperty}`
    }
    return AiJsonSchemaValidator.jsonPointerToPath(error.instancePath)
  }

  /**
   * JSON Pointer (RFC 6901) → $.a.b[0] 格式。
   * 处理 ~1 → /、~0 → ~ 转义，数字段用 [N] 表达。
   *
   * 示例：
   *   ""           → "$"
   *   "/name"      → "$.name"
   *   "/items/0"   → "$.items[0]"
   *   "/a~1b"      → "$.a/b"
   */
  private static jsonPointerToPath(pointer: string): string {
    if (pointer.length === 0) return '$'
    return `$${pointer
      .split('/')
      .slice(1)
      .map((segment) => segment.replace(/~1/gu, '/').replace(/~0/gu, '~'))
      .map((segment) => (/^\d+$/u.test(segment) ? `[${segment}]` : `.${segment}`))
      .join('')}`
  }

  // ── 私有：AJV error keyword → 中文诊断消息 ──

  /**
   * 将 AJV error keyword 映射为 LLM 可理解的中文消息。
   * 这是唯一的中文诊断映射点，便于统一调整措辞。
   */
  private static messageFromAjvError(error: ErrorObject): string {
    // schema: false 表示该字段被显式禁止
    if (error.schema === false || error.message === 'boolean schema is false') return '该字段在 LLM 参数中应省略'

    // 逐 keyword 映射
    if (error.keyword === 'required') return '缺少必填字段'
    if (error.keyword === 'additionalProperties') return '未声明的字段'
    if (error.keyword === 'type') {
      const type = stringParam(error, 'type')
      if (type === 'array') return '应为数组'
      if (type === 'object') return '应为对象'
      if (type === 'string') return '应为字符串'
      if (type === 'number' || type === 'integer') return '应为数字'
      if (type === 'boolean') return '应为布尔值'
      return type === undefined ? '类型不匹配' : `类型不匹配，期望 ${type}`
    }
    if (error.keyword === 'enum') {
      const allowedValues = unknownArrayParam(error, 'allowedValues')
      return Array.isArray(allowedValues)
        ? `必须是以下枚举之一: ${allowedValues.map(item => JSON.stringify(item)).join(' | ')}`
        : '必须是枚举允许值之一'
    }
    if (error.keyword === 'const') {
      const allowedValue = errorParam(error, 'allowedValue')
      return `必须等于 ${JSON.stringify(allowedValue)}`
    }
    if (error.keyword === 'maxLength') return `长度不能超过 ${numberParam(error, 'limit')}`
    if (error.keyword === 'minLength') return `长度不能少于 ${numberParam(error, 'limit')}`
    if (error.keyword === 'minimum') return `数值不能小于 ${numberParam(error, 'limit')}`
    if (error.keyword === 'maximum') return `数值不能大于 ${numberParam(error, 'limit')}`

    // 兜底：使用 AJV 原始消息
    return error.message ?? '不满足 JSON Schema'
  }
}
