import { describe, expect, it } from 'vitest'

import {
  TABLE_RESOURCE_TYPE_RECOMMENDED_VALUES,
  TABLE_BUSINESS_CATEGORY_RECOMMENDED_VALUES,
} from '../packages/spark-data/src'
import {
  PageDesignDatasetCatalog,
} from '../packages/spark-ai/src/business/page-design/functions/dataset'

const catalog = new PageDesignDatasetCatalog()

const REMOVED_ACTIONS = new Set(['pageDesign@dataset@listAggregates', 'pageDesign@dataset@getAggregate'])
const LEGACY_EXAMPLE_ACTIONS = new Set(['pageDesign@dataset@getAggregate', 'pageDesign@dataset@setComputeExpression'])

function isActiveAction(action: string): boolean {
  return !REMOVED_ACTIONS.has(action)
}

describe('dataset tool protocol contract', () => {
  it('keeps action table and capability table aligned', () => {
    const activeParameterRows = catalog.parameterTable.filter(row => isActiveAction(row.action))
    const activeCapabilityRows = catalog.capabilityTable.filter(row => isActiveAction(row.action))

    expect(activeParameterRows.length).toBeGreaterThan(0)
    expect(activeCapabilityRows.length).toBe(activeParameterRows.length)

    for (const row of activeParameterRows) {
      expect(row.action.startsWith('pageDesign@dataset@')).toBe(true)
      const cap = catalog.getCapabilityRow(row.action)
      expect(cap).toBeDefined()
      expect(cap?.paramsRef).toBe(row.action)
      expect(cap?.crudToolMethod).toBe(row.crudToolMethod)
    }
  })

  it('accepts catalog examples as valid protocol payloads', () => {
    for (const row of catalog.parameterTable.filter(item => isActiveAction(item.action))) {
      if (LEGACY_EXAMPLE_ACTIONS.has(row.action)) continue
      const error = catalog.validateParams(row.action, row.example)
      expect(error, `${row.action} example should pass validator`).toBeNull()
    }
  })

  it('can resolve a known action row from both indexes', () => {
    const row = catalog.getParameterRow('pageDesign@dataset@createTable')
    const cap = catalog.getCapabilityRow('pageDesign@dataset@createTable')

    expect(row).toMatchObject({
      action: 'pageDesign@dataset@createTable',
      type: 'request',
      crudToolMethod: 'createTable',
    })

    expect(cap).toMatchObject({
      action: 'pageDesign@dataset@createTable',
      paramsRef: 'pageDesign@dataset@createTable',
      crudToolMethod: 'createTable',
    })
  })

  it('fails fast for unknown action in validator', () => {
    const error = catalog.validateParams('pageDesign@dataset@notExists', {})
    expect(error).not.toBeNull()
    expect(error).toContain('pageDesign@dataset@notExists')
  })

  it('does not expose removed legacy signatures in protocol lookup', () => {
    const legacyDeleteRelation = catalog.getParameterRow('pageDesign@dataset@deleteRelationLegacy')
    expect(legacyDeleteRelation).toBeUndefined()
  })

  it('exposes recommended enum dictionaries for table semantic metadata fields', () => {
    const row = catalog.getParameterRow('pageDesign@dataset@updateTable')

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
    expect(catalog.validateParams('pageDesign@dataset@updateTable', {
      tableName: 'Users',
      resourceType: 'database-view',
      businessCategory: 'reference',
    })).toBeNull()

    expect(catalog.validateParams('pageDesign@dataset@updateTable', {
      tableName: 'Users',
      resourceType: 'erp-materialized-view',
      businessCategory: 'lookup',
    })).toBeNull()

    expect(catalog.validateParams('pageDesign@dataset@updateTable', {
      tableName: 'Users',
      resourceType: null,
      businessCategory: null,
    })).toBeNull()

    expect(catalog.validateParams('pageDesign@dataset@updateTable', {
      tableName: 'Users',
      resourceType: 123,
    })).toContain('resourceType')
  })
})
