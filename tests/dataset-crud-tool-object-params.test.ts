import { describe, expect, it } from 'vitest'
import { DataSetCrudTool } from '@spark-view/spark-data'

describe('DataSetCrudTool object params', () => {
  it('supports object params for table, view and row crud', async () => {
    const tool = new DataSetCrudTool('UsersDS')

    tool.createTable({
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'name', type: 'string' },
      ],
      resourceType: 'database-table',
      views: {
        default: {
          rows: [{ id: 1, name: 'Alice' }],
        },
      },
    })

    tool.updateTable({
      tableName: 'Users',
      resourceId: 'crm.users',
      businessCategory: 'master',
    })

    expect(tool.getTable({ tableName: 'Users' })?.resourceId).toBe('crm.users')
    expect(tool.getTable({ tableName: 'Users' })?.businessCategory).toBe('master')

    tool.createView({ tableName: 'Users', viewId: 'grid', config: { pageSize: 50 } })
    expect(tool.getView({ tableName: 'Users', viewId: 'grid' })?.pageSize).toBe(50)

    await tool.createRow({ tableName: 'Users', data: { id: 2, name: 'Bob' } })
    expect(tool.listRows({ tableName: 'Users' })).toHaveLength(2)

    await tool.updateRow({ tableName: 'Users', id: 2, data: { name: 'Bobby' } })
    expect(tool.getRow({ tableName: 'Users', id: 2 })?.['name']).toBe('Bobby')

    tool.updateView({ tableName: 'Users', viewId: 'grid', updates: { page: 3 } })
    expect(tool.getView({ tableName: 'Users', viewId: 'grid' })?.page).toBe(3)

    await tool.deleteRow({ tableName: 'Users', id: 1 })
    expect(tool.getRow({ tableName: 'Users', id: 1 })).toBeUndefined()

    tool.deleteView({ tableName: 'Users', viewId: 'grid' })
    expect(tool.getView({ tableName: 'Users', viewId: 'grid' })).toBeUndefined()
  })

  it('supports object params for column, relation and dependency crud', () => {
    const tool = new DataSetCrudTool('RelationDS')

    tool.createTable({
      tableName: 'Orders',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'code', type: 'string' },
      ],
    })
    tool.createTable({
      tableName: 'Items',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'orderId', type: 'number' },
        { name: 'orderCode', type: 'string' },
      ],
    })

    tool.createColumn({ tableName: 'Items', column: { name: 'status', type: 'string' } })
    tool.updateColumn({ tableName: 'Items', columnName: 'status', updates: { label: 'Status' } })
    expect(tool.getColumn({ tableName: 'Items', columnName: 'status' })?.label).toBe('Status')
    tool.deleteColumn({ tableName: 'Items', columnName: 'status' })
    expect(tool.getColumn({ tableName: 'Items', columnName: 'status' })).toBeUndefined()

    tool.createRelation({ parentTable: 'Orders', childTable: 'Items', parentField: 'id', childField: 'orderId' })
    tool.updateRelation({
      selector: { parentTable: 'Orders', childTable: 'Items', parentField: 'id', childField: 'orderId' },
      updates: { relationName: 'order-items' },
    })
    expect(
      tool.getRelation({ parentTable: 'Orders', childTable: 'Items', parentField: 'id', childField: 'orderId' })?.relationName,
    ).toBe('order-items')

    tool.createDependency({ parentTable: 'Orders', childTable: 'Items', dependencyType: 'currentRow', autoLoad: true })
    tool.updateDependency({
      parentTable: 'Orders',
      childTable: 'Items',
      updates: { dependencyType: 'selectedRows', autoLoad: false },
    })
    expect(tool.getDependency({ parentTable: 'Orders', childTable: 'Items' })?.dependencyType).toBe('selectedRows')

    tool.deleteDependency({ parentTable: 'Orders', childTable: 'Items' })
    expect(tool.getDependency({ parentTable: 'Orders', childTable: 'Items' })).toBeUndefined()

    tool.deleteRelation({ parentTable: 'Orders', childTable: 'Items', parentField: 'id', childField: 'orderId' })
    expect(tool.getRelation({ parentTable: 'Orders', childTable: 'Items', parentField: 'id', childField: 'orderId' })).toBeUndefined()
  })

})