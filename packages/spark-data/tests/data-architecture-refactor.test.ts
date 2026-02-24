/**
 * 测试 DataTable 与 DataView 的职责分离
 * DataTable: 纯结构定义 + 配置提供者
 * DataView: 数据拥有者 + CRUD 操作执行者
 */

import { describe, it, expect } from 'vitest'
import { toRaw } from 'vue'
import { DataSet } from '@spark-view/spark-data'

describe('Data Architecture Refactor', () => {
  it('DataTable 只提供配置，DataView 拥有数据', () => {
    const ds = DataSet.fromConfig({
      dataSetName: 'TestDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [{ name: 'id', type: 'number' }, { name: 'name', type: 'string' }],
          rows: [{ id: 1, name: 'Alice' }],
          api: {
            list: { url: '/api/users', method: 'GET' },
            create: { url: '/api/users', method: 'POST' }
          }
        }
      }
    })

    const table = ds.getTable('Users')!
    const view = ds.getView('Users', 'default')!

    // DataTable 只有配置，没有 CRUD 方法
    expect(table.api).toBeDefined()
    expect(table.columns).toBeDefined()
    expect((table as any).loadFromServer).toBeUndefined()
    expect((table as any).createRecord).toBeUndefined()

    // DataView 拥有数据和 CRUD 方法
    expect(view.rows).toBeDefined()
    expect(view.rows.length).toBe(1)
    expect(typeof view.loadFromServer).toBe('function')
    expect(typeof view.createRecord).toBe('function')
    expect(typeof view.updateRecord).toBe('function')
    expect(typeof view.deleteRecord).toBe('function')
  })

  it('DataTable 管理视图容器，不操作数据', () => {
    const ds = DataSet.fromConfig({
      dataSetName: 'TestDS',
      tables: {
        Products: {
          tableName: 'Products',
          columns: [{ name: 'id', type: 'number' }],
          rows: []
        }
      }
    })

    const table = ds.getTable('Products')!
    
    // DataTable 可以创建和管理视图
    const view1 = table.getOrCreateView('grid1')
    const view2 = table.getOrCreateView('grid2')
    
    expect(view1.viewId).toBe('grid1')
    expect(view2.viewId).toBe('grid2')
    expect(table.views['grid1']).toBe(view1)
    expect(table.views['grid2']).toBe(view2)

    // 但 DataTable 不应该直接操作数据
    expect((table as any).rows).toBeUndefined()
  })

  it('DataView 从 DataTable 获取配置', () => {
    const ds = DataSet.fromConfig({
      dataSetName: 'TestDS',
      tables: {
        Orders: {
          tableName: 'Orders',
          columns: [],
          api: { list: { url: '/api/orders', method: 'GET' } }
        }
      }
    })

    const table = ds.getTable('Orders')!
    table.setCrudConfig({ timeout: 5000, retryCount: 3 })
    const view = ds.getView('Orders', 'default')!

    // DataTable 提供配置
    expect(table.api?.list?.url).toBe('/api/orders')
    expect(table.crudConfig?.timeout).toBe(5000)

    // DataView 访问 DataTable 的配置（通过 getCrudConfig 内部实现）
    // view 是 reactive 代理，view.dataTable 返回的也是代理，用 toRaw 提取原始对象
    expect(toRaw(view.dataTable!)).toBe(table)
  })
})
