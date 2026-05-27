import { describe, expect, it } from 'vitest'

import {
  AiJsonSchemaValidator,
  noParamsSchema,
  numberSchema,
  paramsSchema,
  stringSchema,
} from '../json'

describe('AiJsonSchemaValidator', () => {
  it('validates deserialized params with standard JSON Schema object roots', () => {
    const schema = paramsSchema({
      name: stringSchema('姓名', { minLength: 1 }),
      days: numberSchema('天数'),
    }, ['name', 'days'])

    expect(AiJsonSchemaValidator.validateDeserializedParams({ name: 'Ada', days: 2 }, schema)).toEqual({
      ok: true,
      issues: [],
    })
  })

  it('reports required/type/additionalProperties issues in Chinese diagnostics', () => {
    const schema = {
      ...paramsSchema({
        name: stringSchema('姓名'),
        days: numberSchema('天数'),
      }, ['name', 'days']),
      additionalProperties: false,
    }

    const result = AiJsonSchemaValidator.validateDeserializedParams({ days: '2', extra: true }, schema)
    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      { path: '$.name', message: '缺少必填字段' },
      { path: '$.days', message: '应为数字' },
      { path: '$.extra', message: '未声明的字段' },
    ]))
    expect(AiJsonSchemaValidator.formatAiJsonValidationIssues(result.issues)).toContain('参数校验失败')
  })

  it('rejects non-object params and non-object schema roots fail-fast', () => {
    expect(AiJsonSchemaValidator.validateDeserializedParams([], noParamsSchema())).toEqual({
      ok: false,
      issues: [{ path: '$', message: '参数必须是 JSON 对象' }],
    })
    expect(AiJsonSchemaValidator.validateDeserializedParams({}, { type: 'string' })).toEqual({
      ok: false,
      issues: [{ path: '$', message: 'schema 根节点必须是 type=object 的标准 JSON Schema' }],
    })
  })

  it('formats long issue lists with a bounded summary', () => {
    const text = AiJsonSchemaValidator.formatAiJsonValidationIssues([
      { path: '$.a', message: '缺少必填字段' },
      { path: '$.b', message: '缺少必填字段' },
      { path: '$.c', message: '缺少必填字段' },
    ], 2)

    expect(text).toBe('参数校验失败：$.a 缺少必填字段；$.b 缺少必填字段；另有 1 个问题')
  })
})
