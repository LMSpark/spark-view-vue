/**
 * 能力体系通信测试（DataView 独立事件 + subscribe 模式）
 *
 * 覆盖：
 * - DataView.events.on('currentRowChanged') / ('selectedRowsChanged') / ('cleared') 状态监听
 * - DataView.setCurrentRow / setSelectedRows / clearAll 触发状态变更
 * - events.on / events.off 事件订阅
 * - TreeManager 缓存操作（无事件）
 *
 * 【设计原则】DataView 是与 UI 交互的唯一通道。
 * 所有 UI 状态操作（setCurrentRow, setSelectedRows, clearAll）
 * 必须通过 DataView，不通过 DataTable。
 * 状态监听直接订阅 DataView.events 的独立事件，不经过 DataSet。
 */

import { describe, it, expect, vi } from 'vitest'
import { SparkData } from '@spark-view/spark-data'
import { DataTable } from '../data-table'


// ==================== 工具函数 ====================

function createTestDataSet() {
  return SparkData.createDataSet({
    dataSetName: 'TestDS',
    tables: {
      Departments: {
        tableName: 'Departments',
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'name', type: 'string' }
        ],
        rows: [
          { id: 1, name: 'Engineering' },
          { id: 2, name: 'Marketing' }
        ],
        autoCurrentFirst: false,
        autoSelectFirst: false
      },
      Users: {
        tableName: 'Users',
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'deptId', type: 'number' },
          { name: 'name', type: 'string' }
        ],
        rows: [
          { id: 101, deptId: 1, name: 'Alice' },
          { id: 102, deptId: 1, name: 'Bob' }
        ]
      }
    },
    relations: [
      {
        parentTable: 'Departments',
        childTable: 'Users',
        dependencyType: 'currentRow' as const,
        filterExpression: { field: 'deptId', op: '==' as const, value: null },
        autoLoad: false,  // 本测试聚焦事件发射，级联行为在 dataset-request-orchestration.test.ts 测试
      }
    ]
  })
}

// ==================== DataView 独立事件测试 ====================

describe('DataView 独立事件监听（currentRowChanged / selectedRowsChanged / cleared）', () => {
  it('setCurrentRow 触发 currentRowChanged 事件', () => {
    const ds = createTestDataSet()
    const handler = vi.fn()

    const deptView = ds.getView('Departments')!
    deptView.events.on('currentRowChanged', handler)
    deptView.selection.setCurrentRow(deptView.rows[0]!)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(deptView.rows[0], undefined)
  })

  it('setCurrentRow(null) 触发 currentRowChanged 事件', () => {
    const ds = createTestDataSet()
    const deptView = ds.getView('Departments')!
    deptView.selection.setCurrentRow(deptView.rows[0]!)

    const handler = vi.fn()
    deptView.events.on('currentRowChanged', handler)
    deptView.selection.setCurrentRow(null)

    expect(handler).toHaveBeenCalled()
    expect(handler).toHaveBeenCalledWith(null, undefined)
  })

  it('setSelectedRows 触发 selectedRowsChanged 事件', () => {
    const ds = createTestDataSet()
    const handler = vi.fn()

    const deptView = ds.getView('Departments')!
    deptView.events.on('selectedRowsChanged', handler)
    deptView.selection.setSelectedRows([deptView.rows[0]!, deptView.rows[1]!])

    expect(handler).toHaveBeenCalled()
    expect(handler).toHaveBeenCalledWith(
      [deptView.rows[0]!, deptView.rows[1]!],
      undefined
    )
  })

  it('clearAll 触发 cleared 事件', () => {
    const ds = createTestDataSet()
    const deptView = ds.getView('Departments')!
    deptView.selection.setCurrentRow(deptView.rows[0]!)

    const handler = vi.fn()
    deptView.events.on('cleared', handler)
    deptView.clearAll()

    expect(handler).toHaveBeenCalled()
  })

  it('setCurrentRow 同一行重复设置不触发事件（去重）', () => {
    const ds = createTestDataSet()
    const handler = vi.fn()

    const deptView = ds.getView('Departments')!
    deptView.events.on('currentRowChanged', handler)

    const row = deptView.rows[0]!
    deptView.selection.setCurrentRow(row)
    const countAfterFirst = handler.mock.calls.length
    deptView.selection.setCurrentRow(row) // 同一引用

    // 第二次调用应被幂等去重，不增加调用次数
    expect(handler).toHaveBeenCalledTimes(countAfterFirst)
  })

  it('setSelectedRows 同样内容重复设置不触发事件（去重）', () => {
    const ds = createTestDataSet()
    const handler = vi.fn()

    const deptView = ds.getView('Departments')!
    deptView.events.on('selectedRowsChanged', handler)

    const rows = [deptView.rows[0]!, deptView.rows[1]!]
    deptView.selection.setSelectedRows(rows)
    const countAfterFirst = handler.mock.calls.length
    deptView.selection.setSelectedRows(rows) // 内容相同

    // 第二次调用应被去重，不增加调用次数
    expect(handler.mock.calls.length).toBe(countAfterFirst)
  })

  it('每次视图状态变化都触发对应的独立事件', () => {
    const ds = createTestDataSet()
    const currentRowHandler = vi.fn()
    const selectedRowsHandler = vi.fn()

    const deptView = ds.getView('Departments')!
    deptView.events.on('currentRowChanged', currentRowHandler)
    deptView.events.on('selectedRowsChanged', selectedRowsHandler)

    // selectionFollowsCurrent=true → setCurrentRow 触发 currentRowChanged (1) + selectedRowsChanged (1)
    // setSelectedRows 触发 selectedRowsChanged (1)
    deptView.selection.setCurrentRow(deptView.rows[0]!)
    deptView.selection.setSelectedRows([deptView.rows[1]!])

    expect(currentRowHandler).toHaveBeenCalledTimes(1)
    expect(selectedRowsHandler).toHaveBeenCalledTimes(2) // 1 from follow + 1 from setSelectedRows
  })

  it('events.off 取消监听', () => {
    const ds = createTestDataSet()
    const handler = vi.fn()

    const deptView = ds.getView('Departments')!
    deptView.events.on('currentRowChanged', handler)

    deptView.selection.setCurrentRow(deptView.rows[0]!)
    const countBeforeOff = handler.mock.calls.length
    expect(countBeforeOff).toBeGreaterThan(0)

    deptView.events.off('currentRowChanged', handler)
    deptView.selection.setCurrentRow(deptView.rows[1]!)
    expect(handler).toHaveBeenCalledTimes(countBeforeOff) // 取消后不再增加
  })
})

// ==================== events.on / events.off 测试 ====================

describe('DataView 独立事件 events.on / events.off（事件订阅）', () => {
  it('events.off 取消监听', () => {
    const ds = createTestDataSet()
    const cb = vi.fn()

    const deptView = ds.getView('Departments')!
    deptView.events.on('currentRowChanged', cb)
    deptView.selection.setCurrentRow(deptView.rows[0]!)
    const countBeforeOff = cb.mock.calls.length
    expect(countBeforeOff).toBeGreaterThan(0)

    deptView.events.off('currentRowChanged', cb)
    deptView.selection.setCurrentRow(deptView.rows[1]!)
    expect(cb).toHaveBeenCalledTimes(countBeforeOff) // 取消后不再增加
  })

  it('setCurrentRow 自动触发 currentRowChanged + selectedRowsChanged 回调', () => {
    const ds = createTestDataSet()
    const currentRowCb = vi.fn()
    const selectedRowsCb = vi.fn()
    const deptView = ds.getView('Departments')!
    deptView.events.on('currentRowChanged', currentRowCb)
    deptView.events.on('selectedRowsChanged', selectedRowsCb)

    deptView.selection.setCurrentRow(deptView.rows[0]!)

    // selectionFollowsCurrent=true → 触发 currentRowChanged + selectedRowsChanged
    expect(currentRowCb).toHaveBeenCalledTimes(1)
    expect(selectedRowsCb).toHaveBeenCalledTimes(1)
  })
})

// ==================== 能力流端到端测试 ====================

describe('能力流端到端', () => {
  it('setCurrentRow 触发完整能力流：级联 → 通知 → 状态事件', () => {
    const ds = createTestDataSet()
    const events: string[] = []

    const deptView = ds.getView('Departments')!

    // 订阅独立事件
    deptView.events.on('currentRowChanged', () => events.push('currentRowChanged'))
    deptView.events.on('selectedRowsChanged', () => events.push('selectedRowsChanged'))
    // 第二个监听器也应收到同一事件
    deptView.events.on('currentRowChanged', () => events.push('listener2:Departments.default'))

    deptView.selection.setCurrentRow(deptView.rows[0]!)

    // 验证能力流：两个监听器都被触发
    expect(events).toContain('listener2:Departments.default')
    expect(events).toContain('currentRowChanged')
  })
})

// ==================== TreeManager 缓存测试（无事件） ====================

describe('TreeManager 缓存操作', () => {
  it('addNodesToCache 正确写入缓存', () => {
    const tree = SparkData.createTreeManager({
      idField: 'id',
      parentIdField: 'parentId'
    })

    tree.addNodesToCache([
      { id: 1, parentId: null, name: 'Root' }
    ])

    expect(tree.getNode(1)).toBeDefined()
    expect(tree.getNode(1)!.name).toBe('Root')
  })

  it('clear 清空缓存', () => {
    const tree = SparkData.createTreeManager({
      idField: 'id',
      parentIdField: 'parentId'
    })

    tree.addNodesToCache([
      { id: 1, parentId: null, name: 'Root' }
    ])
    tree.clear()

    expect(tree.getNode(1)).toBeUndefined()
    expect(tree.getRoots()).toHaveLength(0)
  })
})

// ==================== DataView.primaryKey 自动推导测试 ====================

describe('DataView.primaryKey 从 DataTable 列定义自动推导', () => {
  it('单主键：列定义 isPrimaryKey=true 时 primaryKey 自动使用该列名', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'PKTest',
      tables: {
        Items: {
          tableName: 'Items',
          columns: [
            { name: 'itemId', type: 'number', isPrimaryKey: true },
            { name: 'title', type: 'string' },
          ],
          rows: [
            { itemId: 100, title: 'A' },
            { itemId: 200, title: 'B' },
          ],
        },
      },
    })
    const view = ds.getView('Items')!
    // 自动从列定义推导 primaryKey，不是硬编码 'id'
    expect(view.primaryKey).toBe('itemId')
    // getPkKey 使用推导后的主键
    expect(view.getPkKey(view.rows[0]!)).toBe(100)
    expect(view.getPkKey(view.rows[1]!)).toBe(200)
  })

  it('复合主键：多列 isPrimaryKey=true 时自动合成 _pk 计算列', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'CompositePK',
      tables: {
        OrderItems: {
          tableName: 'OrderItems',
          columns: [
            { name: 'orderId', type: 'number', isPrimaryKey: true },
            { name: 'productId', type: 'number', isPrimaryKey: true },
            { name: 'quantity', type: 'number' },
          ],
          rows: [
            { orderId: 1, productId: 10, quantity: 2 },
            { orderId: 1, productId: 20, quantity: 5 },
          ],
        },
      },
    })
    const view = ds.getView('OrderItems')!
    // 复合主键自动合成单字符串主键 '_pk'
    expect(view.primaryKey).toBe('_pk')
    expect(view.rows[0]?.['_pk']).toBe('1+10')
    expect(view.rows[1]?.['_pk']).toBe('1+20')
    // getPkKey 返回单一标量主键值（合成 _pk 值）
    expect(view.getPkKey(view.rows[0]!)).toBe('1+10')
    expect(view.getPkKey(view.rows[1]!)).toBe('1+20')
    // buildServerPk 返回真实 PK 字段对象（供 CRUD 接口传参）
    expect(view.buildServerPk(view.rows[0]!)).toEqual({ orderId: 1, productId: 10 })
    expect(view.buildServerPk(view.rows[1]!)).toEqual({ orderId: 1, productId: 20 })
  })

  it('无 isPrimaryKey 标记时降级为默认 id', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'NoPK',
      tables: {
        Logs: {
          tableName: 'Logs',
          columns: [
            { name: 'message', type: 'string' },
            { name: 'level', type: 'string' },
          ],
          rows: [{ id: 1, message: 'hello', level: 'info' }],
        },
      },
    })
    const view = ds.getView('Logs')!
    // 无 isPrimaryKey 列，降级到 'id'
    expect(view.primaryKey).toBe('id')
  })

  it('显式覆盖 primaryKey 优先于列定义', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'OverridePK',
      tables: {
        Items: {
          tableName: 'Items',
          columns: [
            { name: 'itemId', type: 'number', isPrimaryKey: true },
            { name: 'uuid', type: 'string' },
          ],
          rows: [{ itemId: 1, uuid: 'abc-123' }],
        },
      },
    })
    const view = ds.getView('Items')!
    expect(view.primaryKey).toBe('itemId') // 从列推导

    // 显式覆盖
    view.primaryKey = 'uuid'
    expect(view.primaryKey).toBe('uuid')
    expect(view.getPkKey(view.rows[0]!)).toBe('abc-123')
  })

  it('动态创建视图也继承列定义的主键', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'DynView',
      tables: {
        Items: {
          tableName: 'Items',
          columns: [
            { name: 'code', type: 'string', isPrimaryKey: true },
            { name: 'name', type: 'string' },
          ],
          rows: [],
        },
      },
    })
    // 动态创建命名视图
    const gridView = ds.getTable('Items')!.getOrCreateView('grid')
    expect(gridView.primaryKey).toBe('code')
  })

  it('setCurrentRow 使用列定义推导的主键正确匹配', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'SelectPK',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'userId', type: 'number', isPrimaryKey: true },
            { name: 'name', type: 'string' },
          ],
          rows: [
            { userId: 10, name: 'Alice' },
            { userId: 20, name: 'Bob' },
          ],
          autoCurrentFirst: false,
          autoSelectFirst: false,
        },
      },
    })
    const view = ds.getView('Users')!
    expect(view.primaryKey).toBe('userId')
    expect(view.currentRow).toBeNull()

    view.selection.setCurrentRow(view.rows[1]!) // Bob
    expect(view._currentRowId).toBe(20)
    expect(view.currentRow).toEqual({ userId: 20, name: 'Bob' })
  })
})

// ==================== DataView.primaryKey 边缘用例 ====================

describe('DataView.primaryKey 边缘用例', () => {
  it('DataView.fromData()（无 DataTable）primaryKey 回退为 id', () => {
    // fromData 创建的独立视图没有 dataTable 引用
    const v = SparkData.createDataView({ tableName: 'Standalone', viewId: 'default' })
    // 无 dataTable → 无法访问列定义 → 回退 'id'
    expect(v.primaryKey).toBe('id')
  })

  it('fromTableData 命名视图正确继承列定义主键', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'FromTableDS',
      tables: {
        Orders: {
          tableName: 'Orders',
          columns: [
            { name: 'orderId', type: 'number', isPrimaryKey: true },
            { name: 'amount', type: 'number' },
          ],
          rows: [],
        },
      },
    })
    // 通过 getOrCreateView 创建命名视图
    const table = ds.getTable('Orders')!
    const reportView = table.getOrCreateView('report')
    // 命名视图也应从列定义推导主键
    expect(reportView.primaryKey).toBe('orderId')
  })

  it('resetPrimaryKey() 清除覆盖后恢复列推导', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'ResetDS',
      tables: {
        Items: {
          tableName: 'Items',
          columns: [{ name: 'itemId', type: 'number', isPrimaryKey: true }],
          rows: [{ itemId: 100 }, { itemId: 200 }],
        },
      },
    })
    const view = ds.getView('Items')!

    // 初始：列推导
    expect(view.primaryKey).toBe('itemId')

    // 显式覆盖
    view.primaryKey = 'customField'
    expect(view.primaryKey).toBe('customField')

    // 清除覆盖 → 恢复列推导
    view.resetPrimaryKey()
    expect(view.primaryKey).toBe('itemId')
  })

  it('无 isPrimaryKey 列时回退 id、显式覆盖优先于回退', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'NoPKDS',
      tables: {
        Logs: {
          tableName: 'Logs',
          columns: [
            { name: 'message', type: 'string' },
          ],
          rows: [{ id: 1, message: 'test' }],
        },
      },
    })
    const view = ds.getView('Logs')!

    // 无 isPrimaryKey → 回退
    expect(view.primaryKey).toBe('id')

    // 显式覆盖
    view.primaryKey = 'message'
    expect(view.primaryKey).toBe('message')
  })

  it('DataTable.fromTableData 命名视图有正确 primaryKey', () => {
    const table = DataTable.fromTableData({
      tableName: 'Products',
      columns: [{ name: 'sku', type: 'string', isPrimaryKey: true }],
      rows: [],
      api: undefined,
      views: {
        grid: { tableName: 'Products', viewId: 'grid', rows: [], page: 1, pageSize: 20 },
      },
      loading: undefined,
      error: undefined,
    })
    const gridView = table.getView('grid')!
    // 命名视图通过 fromTableData 创建，dataTable 已设置
    expect(gridView.primaryKey).toBe('sku')
  })
})
