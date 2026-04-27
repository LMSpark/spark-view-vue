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
        parentTable: 'Orders',
        childTable: 'Items',
        dependencyType: 'currentRow',
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

  it('updateRelation should rebuild resolved relation fields', () => {
    const ds = createStructureDataSet()

    const updated = ds.updateRelation(
      { parentTable: 'Orders', childTable: 'Items', parentField: 'id', childField: 'orderId' },
      { parentField: 'code', childField: 'orderCode', relationName: 'order-by-code' },
    )

    expect(updated.parentField).toBe('code')
    expect(updated.childField).toBe('orderCode')
    expect(updated.relationName).toBe('order-by-code')

    const parentRelations = ds.getParentRelations('Items', 'default')
    expect(parentRelations).toHaveLength(1)
    expect(parentRelations[0]?.parentField).toBe('code')
    expect(parentRelations[0]?.childField).toBe('orderCode')
    expect(parentRelations[0]).not.toHaveProperty('filterExpression')
  })

  it('updateDependency should rebuild resolved dependency metadata', () => {
    const ds = createStructureDataSet()

    const updated = ds.updateDependency('Orders', 'Items', {
      dependencyType: 'selectedRows',
      autoLoad: false,
    })

    expect(updated.dependencyType).toBe('selectedRows')
    expect(updated.autoLoad).toBe(false)

    const parentRelations = ds.getParentRelations('Items', 'default')
    expect(parentRelations).toHaveLength(1)
    expect(parentRelations[0]?.dependencyType).toBe('selectedRows')
    expect(parentRelations[0]?.autoLoad).toBe(false)
    expect(parentRelations[0]).not.toHaveProperty('filterExpression')
  })
})