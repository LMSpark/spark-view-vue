import { describe, expect, it } from 'vitest'

import {
  formatLlmParamValidationIssues,
  validateLlmDeserializedParams,
} from '../packages/spark-ai/src/core/stills/llm-params-validator'
import { validateDataSetCrudToolStillParams } from '../packages/spark-ai/src/business/page-design/stills'

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

  it('accepts componentId string when description contains Chinese explanation text', () => {
    const result = validateLlmDeserializedParams(
      {
        componentId: 'div__0_0',
      },
      {
        componentId: 'string — 节点 id（来自 listChildren / getNode 返回结果中的 id 字段）',
      },
      {
        requiredKeys: ['componentId'],
      },
    )

    expect(result.ok).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('accepts replaceNode node.children as array with explicit array schema', () => {
    const result = validateLlmDeserializedParams(
      {
        componentId: 'div__0_0',
        node: {
          type: 'div',
          children: [],
        },
      },
      {
        componentId: 'string — 节点 id',
        node: {
          kind: 'object',
          required: ['type'],
          properties: {
            type: 'string — 组件类型',
          },
          optional: {
            children: {
              kind: 'array',
              note: 'SparkNodeChildren',
            },
          },
        },
      },
      {
        requiredKeys: ['componentId', 'node'],
      },
    )

    expect(result.ok).toBe(true)
    expect(result.issues).toHaveLength(0)
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

  it('enforces single-signature for datasetTool.deleteRelation (zero backward compat)', () => {
    // 旧签名（selector 包装对象）应明确失败，避免隐式兼容历史协议。
    const errorLegacySelector = validateDataSetCrudToolStillParams('datasetTool.deleteRelation', {
      selector: {
        parentTable: 'Department',
        childTable: 'Employee',
      },
    })
    expect(errorLegacySelector).not.toBeNull()

    // 缺少 parentTable 应该失败（单一签名：必须提供 parentTable 和 childTable）
    const errorMissingParent = validateDataSetCrudToolStillParams('datasetTool.deleteRelation', {
      childTable: 'Employee',
      parentField: 'deptId',
      childField: 'orderId',
    })
    expect(errorMissingParent).toContain('parentTable')

    // 缺少 childTable 应该失败
    const errorMissingChild = validateDataSetCrudToolStillParams('datasetTool.deleteRelation', {
      parentTable: 'Department',
      parentField: 'deptId',
      childField: 'orderId',
    })
    expect(errorMissingChild).toContain('childTable')

    // 提供完整的单一签名应该通过
    const noError = validateDataSetCrudToolStillParams('datasetTool.deleteRelation', {
      parentTable: 'Department',
      childTable: 'Employee',
      parentField: 'deptId',
      childField: 'orderId',
    })
    expect(noError).toBeNull()
  })
})