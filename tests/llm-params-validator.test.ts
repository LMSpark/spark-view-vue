import { describe, expect, it } from 'vitest'

import {
  LlmParamsValidator,
  DatasetModule,
  type LlmParameterSchemaRoot,
} from '../packages/spark-ai/src'

const DATASET_ROWS = new DatasetModule().getFunctions()

function validateDatasetParams(functionId: string, args: unknown): string | null {
  const row = DATASET_ROWS.find(r => r.functionId === functionId)
  if (!row) return `unknown ${functionId}`
  const result = LlmParamsValidator.validateLlmDeserializedParams(args ?? {}, row.paramsSchema)
  return result.ok ? null : LlmParamsValidator.formatLlmParamValidationIssues(result.issues)
}

const NO_PARAMS_SCHEMA: LlmParameterSchemaRoot = {
  type: 'object',
  properties: {},
  additionalProperties: false,
}

describe('validateLlmDeserializedParams', () => {
  it('rejects non-object root params', () => {
    const result = LlmParamsValidator.validateLlmDeserializedParams('not-an-object', NO_PARAMS_SCHEMA)

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([
      {
        path: '$',
        message: '参数必须是 JSON 对象',
      },
    ])
  })

  it('supports nested dynamic-key JSON Schema objects', () => {
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
        type: 'object',
        required: ['tableName'],
        properties: {
          tableName: { type: 'string', description: '表名' },
          views: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                page: { type: 'number', description: '当前页' },
              },
            },
          },
        },
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
        type: 'object',
        properties: {
          crudConfig: {
            type: 'object',
            properties: {
              transformRequest: false,
            },
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
        type: 'object',
        required: ['componentId'],
        properties: {
          componentId: { type: 'string', description: '节点 id（来自 listChildren / getNode 返回结果中的 id 字段）' },
        },
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
        type: 'object',
        required: ['componentId', 'node'],
        properties: {
          componentId: { type: 'string', description: '节点 id' },
          node: {
            type: 'object',
            required: ['type'],
            properties: {
              type: { type: 'string', description: '组件类型' },
              children: { type: 'array', description: 'SparkNodeChildren' },
            },
          },
        },
      },
    )

    expect(result.ok).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('fails fast when schema is not standard JSON Schema', () => {
    const invalidSchema = {
      foo: '字段说明（缺少类型标注）',
    } as unknown as LlmParameterSchemaRoot

    const result = LlmParamsValidator.validateLlmDeserializedParams(
      {
        foo: 'bar',
      },
      invalidSchema,
    )

    expect(result.ok).toBe(false)
    expect(LlmParamsValidator.formatLlmParamValidationIssues(result.issues)).toContain('schema 根节点必须是 type=object 的标准 JSON Schema')
  })

  it('keeps explicit open JSON Schema pass-through', () => {
    const result = LlmParamsValidator.validateLlmDeserializedParams(
      {
        payload: {
          anything: true,
        },
      },
      {
        type: 'object',
        required: ['payload'],
        properties: {
          payload: { description: '明确声明由上层自行处理' },
        },
      },
    )

    expect(result.ok).toBe(true)
    expect(result.issues).toHaveLength(0)
  })
})

describe('validateDataSetCrudToolFunctionParams', () => {
  it('accepts valid dataset.createTable params', () => {
    const error = validateDatasetParams('createTable', {
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

  it('rejects invalid dataset.createTable params after llm deserialization', () => {
    const error = validateDatasetParams('createTable', {
      tableName: 'Users',
      columns: 'id,name',
    })

    expect(error).toContain('$.columns 应为数组')
  })

  it('enforces single-signature for dataset.deleteRelation (zero backward compat)', () => {
    // 旧签名（selector 包装对象）应明确失败，避免隐式兼容历史协议。
    const errorLegacySelector = validateDatasetParams('deleteRelation', {
      selector: {
        parentTable: 'Department',
        childTable: 'Employee',
      },
    })
    expect(errorLegacySelector).not.toBeNull()

    // 缺少 parentTable 应该失败（单一签名：必须提供 parentTable 和 childTable）
    const errorMissingParent = validateDatasetParams('deleteRelation', {
      childTable: 'Employee',
      parentField: 'deptId',
      childField: 'orderId',
    })
    expect(errorMissingParent).toContain('parentTable')

    // 缺少 childTable 应该失败
    const errorMissingChild = validateDatasetParams('deleteRelation', {
      parentTable: 'Department',
      parentField: 'deptId',
      childField: 'orderId',
    })
    expect(errorMissingChild).toContain('childTable')

    // 提供完整的单一签名应该通过
    const noError = validateDatasetParams('deleteRelation', {
      parentTable: 'Department',
      childTable: 'Employee',
      parentField: 'deptId',
      childField: 'orderId',
    })
    expect(noError).toBeNull()
  })
})
