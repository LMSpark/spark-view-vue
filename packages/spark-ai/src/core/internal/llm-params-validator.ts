/**
 * 通用 LLM 参数校验器（llm-params-validator）
 *
 * `paramsSchema` 只接受标准 JSON Schema object。校验由 AJV 执行，本模块只负责：
 * - 根参数必须是 JSON 对象；
 * - 将 AJV error 转成现有中文诊断。
 */

import Ajv2020, { type ErrorObject } from 'ajv/dist/2020.js'
import type { LlmParameterSchemaRoot } from '../protocol/parameter-schema'

export interface LlmParamValidationIssue {
  path: string
  message: string
}

export interface LlmParamValidationResult {
  readonly ok: boolean
  readonly issues: readonly LlmParamValidationIssue[]
}

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateSchema: true,
})

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isObjectSchemaRoot(value: unknown): value is LlmParameterSchemaRoot & { readonly type: 'object' } {
  return isPlainRecord(value) && value['type'] === 'object'
}

export class LlmParamsValidator {
  private constructor() {}

  static validateLlmDeserializedParams(
    params: unknown,
    schema: LlmParameterSchemaRoot,
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
      issues.push(...(validate.errors ?? []).map(LlmParamsValidator.issueFromAjvError))
    }

    return {
      ok: issues.length === 0,
      issues,
    }
  }

  static formatLlmParamValidationIssues(
    issues: readonly LlmParamValidationIssue[],
    maxCount = 5,
  ): string {
    if (issues.length === 0) return '参数校验通过'
    const head = issues.slice(0, maxCount).map(issue => `${issue.path} ${issue.message}`)
    const suffix = issues.length > maxCount ? `；另有 ${issues.length - maxCount} 个问题` : ''
    return `参数校验失败：${head.join('；')}${suffix}`
  }

  private static issueFromAjvError(error: ErrorObject): LlmParamValidationIssue {
    const path = LlmParamsValidator.pathFromAjvError(error)
    return {
      path,
      message: LlmParamsValidator.messageFromAjvError(error),
    }
  }

  private static pathFromAjvError(error: ErrorObject): string {
    if (error.keyword === 'required') {
      const missingProperty = (error.params as { missingProperty?: string }).missingProperty
      return missingProperty === undefined
        ? LlmParamsValidator.jsonPointerToPath(error.instancePath)
        : `${LlmParamsValidator.jsonPointerToPath(error.instancePath)}.${missingProperty}`
    }
    if (error.keyword === 'additionalProperties') {
      const additionalProperty = (error.params as { additionalProperty?: string }).additionalProperty
      return additionalProperty === undefined
        ? LlmParamsValidator.jsonPointerToPath(error.instancePath)
        : `${LlmParamsValidator.jsonPointerToPath(error.instancePath)}.${additionalProperty}`
    }
    return LlmParamsValidator.jsonPointerToPath(error.instancePath)
  }

  private static jsonPointerToPath(pointer: string): string {
    if (pointer.length === 0) return '$'
    return `$${pointer
      .split('/')
      .slice(1)
      .map((segment) => segment.replace(/~1/gu, '/').replace(/~0/gu, '~'))
      .map((segment) => (/^\d+$/u.test(segment) ? `[${segment}]` : `.${segment}`))
      .join('')}`
  }

  private static messageFromAjvError(error: ErrorObject): string {
    if (error.schema === false || error.message === 'boolean schema is false') return '该字段在 LLM 参数中应省略'
    if (error.keyword === 'required') return '缺少必填字段'
    if (error.keyword === 'additionalProperties') return '未声明的字段'
    if (error.keyword === 'type') {
      const type = (error.params as { type?: string }).type
      if (type === 'array') return '应为数组'
      if (type === 'object') return '应为对象'
      if (type === 'string') return '应为字符串'
      if (type === 'number' || type === 'integer') return '应为数字'
      if (type === 'boolean') return '应为布尔值'
      return type === undefined ? '类型不匹配' : `类型不匹配，期望 ${type}`
    }
    if (error.keyword === 'enum') {
      const allowedValues = (error.params as { allowedValues?: unknown[] }).allowedValues
      return Array.isArray(allowedValues)
        ? `必须是以下枚举之一: ${allowedValues.map(item => JSON.stringify(item)).join(' | ')}`
        : '必须是枚举允许值之一'
    }
    if (error.keyword === 'const') {
      const allowedValue = (error.params as { allowedValue?: unknown }).allowedValue
      return `必须等于 ${JSON.stringify(allowedValue)}`
    }
    if (error.keyword === 'maxLength') return `长度不能超过 ${(error.params as { limit?: number }).limit}`
    if (error.keyword === 'minLength') return `长度不能少于 ${(error.params as { limit?: number }).limit}`
    if (error.keyword === 'minimum') return `数值不能小于 ${(error.params as { comparison?: string; limit?: number }).limit}`
    if (error.keyword === 'maximum') return `数值不能大于 ${(error.params as { comparison?: string; limit?: number }).limit}`
    return error.message ?? '不满足 JSON Schema'
  }

}
