import { describe, expect, it } from 'vitest'

import {
  TABLE_RESOURCE_TYPE_RECOMMENDED_VALUES,
  TABLE_BUSINESS_CATEGORY_RECOMMENDED_VALUES,
} from '../packages/spark-data/src'
import {
  PageDesignDatasetCatalog,
} from '../packages/spark-ai/src/registrations/page-design/modules/dataset-tool-catalog'

const catalog = new PageDesignDatasetCatalog()

const LEGACY_EXAMPLE_FUNCTIONS = new Set(['getAggregate', 'setComputeExpression'])
const REMOVED_FIELD_DEPENDENCY_FUNCTIONS = [
  'listFieldDependencies',
  'getFieldDependency',
  'addFieldDependency',
  'updateFieldDependency',
  'removeFieldDependency',
] as const

function isActiveFunction(functionId: string): boolean {
  return functionId.length > 0
}

function propertiesOf(schema: unknown): Record<string, unknown> {
  expect(schema).toMatchObject({ properties: expect.any(Object) })
  return (schema as { properties: Record<string, unknown> }).properties
}

describe('dataset tool protocol contract', () => {
  it('keeps function table and capability table aligned', () => {
    const activeParameterRows = catalog.parameterTable.filter(row => isActiveFunction(row.functionId))
    const activeCapabilityRows = catalog.capabilityTable.filter(row => isActiveFunction(row.functionId))

    expect(activeParameterRows.length).toBeGreaterThan(0)
    expect(activeCapabilityRows.length).toBe(activeParameterRows.length)

    for (const row of activeParameterRows) {
      expect(row.functionId).not.toContain('/')
      const cap = catalog.getCapabilityRow(row.functionId)
      expect(cap).toBeDefined()
      expect(cap?.paramsRef).toBe(row.functionId)
      expect(cap?.crudToolMethod).toBe(row.crudToolMethod)
    }
  })

  it('accepts catalog examples as valid protocol payloads', () => {
    for (const row of catalog.parameterTable.filter(item => isActiveFunction(item.functionId))) {
      if (LEGACY_EXAMPLE_FUNCTIONS.has(row.functionId)) continue
      const error = catalog.validateParams(row.functionId, row.example)
      expect(error, `${row.functionId} example should pass validator`).toBeNull()
    }
  })

  it('can resolve a known function row from both indexes', () => {
    const row = catalog.getParameterRow('createTable')
    const cap = catalog.getCapabilityRow('createTable')

    expect(row).toMatchObject({
      functionId: 'createTable',
      type: 'request',
      crudToolMethod: 'createTable',
    })

    expect(cap).toMatchObject({
      functionId: 'createTable',
      paramsRef: 'createTable',
      crudToolMethod: 'createTable',
    })
  })

  it('declares runtime binding and registration status on parameter rows', () => {
    expect(catalog.getParameterRow('createTable')).toMatchObject({
      runtimeRegistration: 'registered',
      runtimeBinding: {
        kind: 'page-design-service',
        method: 'useDatasetMethod',
        targetMethod: 'createTable',
      },
    })

    expect(catalog.getParameterRow('export')).toMatchObject({
      runtimeRegistration: 'registered',
      runtimeBinding: {
        kind: 'page-design-service',
        method: 'useDatasetMethod',
        targetMethod: 'toJson',
      },
    })
  })

  it('fails fast for unknown function in validator', () => {
    const error = catalog.validateParams('notExists', {})
    expect(error).not.toBeNull()
    expect(error).toContain('notExists')
  })

  it('does not expose removed legacy signatures in protocol lookup', () => {
    const legacyDeleteRelation = catalog.getParameterRow('deleteRelationLegacy')
    expect(legacyDeleteRelation).toBeUndefined()
  })

  it('keeps view dependency tools on the parent/child table protocol', () => {
    const listDependencyParams = propertiesOf(catalog.getParameterRow('listDependencies')?.paramsSchema)
    expect(listDependencyParams).toHaveProperty('parentTable')
    expect(listDependencyParams).toHaveProperty('childTable')
    expect(listDependencyParams).not.toHaveProperty('id')
    expect(listDependencyParams).not.toHaveProperty('targetViewKey')

    const createDependencyParams = propertiesOf(catalog.getParameterRow('createDependency')?.paramsSchema)
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

  it('does not expose removed field dependency tools', () => {
    for (const functionId of REMOVED_FIELD_DEPENDENCY_FUNCTIONS) {
      expect(catalog.getParameterRow(functionId)).toBeUndefined()
      expect(catalog.getCapabilityRow(functionId)).toBeUndefined()
    }
  })

  it('exposes recommended enum dictionaries for table semantic metadata fields', () => {
    const row = catalog.getParameterRow('updateTable')
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
    expect(catalog.validateParams('updateTable', {
      tableName: 'Users',
      resourceType: 'database-view',
      businessCategory: 'reference',
    })).toBeNull()

    expect(catalog.validateParams('updateTable', {
      tableName: 'Users',
      resourceType: 'erp-materialized-view',
      businessCategory: 'lookup',
    })).toBeNull()

    expect(catalog.validateParams('updateTable', {
      tableName: 'Users',
      resourceType: null,
      businessCategory: null,
    })).toBeNull()

    expect(catalog.validateParams('updateTable', {
      tableName: 'Users',
      resourceType: 123,
    })).toContain('resourceType')
  })
})
