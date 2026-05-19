import { describe, expect, it } from 'vitest'

import {
  TABLE_RESOURCE_TYPE_RECOMMENDED_VALUES,
  TABLE_BUSINESS_CATEGORY_RECOMMENDED_VALUES,
} from '../packages/spark-data/src'
import {
  DatasetModule,
} from '../packages/spark-ai/src/registrations/page-design/modules/dataset-tool-catalog'
import { LlmParamsValidator } from '../packages/spark-ai/src'

const LEGACY_EXAMPLE_FUNCTIONS = new Set(['getAggregate', 'setComputeExpression'])

function isActiveFunction(functionId: string): boolean {
  return functionId.length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function propertiesOf(schema: unknown): Record<string, unknown> {
  expect(schema).toMatchObject({ properties: expect.any(Object) })
  if (!isRecord(schema) || !isRecord(schema['properties'])) {
    throw new Error('schema.properties must be an object')
  }
  return schema['properties']
}

const DATASET_ROWS = new DatasetModule().getFunctions()

function getRow(functionId: string) {
  return DATASET_ROWS.find(r => r.functionId === functionId)
}

function validateDatasetParams(functionId: string, args: unknown): string | null {
  const row = DATASET_ROWS.find(r => r.functionId === functionId)
  if (!row) return `unknown ${functionId}`
  const result = LlmParamsValidator.validateLlmDeserializedParams(args ?? {}, row.paramsSchema)
  return result.ok ? null : LlmParamsValidator.formatLlmParamValidationIssues(result.issues)
}

describe('dataset tool protocol contract', () => {
  it('has active function rows', () => {
    const activeRows = DATASET_ROWS.filter(row => isActiveFunction(row.functionId))
    expect(activeRows.length).toBeGreaterThan(0)
  })

  it('accepts catalog examples as valid protocol payloads', () => {
    for (const row of DATASET_ROWS.filter(item => isActiveFunction(item.functionId))) {
      if (LEGACY_EXAMPLE_FUNCTIONS.has(row.functionId)) continue
      const error = validateDatasetParams(row.functionId, row.example)
      expect(error, `${row.functionId} example should pass validator`).toBeNull()
    }
  })

  it('can resolve known function rows', () => {
    const row = getRow('createTable')
    expect(row).toMatchObject({
      functionId: 'createTable',
    })
    expect(row?.paramsSchema.properties).toHaveProperty('tableName')
  })

  it('fails fast for unknown function in validator', () => {
    const error = validateDatasetParams('notExists', {})
    expect(error).not.toBeNull()
    expect(error).toContain('notExists')
  })

  it('does not expose removed legacy signatures in protocol lookup', () => {
    const legacyDeleteRelation = getRow('deleteRelationLegacy')
    expect(legacyDeleteRelation).toBeUndefined()
  })

  it('keeps view dependency tools on the parent/child table protocol', () => {
    const listDependencyParams = propertiesOf(getRow('listDependencies')?.paramsSchema)
    expect(listDependencyParams).toHaveProperty('parentTable')
    expect(listDependencyParams).toHaveProperty('childTable')
    expect(listDependencyParams).not.toHaveProperty('id')
    expect(listDependencyParams).not.toHaveProperty('targetViewKey')

    const createDependencyParams = propertiesOf(getRow('createDependency')?.paramsSchema)
    const dependencySchema = createDependencyParams['dependency']
    const dependencyProperties = propertiesOf(dependencySchema)
    expect(dependencyProperties).toHaveProperty('parentTable')
    expect(dependencyProperties).toHaveProperty('childTable')
    expect(dependencyProperties).toHaveProperty('dependencyType')
    expect(dependencyProperties).toHaveProperty('autoLoad')
    expect(dependencyProperties).not.toHaveProperty('targetViewKey')
    expect(dependencyProperties).not.toHaveProperty('sources')
    expect(dependencyProperties).not.toHaveProperty('bindings')
    expect(dependencyProperties).not.toHaveProperty('emptyPolicy')
    expect((dependencySchema as { required?: readonly string[] }).required).toEqual(['parentTable', 'childTable'])
  })

  it('exposes recommended enum dictionaries for table semantic metadata fields', () => {
    const row = getRow('updateTable')
    const properties = row?.paramsSchema.properties as Record<string, unknown> | undefined

    expect(properties).toMatchObject({
      resourceType: {
        type: ['string', 'null'],
        examples: TABLE_RESOURCE_TYPE_RECOMMENDED_VALUES,
      },
      businessCategory: {
        type: ['string', 'null'],
        examples: TABLE_BUSINESS_CATEGORY_RECOMMENDED_VALUES,
      },
    })
  })

  it('accepts recommended, custom, and nullable semantic metadata values while rejecting wrong types', () => {
    expect(validateDatasetParams('updateTable', {
      tableName: 'Users',
      resourceType: 'database-view',
      businessCategory: 'reference',
    })).toBeNull()

    expect(validateDatasetParams('updateTable', {
      tableName: 'Users',
      resourceType: 'erp-materialized-view',
      businessCategory: 'lookup',
    })).toBeNull()

    expect(validateDatasetParams('updateTable', {
      tableName: 'Users',
      resourceType: null,
      businessCategory: null,
    })).toBeNull()

    expect(validateDatasetParams('updateTable', {
      tableName: 'Users',
      resourceType: 123,
    })).toContain('resourceType')
  })
})
