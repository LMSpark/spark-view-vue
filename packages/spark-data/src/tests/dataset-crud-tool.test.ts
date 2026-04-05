import { describe, expect, it } from 'vitest'
import { DataSetCrudTool, SparkData } from '@spark-view/spark-data'

describe('DataSetCrudTool', () => {
  it('constructor should create an empty DataSet with the provided name', () => {
    const tool = new DataSetCrudTool('ToolDS')

    expect(tool.dataSetName).toBe('ToolDS')
    expect(tool.listTables()).toHaveLength(0)
    expect(tool.dataSet.dataSetName).toBe('ToolDS')
  })

  it('should support table, view and row CRUD from one facade', async () => {
    const tool = new DataSetCrudTool('UsersDS')

    tool.createTable({
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'name', type: 'string' },
      ],
      resourceType: 'database-table',
      resourceId: 'crm.users',
      businessCategory: 'master',
      views: {
        default: {
          rows: [{ id: 1, name: 'Alice' }],
          autoCurrentFirst: false,
        },
      },
    })

    expect(tool.getTable('Users')?.resourceType).toBe('database-table')
    expect(tool.getTable('Users')?.resourceId).toBe('crm.users')
    expect(tool.getTable('Users')?.businessCategory).toBe('master')

    tool.createView('Users', 'grid', { pageSize: 50 })
    expect(tool.getView('Users', 'grid')?.pageSize).toBe(50)

    await tool.createRow('Users', { id: 2, name: 'Bob' })
    expect(tool.listRows('Users')).toHaveLength(2)
    expect(tool.getTable('Users')?.rows).toHaveLength(2)

    await tool.updateRow('Users', 2, { name: 'Bobby' })
    expect(tool.getRow('Users', 2)?.['name']).toBe('Bobby')

    await tool.deleteRow('Users', 1)
    expect(tool.getRow('Users', 1)).toBeUndefined()
    expect(tool.getTable('Users')?.rows).toHaveLength(1)

    tool.updateView('Users', 'grid', { page: 3 })
    expect(tool.getView('Users', 'grid')?.page).toBe(3)

    tool.deleteView('Users', 'grid')
    expect(tool.getView('Users', 'grid')).toBeUndefined()
  })

  it('should support batch row CRUD from one facade', async () => {
    const tool = new DataSetCrudTool('BatchRowsDS')

    tool.createTable({
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'name', type: 'string' },
      ],
      views: {
        default: {
          rows: [{ id: 1, name: 'Alice' }],
          autoCurrentFirst: false,
        },
      },
    })

    const createResult = await tool.createRows('Users', [
      { id: 2, name: 'Bob' },
      { id: 3, name: 'Carol' },
    ])
    expect(createResult.success).toBe(true)
    expect(createResult.data?.successCount).toBe(2)
    expect(tool.listRows('Users')).toHaveLength(3)

    const updateResult = await tool.updateRows('Users', [
      { id: 2, data: { name: 'Bobby' } },
      { id: 3, data: { name: 'Caroline' } },
    ])
    expect(updateResult.success).toBe(true)
    expect(updateResult.data?.failureCount).toBe(0)
    expect(tool.getRow('Users', 2)?.['name']).toBe('Bobby')
    expect(tool.getRow('Users', 3)?.['name']).toBe('Caroline')

    const deleteResult = await tool.deleteRows('Users', [1, 3])
    expect(deleteResult.success).toBe(true)
    expect(deleteResult.data?.successCount).toBe(2)
    expect(tool.getRow('Users', 1)).toBeUndefined()
    expect(tool.getRow('Users', 3)).toBeUndefined()
    expect(tool.getTable('Users')?.rows).toHaveLength(1)
  })

  it('should support column CRUD and refresh DataView column cache and validator', () => {
    const tool = new DataSetCrudTool('SchemaDS')
    tool.createTable({
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'name', type: 'string' },
      ],
    })

    const table = tool.getTable('Users')!
    const view = tool.getView('Users', 'default')!
    const initialColumnCount = tool.listColumns('Users').length

    tool.createColumn('Users', { name: 'email', type: 'string' })
    tool.updateColumn('Users', 'name', { label: 'User Name' })

    expect(tool.listColumns('Users')).toHaveLength(initialColumnCount + 1)
    expect(tool.getColumn('Users', 'email')).toBeDefined()
    expect(view.getColumn('email')).toBeDefined()
    expect(tool.getColumn('Users', 'name')?.label).toBe('User Name')
    expect(view.getColumn('name')?.label).toBe('User Name')
    expect(table.validator?.isValid({ id: 1, name: 'Alice', email: 'a@test.dev' })).toBe(true)

    tool.deleteColumn('Users', 'email')
    expect(tool.getColumn('Users', 'email')).toBeUndefined()
    expect(view.getColumn('email')).toBeUndefined()
  })

  it('should support table semantic metadata planning fields', () => {
    const tool = new DataSetCrudTool('MetaDS')

    tool.createTable({
      tableName: 'StatusOptions',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'label', type: 'string' },
      ],
      resourceType: 'static-data',
      resourceId: 'common.order-status',
    })

    tool.updateTable('StatusOptions', {
      resourceType: 'logical-view',
      resourceId: null,
      businessCategory: 'reference',
    })

    const table = tool.getTable('StatusOptions')
    expect(table?.resourceType).toBe('logical-view')
    expect(table?.resourceId).toBeUndefined()
    expect(table?.businessCategory).toBe('reference')

    const exported = tool.toJson().tables['StatusOptions']
    expect(exported?.resourceType).toBe('logical-view')
    expect(exported?.resourceId).toBeUndefined()
    expect(exported?.businessCategory).toBe('reference')
  })

  it('should support relation and dependency CRUD including ambiguous pair disambiguation', () => {
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

    tool.createRelation({ parentTable: 'Orders', childTable: 'Items', parentField: 'id', childField: 'orderId' })
    tool.createRelation({ parentTable: 'Orders', childTable: 'Items', parentField: 'code', childField: 'orderCode' })

    expect(() => tool.getRelation({ parentTable: 'Orders', childTable: 'Items' })).toThrow(/ambiguous/)

    tool.deleteRelation({ parentTable: 'Orders', childTable: 'Items', parentField: 'code', childField: 'orderCode' })
    expect(tool.listRelations({ parentTable: 'Orders', childTable: 'Items' })).toHaveLength(1)

    tool.createDependency({ parentTable: 'Orders', childTable: 'Items', dependencyType: 'currentRow', autoLoad: true })
    expect(tool.getDependency('Orders', 'Items')?.dependencyType).toBe('currentRow')

    tool.updateDependency('Orders', 'Items', { dependencyType: 'selectedRows', autoLoad: false })
    expect(tool.getDependency('Orders', 'Items')?.dependencyType).toBe('selectedRows')

    tool.deleteDependency('Orders', 'Items')
    expect(tool.getDependency('Orders', 'Items')).toBeUndefined()
  })

  it('SparkData namespace should expose createDataSetCrudTool factory', () => {
    const tool = SparkData.createDataSetCrudTool('NamespaceDS')

    expect(tool).toBeInstanceOf(DataSetCrudTool)
    expect(tool.dataSetName).toBe('NamespaceDS')
  })
})