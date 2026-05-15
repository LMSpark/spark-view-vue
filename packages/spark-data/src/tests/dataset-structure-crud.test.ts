import { describe, expect, it, vi } from 'vitest'
import { DataSet } from '../dataset'

function createStructureDataSet(): DataSet {
  return DataSet.fromJson({
    dataSetName: 'StructureDS',
    tables: {
      Orders: {
        tableName: 'Orders',
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'code', type: 'string' },
        ],
        views: {
          default: {
            rows: [{ id: 1, code: 'ORD-1' }],
            autoCurrentFirst: false,
            autoSelectFirst: false,
          },
        },
      },
      Items: {
        tableName: 'Items',
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'orderId', type: 'number' },
          { name: 'orderCode', type: 'string' },
        ],
        views: { default: { rows: [] } },
      },
      Drafts: {
        tableName: 'Drafts',
        columns: [{ name: 'id', type: 'number', isPrimaryKey: true }],
        views: { default: { rows: [] } },
      },
    },
    tableRelations: [
      {
        parentTable: 'Orders',
        childTable: 'Items',
        parentField: 'id',
        childField: 'orderId',
      },
    ],
    viewDependencies: [
      {
        id: 'items-by-order',
        targetViewKey: 'Items@default',
        sources: [{ id: 'orders', type: 'view', viewKey: 'Orders@default', state: 'currentRow' }],
        bindings: [{ sourceId: 'orders', sourceField: 'id', targetField: 'orderId', required: true }],
        autoLoad: true,
      },
    ],
  })
}

describe('DataSet structure CRUD', () => {
  it('addTable should attach default view to existing onAnyViewChange subscriptions', () => {
    const ds = createStructureDataSet()
    const handler = vi.fn()

    ds.onAnyViewChange({ currentRowChanged: handler })
    ds.addTable('TempUsers', [
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'name', type: 'string' },
    ])

    const view = ds.getView('TempUsers', 'default')!
    view.appendRow({ id: 1, name: 'Alice' })
    view.setCurrentRow(view.rows[0]!)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0]?.[0]).toBe('TempUsers')
  })

  it('removeTable should fail-fast when table is still referenced by relation or dependency', () => {
    const ds = createStructureDataSet()

    expect(() => ds.removeTable('Orders')).toThrow(/tableRelation|viewDependency/)
    expect(() => ds.removeTable('Items')).toThrow(/tableRelation|viewDependency/)
  })

  it('removeTable should delete unreferenced table', () => {
    const ds = createStructureDataSet()

    ds.removeTable('Drafts')

    expect(ds.getTable('Drafts')).toBeUndefined()
    expect(ds.getView('Drafts', 'default')).toBeUndefined()
  })

  it('updateRelation should rebuild table relation metadata without rewriting explicit view dependencies', () => {
    const ds = createStructureDataSet()

    const updated = ds.updateRelation(
      { parentTable: 'Orders', childTable: 'Items', parentField: 'id', childField: 'orderId' },
      { parentField: 'code', childField: 'orderCode', relationName: 'order-by-code' },
    )

    expect(updated.parentField).toBe('code')
    expect(updated.childField).toBe('orderCode')
    expect(updated.relationName).toBe('order-by-code')

    expect(ds.getTableChildRelations('Orders')[0]?.parentField).toBe('code')
    expect(ds.getTableChildRelations('Orders')[0]?.childField).toBe('orderCode')

    const parentRelations = ds.getParentRelations('Items', 'default')
    expect(parentRelations).toHaveLength(1)
    expect(parentRelations[0]?.parentField).toBe('id')
    expect(parentRelations[0]?.childField).toBe('orderId')
  })

  it('updateDependency should rebuild resolved dependency metadata', () => {
    const ds = createStructureDataSet()

    const updated = ds.updateDependency('items-by-order', {
      sources: [{ id: 'orders', type: 'view', viewKey: 'Orders@default', state: 'selectedRows' }],
      autoLoad: false,
    })

    expect(updated.sources[0]?.state).toBe('selectedRows')
    expect(updated.autoLoad).toBe(false)

    const parentRelations = ds.getParentRelations('Items', 'default')
    expect(parentRelations).toHaveLength(1)
    expect(parentRelations[0]?.sources?.[0]?.state).toBe('selectedRows')
    expect(parentRelations[0]?.autoLoad).toBe(false)
    expect(parentRelations[0]).not.toHaveProperty('filterExpression')
  })
})
