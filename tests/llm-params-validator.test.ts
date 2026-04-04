import { describe, expect, it } from 'vitest'

import {
  formatLlmParamValidationIssues,
  validateDataSetCrudToolStillParams,
  validateLlmDeserializedParams,
} from '../packages/spark-ai/src/stills'

describe('validateLlmDeserializedParams', () => {
  it('rejects non-object root params', () => {
    const result = validateLlmDeserializedParams('not-an-object', {})

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([
      {
        path: '$',
        message: '参数必须是 JSON 对象',
      },
    ])
  })

  it('supports nested wildcard object schemas', () => {
    const result = validateLlmDeserializedParams(
      {
        tableName: 'Users',
        views: {
          grid: {
            page: 2,
          },
        },
      },
      {
        tableName: 'string — 表名',
        views: {
          kind: 'object',
          optional: {
            '<customViewId>': {
              kind: 'object',
              optional: {
                page: 'number? — 当前页',
              },
            },
          },
        },
      },
      {
        requiredKeys: ['tableName'],
      },
    )

    expect(result.ok).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('rejects llm-forbidden fields that should be omitted', () => {
    const result = validateLlmDeserializedParams(
      {
        crudConfig: {
          transformRequest: 'foo',
        },
      },
      {
        crudConfig: {
          kind: 'object',
          optional: {
            transformRequest: '不要传函数；LLM 场景应省略此字段',
          },
        },
      },
    )

    expect(result.ok).toBe(false)
    expect(formatLlmParamValidationIssues(result.issues)).toContain('$.crudConfig.transformRequest 该字段在 LLM 参数中应省略')
  })
})

describe('validateDataSetCrudToolStillParams', () => {
  it('accepts valid datasetTool.createTable params', () => {
    const error = validateDataSetCrudToolStillParams('datasetTool.createTable', {
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'name', type: 'string' },
      ],
      views: {
        default: {
          pageSize: 20,
        },
      },
    })

    expect(error).toBeNull()
  })

  it('rejects invalid datasetTool.createTable params after llm deserialization', () => {
    const error = validateDataSetCrudToolStillParams('datasetTool.createTable', {
      tableName: 'Users',
      columns: 'id,name',
    })

    expect(error).toContain('$.columns 应为数组')
  })

  it('enforces selector-or-pair semantics for datasetTool.deleteRelation', () => {
    const error = validateDataSetCrudToolStillParams('datasetTool.deleteRelation', {
      childField: 'orderId',
    })

    expect(error).toContain('以下字段至少满足一组: [selector] 或 [parentTable, childTable]')
  })
})