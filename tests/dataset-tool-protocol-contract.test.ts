import { describe, expect, it } from 'vitest'

import {
  TABLE_RESOURCE_TYPE_RECOMMENDED_VALUES,
  TABLE_BUSINESS_CATEGORY_RECOMMENDED_VALUES,
} from '../packages/spark-data/src'
import {
  PageDesignDatasetCatalog,
} from '../packages/spark-ai/src/business/page-design/functions/dataset'

const catalog = new PageDesignDatasetCatalog()

const REMOVED_FUNCTIONS = new Set(['listAggregates', 'getAggregate'])
const LEGACY_EXAMPLE_FUNCTIONS = new Set(['getAggregate', 'setComputeExpression'])

function isActiveFunction(functionId: string): boolean {
  return !REMOVED_FUNCTIONS.has(functionId)
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

  it('fails fast for unknown function in validator', () => {
    const error = catalog.validateParams('notExists', {})
    expect(error).not.toBeNull()
    expect(error).toContain('notExists')
  })

  it('does not expose removed legacy signatures in protocol lookup', () => {
    const legacyDeleteRelation = catalog.getParameterRow('deleteRelationLegacy')
    expect(legacyDeleteRelation).toBeUndefined()
  })

  it('exposes recommended enum dictionaries for table semantic metadata fields', () => {
    const row = catalog.getParameterRow('updateTable')

    expect(row?.paramsSchema).toMatchObject({
      resourceType: {
        kind: 'enum',
        type: 'string',
        enum: TABLE_RESOURCE_TYPE_RECOMMENDED_VALUES,
        openEnded: true,
        nullable: true,
      },
      businessCategory: {
        kind: 'enum',
        type: 'string',
        enum: TABLE_BUSINESS_CATEGORY_RECOMMENDED_VALUES,
        openEnded: true,
        nullable: true,
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
