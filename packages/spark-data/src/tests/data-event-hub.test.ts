/**
 * 能力体系通信测试（DataView 事件 + subscribe 模式）
 *
 * 覆盖：
 * - DataView.events.on('stateChanged') 状态监听
 * - DataView.setCurrentRow / setSelectedRows / clearAll 触发状态变更
 * - events.on / events.off 事件订阅
 * - TreeManager 缓存操作（无事件）
 *
 * 【设计原则】DataView 是与 UI 交互的唯一通道。
 * 所有 UI 状态操作（setCurrentRow, setSelectedRows, clearAll）
 * 必须通过 DataView，不通过 DataTable。
 * 状态监听直接订阅 DataView.events，不经过 DataSet。
 */

import { describe, it, expect, vi } from 'vitest'
import { SparkData, DataTable } from '@spark-view/spark-data'
import type { ViewStateEvent } from '@spark-view/spark-data'


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

// ==================== DataView.events stateChanged 测试 ====================

describe('DataView.events.on stateChanged（视图状态监听）', () => {
  it('setCurrentRow 触发 currentRow 状态变更', () => {
    const ds = createTestDataSet()
    const handler = vi.fn<(evt: ViewStateEvent) => void>()

    const deptView = ds.getView('Departments')!
    deptView.events.on('stateChanged', handler)
    deptView.setCurrentRow(deptView.rows[0]!)

    // selectionFollowsCurrent=true（默认）→ setCurrentRow 触发 currentRow + selectedRows 共 2 事件
    expect(handler).toHaveBeenCalledTimes(2)
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: 'Departments',
        viewId: 'default',
        changeType: 'currentRow',
        row: deptView.rows[0]
      })
    )
  })

  it('setCurrentRow(null) 触发 currentRow 状态变更', () => {
    const ds = createTestDataSet()
    const deptView = ds.getView('Departments')!
    deptView.setCurrentRow(deptView.rows[0]!)

    const handler = vi.fn<(evt: ViewStateEvent) => void>()
    deptView.events.on('stateChanged', handler)
    deptView.setCurrentRow(null)

    expect(handler).toHaveBeenCalled()
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ changeType: 'currentRow', row: null })
    )
  })

  it('setSelectedRows 触发 selectedRows 状态变更', () => {
    const ds = createTestDataSet()
    const handler = vi.fn<(evt: ViewStateEvent) => void>()

    const deptView = ds.getView('Departments')!
    deptView.events.on('stateChanged', handler)
    deptView.setSelectedRows([deptView.rows[0]!, deptView.rows[1]!])

    expect(handler).toHaveBeenCalled()
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: 'Departments',
        viewId: 'default',
        changeType: 'selectedRows'
      })
    )
  })

  it('clearAll 触发 cleared 状态变更', () => {
    const ds = createTestDataSet()
    const deptView = ds.getView('Departments')!
    deptView.setCurrentRow(deptView.rows[0]!)

    const handler = vi.fn<(evt: ViewStateEvent) => void>()
    deptView.events.on('stateChanged', handler)
    deptView.clearAll()

    expect(handler).toHaveBeenCalled()
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: 'Departments',
        viewId: 'default',
        changeType: 'cleared'
      })
    )
  })

  it('setCurrentRow 同一行重复设置不触发状态变更（去重）', () => {
    const ds = createTestDataSet()
    const handler = vi.fn()

    const deptView = ds.getView('Departments')!
    deptView.events.on('stateChanged', handler)

    const row = deptView.rows[0]!
    deptView.setCurrentRow(row)
    const countAfterFirst = handler.mock.calls.length
    deptView.setCurrentRow(row) // 同一引用

    // 第二次调用应被幂等去重，不增加调用次数
    expect(handler).toHaveBeenCalledTimes(countAfterFirst)
  })

  it('setSelectedRows 同样内容重复设置不触发状态变更（去重）', () => {
    const ds = createTestDataSet()
    const handler = vi.fn()

    const deptView = ds.getView('Departments')!
    deptView.events.on('stateChanged', handler)

    const rows = [deptView.rows[0]!, deptView.rows[1]!]
    deptView.setSelectedRows(rows)
    const countAfterFirst = handler.mock.calls.length
    deptView.setSelectedRows(rows) // 内容相同

    // 第二次调用应被去重，不增加调用次数
    expect(handler.mock.calls.length).toBe(countAfterFirst)
  })

  it('每次视图状态变化都触发 stateChanged', () => {
    const ds = createTestDataSet()
    const handler = vi.fn()

    const deptView = ds.getView('Departments')!
    deptView.events.on('stateChanged', handler)

    // selectionFollowsCurrent=true → setCurrentRow 触发 currentRow + selectedRows (2)
    // setSelectedRows 触发 selectedRows (1)
    deptView.setCurrentRow(deptView.rows[0]!)
    deptView.setSelectedRows([deptView.rows[1]!])

    expect(handler).toHaveBeenCalledTimes(3)
  })

  it('events.off 取消监听', () => {
    const ds = createTestDataSet()
    const handler = vi.fn()

    const deptView = ds.getView('Departments')!
    deptView.events.on('stateChanged', handler)

    // selectionFollowsCurrent=true → 2 事件 (currentRow + selectedRows)
    deptView.setCurrentRow(deptView.rows[0]!)
    const countBeforeOff = handler.mock.calls.length
    expect(countBeforeOff).toBeGreaterThan(0)

    deptView.events.off('stateChanged', handler)
    deptView.setCurrentRow(deptView.rows[1]!)
    expect(handler).toHaveBeenCalledTimes(countBeforeOff) // 取消后不再增加
  })
})

// ==================== events.on / events.off 测试 ====================

describe('DataView events.on stateChanged（事件订阅）', () => {
  it('events.off 取消监听', () => {
    const ds = createTestDataSet()
    const cb = vi.fn()

    const deptView = ds.getView('Departments')!
    deptView.events.on('stateChanged', cb)
    deptView.setCurrentRow(deptView.rows[0]!)
    const countBeforeOff = cb.mock.calls.length
    expect(countBeforeOff).toBeGreaterThan(0)

    deptView.events.off('stateChanged', cb)
    deptView.setCurrentRow(deptView.rows[1]!)
    expect(cb).toHaveBeenCalledTimes(countBeforeOff) // 取消后不再增加
  })

  it('setCurrentRow 自动触发 stateChanged 回调', () => {
    const ds = createTestDataSet()
    const cb = vi.fn()
    const deptView = ds.getView('Departments')!
    deptView.events.on('stateChanged', cb)

    deptView.setCurrentRow(deptView.rows[0]!)

    // selectionFollowsCurrent=true → 触发 currentRow + selectedRows
    expect(cb).toHaveBeenCalledTimes(2)
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ changeType: 'currentRow' }))
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ changeType: 'selectedRows' }))
  })
})

// ==================== 能力流端到端测试 ====================

describe('能力流端到端', () => {
  it('setCurrentRow 触发完整能力流：级联 → 通知 → 状态事件', () => {
    const ds = createTestDataSet()
    const events: string[] = []

    const deptView = ds.getView('Departments')!

    // 直接订阅视图的 stateChanged 事件（DataView 是状态变更的归属者）
    deptView.events.on('stateChanged', (...args: unknown[]) => {
      const event = args[0] as ViewStateEvent
      events.push(`stateChange:${event.changeType}`)
    })
    // 第二个监听器也应收到同一事件
    deptView.events.on('stateChanged', () => events.push('listener2:Departments.default'))

    deptView.setCurrentRow(deptView.rows[0]!)

    // 验证能力流：两个监听器都被触发
    expect(events).toContain('listener2:Departments.default')
    expect(events).toContain('stateChange:currentRow')
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
    // getPrimaryKeyValue 使用推导后的主键
    expect(view.getPrimaryKeyValue(view.rows[0]!)).toBe(100)
    expect(view.getPrimaryKeyValue(view.rows[1]!)).toBe(200)
  })

  it('复合主键：多列 isPrimaryKey=true 时 primaryKey 返回数组', () => {
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
    expect(view.primaryKey).toEqual(['orderId', 'productId'])
    // 复合主键值：连接字符串
    expect(view.getPrimaryKeyValue(view.rows[0]!)).toBe('1:10')
    expect(view.getPrimaryKeyValue(view.rows[1]!)).toBe('1:20')
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
    expect(view.getPrimaryKeyValue(view.rows[0]!)).toBe('abc-123')
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

    view.setCurrentRow(view.rows[1]!) // Bob
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
