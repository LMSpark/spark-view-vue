import { describe, expect, it } from 'vitest'

import {
  LlmParamsValidator,
  PageDesignDatasetCatalog,
} from '../packages/spark-ai/src'

const datasetCatalog = new PageDesignDatasetCatalog()

describe('validateLlmDeserializedParams', () => {
  it('rejects non-object root params', () => {
    const result = LlmParamsValidator.validateLlmDeserializedParams('not-an-object', {})

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([
      {
        path: '$',
        message: '参数必须是 JSON 对象',
      },
    ])
  })

  it('supports nested wildcard object schemas', () => {
    const result = LlmParamsValidator.validateLlmDeserializedParams(
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
    const result = LlmParamsValidator.validateLlmDeserializedParams(
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
    expect(LlmParamsValidator.formatLlmParamValidationIssues(result.issues)).toContain('$.crudConfig.transformRequest 该字段在 LLM 参数中应省略')
  })

  it('accepts componentId string when description contains Chinese explanation text', () => {
    const result = LlmParamsValidator.validateLlmDeserializedParams(
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
    const result = LlmParamsValidator.validateLlmDeserializedParams(
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

  it('fails fast when leaf schema description has no recognizable type', () => {
    const result = LlmParamsValidator.validateLlmDeserializedParams(
      {
        foo: 'bar',
      },
      {
        foo: '字段说明（缺少类型标注）',
      },
      {
        requiredKeys: ['foo'],
      },
    )

    expect(result.ok).toBe(false)
    expect(LlmParamsValidator.formatLlmParamValidationIssues(result.issues)).toContain('schema 描述缺少可识别类型')
  })

  it('keeps explicit unknown leaf schema pass-through', () => {
    const result = LlmParamsValidator.validateLlmDeserializedParams(
      {
        payload: {
          anything: true,
        },
      },
      {
        payload: 'unknown — 明确声明由上层自行处理',
      },
      {
        requiredKeys: ['payload'],
      },
    )

    expect(result.ok).toBe(true)
    expect(result.issues).toHaveLength(0)
  })
})

describe('validateDataSetCrudToolFunctionParams', () => {
  it('accepts valid pageDesign@dataset@createTable params', () => {
    const error = datasetCatalog.validateParams('pageDesign@dataset@createTable', {
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

  it('rejects invalid pageDesign@dataset@createTable params after llm deserialization', () => {
    const error = datasetCatalog.validateParams('pageDesign@dataset@createTable', {
      tableName: 'Users',
      columns: 'id,name',
    })

    expect(error).toContain('$.columns 应为数组')
  })

  it('enforces single-signature for pageDesign@dataset@deleteRelation (zero backward compat)', () => {
    // 旧签名（selector 包装对象）应明确失败，避免隐式兼容历史协议。
    const errorLegacySelector = datasetCatalog.validateParams('pageDesign@dataset@deleteRelation', {
      selector: {
        parentTable: 'Department',
        childTable: 'Employee',
      },
    })
    expect(errorLegacySelector).not.toBeNull()

    // 缺少 parentTable 应该失败（单一签名：必须提供 parentTable 和 childTable）
    const errorMissingParent = datasetCatalog.validateParams('pageDesign@dataset@deleteRelation', {
      childTable: 'Employee',
      parentField: 'deptId',
      childField: 'orderId',
    })
    expect(errorMissingParent).toContain('parentTable')

    // 缺少 childTable 应该失败
    const errorMissingChild = datasetCatalog.validateParams('pageDesign@dataset@deleteRelation', {
      parentTable: 'Department',
      parentField: 'deptId',
      childField: 'orderId',
    })
    expect(errorMissingChild).toContain('childTable')

    // 提供完整的单一签名应该通过
    const noError = datasetCatalog.validateParams('pageDesign@dataset@deleteRelation', {
      parentTable: 'Department',
      childTable: 'Employee',
      parentField: 'deptId',
      childField: 'orderId',
    })
    expect(noError).toBeNull()
  })
})