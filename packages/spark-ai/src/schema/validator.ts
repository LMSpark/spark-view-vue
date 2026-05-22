/**
 * 通用 LLM 参数校验器（llm-params-validator）
 *
 * `paramsSchema` 只接受标准 JSON Schema object。校验由 AJV 执行，本模块只负责：
 * - 根参数必须是 JSON 对象；
 * - 将 AJV error 转成现有中文诊断。
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │                  LlmSchemaValidator                        │
 * │                                                           │
 * │  validateLlmDeserializedParams()                          │
 * │    ├─ ① params 必须是 JSON 对象                           │
 * │    ├─ ② schema 根必须是 type=object                       │
 * │    ├─ ③ ajv.compile(schema) → 编译校验器                  │
 * │    └─ ④ validate(params) → 收集 issues                    │
 * │                                                           │
 * │  formatLlmParamValidationIssues()                         │
 * │    └─ 格式化 issues 为中文诊断字符串（默认最多 5 条）       │
 * │                                                           │
 * │  AJV → 中文转换：                                          │
 * │    pathFromAjvError()  → JSON Pointer → $.a.b[0]          │
 * │    messageFromAjvError() → required/type/enum/const 等    │
 * │                      → "缺少必填字段" 等中文消息           │
 * └──────────────────────────────────────────────────────────┘
 */

import Ajv2020, { type ErrorObject } from 'ajv/dist/2020.js'
import type { LlmParameterSchemaRoot } from './types'

export type LlmParamValidationIssue = {
  path: string
  message: string
}

export type LlmParamValidationResult = Readonly<{
  ok: boolean
  issues: readonly LlmParamValidationIssue[]
}>

/** AJV 2020 实例：全局复用，允许所有错误收集 */
const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateSchema: true,
})

/** 类型守卫：检查是否为普通对象（非数组/null） */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isObjectSchemaRoot(value: unknown): value is LlmParameterSchemaRoot & { readonly type: 'object' } {
  return isPlainRecord(value) && value['type'] === 'object'
}

function errorParam(error: ErrorObject, key: string): unknown {
  return isPlainRecord(error.params) ? error.params[key] : undefined
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

export class LlmSchemaValidator {
  private constructor() {}

  /**
   * 校验反序列化后的 LLM 参数。
   * 流程：检查 params 是对象 → 检查 schema 是 type=object → ajv.compile → validate。
   */
  static validateLlmDeserializedParams(
    params: unknown,
    schema: unknown,
  ): LlmParamValidationResult {
    const issues: LlmParamValidationIssue[] = []
    if (!isPlainRecord(params)) {
      return {
        ok: false,
        issues: [{ path: '$', message: '参数必须是 JSON 对象' }],
      }
    }

    if (!isObjectSchemaRoot(schema)) {
      return {
        ok: false,
        issues: [{ path: '$', message: 'schema 根节点必须是 type=object 的标准 JSON Schema' }],
      }
    }

    const validate = ajv.compile(schema)
    if (!validate(params)) {
      issues.push(...(validate.errors ?? []).map(LlmSchemaValidator.issueFromAjvError))
    }

    return {
      ok: issues.length === 0,
      issues,
    }
  }

  /** 将校验问题格式化为中文诊断字符串，默认最多显示 5 条 */
  static formatLlmParamValidationIssues(
    issues: readonly LlmParamValidationIssue[],
    maxCount = 5,
  ): string {
    if (issues.length === 0) return '参数校验通过'
    const head = issues.slice(0, maxCount).map(issue => `${issue.path} ${issue.message}`)
    const suffix = issues.length > maxCount ? `；另有 ${issues.length - maxCount} 个问题` : ''
    return `参数校验失败：${head.join('；')}${suffix}`
  }

  /** 将 AJV error 对象转换为 LlmParamValidationIssue */
  private static issueFromAjvError(error: ErrorObject): LlmParamValidationIssue {
    const path = LlmSchemaValidator.pathFromAjvError(error)
    return {
      path,
      message: LlmSchemaValidator.messageFromAjvError(error),
    }
  }

  /** 将 AJV JSON Pointer 转换为 $.a.b[0] 格式路径 */
  private static pathFromAjvError(error: ErrorObject): string {
    if (error.keyword === 'required') {
      const missingProperty = stringParam(error, 'missingProperty')
      return missingProperty === undefined
        ? LlmSchemaValidator.jsonPointerToPath(error.instancePath)
        : `${LlmSchemaValidator.jsonPointerToPath(error.instancePath)}.${missingProperty}`
    }
    if (error.keyword === 'additionalProperties') {
      const additionalProperty = stringParam(error, 'additionalProperty')
      return additionalProperty === undefined
        ? LlmSchemaValidator.jsonPointerToPath(error.instancePath)
        : `${LlmSchemaValidator.jsonPointerToPath(error.instancePath)}.${additionalProperty}`
    }
    return LlmSchemaValidator.jsonPointerToPath(error.instancePath)
  }

  /** JSON Pointer → $.a.b[0]：处理 ~1 → /、~0 → ~ 转义 */
  private static jsonPointerToPath(pointer: string): string {
    if (pointer.length === 0) return '$'
    return `$${pointer
      .split('/')
      .slice(1)
      .map((segment) => segment.replace(/~1/gu, '/').replace(/~0/gu, '~'))
      .map((segment) => (/^\d+$/u.test(segment) ? `[${segment}]` : `.${segment}`))
      .join('')}`
  }

  /** 将 AJV error keyword 映射为中文诊断消息 */
  private static messageFromAjvError(error: ErrorObject): string {
    if (error.schema === false || error.message === 'boolean schema is false') return '该字段在 LLM 参数中应省略'
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
    return error.message ?? '不满足 JSON Schema'
  }

}
