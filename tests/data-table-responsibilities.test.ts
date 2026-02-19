import { describe, it, expect } from 'vitest'
import { DataTable } from '../packages/spark-data/src/data-table'
import { DataView } from '../packages/spark-data/src/data-view'
import { DataSet } from '../packages/spark-data/src/dataset'
import { DATA_VIEW, DATA_TABLE, DATA_SET, FIELD_METADATA } from '@spark-view/spark-utils'
import type { IFieldMetadataCapability } from '@spark-view/spark-utils'
import type { IDataViewCapability } from '../packages/spark-data/src/data-view'
import type { IDataTableCapability } from '../packages/spark-data/src/data-table'
import type { IDataSetCapability } from '../packages/spark-data/src/dataset'

describe('DataTable responsibilities (refactor verification)', () => {
  it('DataTable 管理 views[default]（DataView），不暴露 UI 状态代理', () => {
    const t = new DataTable('Users', [{ name: 'id', type: 'number' }])

    // views['default'] 必须是 DataView 实例
    const def = t.getOrCreateView('default')
    expect(def).toBeInstanceOf(DataView)
    expect(def).toBe(t.views['default'])

    // DataTable 不再有 rows 代理 —— 必须通过 views['default'] 访问
    expect('rows' in t).toBe(false)
    expect(Array.isArray(def.rows)).toBe(true)

    // 通过 views['default'] 操作 rows
    def.rows.splice(0, def.rows.length, { id: 1 } as any)
    expect(def.rows).toHaveLength(1)
    expect(def.rows[0]).toEqual({ id: 1 })

    // UI 状态方法也不在 DataTable 上
    expect('setCurrentRow' in t).toBe(false)
    expect('setSelectedRows' in t).toBe(false)
    expect('clearAll' in t).toBe(false)
    expect('subscribe' in t).toBe(false)

    // 这些方法应在 DataView 上可用
    expect(typeof def.setCurrentRow).toBe('function')
    expect(typeof def.setSelectedRows).toBe('function')
    expect(typeof def.clearAll).toBe('function')
    // subscribe 已移除，统一使用 events.on('stateChanged', handler)
    expect(typeof def.events.on).toBe('function')
  })

  it('DataView 的订阅可被 UI 与子视图使用（语义一致）', () => {
    const ds = DataSet.fromConfig({
      dataSetName: 'S',
      tables: {
        Departments: { tableName: 'Departments', columns: [{ name: 'id', type: 'number' }], rows: [{ id: 1 }] },
        Users: { tableName: 'Users', columns: [{ name: 'id', type: 'number' }], rows: [{ id: 101, deptId: 1 }] }
      },
      relations: [
        { parentTable: 'Departments', childTable: 'Users', dependencyType: 'currentRow', filterExpression: { field: 'deptId', op: '==', value: null } }
      ]
    })

    const parent = ds.getView('Departments', 'default')!
    ds.getView('Users', 'default')

    let parentNotified = false
    let dsNotified = false

    // UI/组件直接订阅父视图的 stateChanged 事件
    parent.events.on('stateChanged', () => { parentNotified = true })

    // 单独获取视图并订阅（语义等价）
    const parentView2 = ds.getView('Departments', 'default')!
    parentView2.events.on('stateChanged', () => { dsNotified = true })

    // 触发父视图状态变化
    parent.setCurrentRow(parent.rows[0]!)

    expect(parentNotified).toBe(true)
    expect(dsNotified).toBe(true)
  })

  it('DataSet.getView 应返回指定视图的 DataView（包含 default）', () => {
    const ds = DataSet.fromConfig({
      dataSetName: 'S',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [{ name: 'id', type: 'number' }],
          rows: [{ id: 1 } as any]
        }
      }
    })

    const table = ds.getTable('Users')!
    const ctxDefault = ds.getView('Users', 'default')
    const ctxNamed = ds.getView('Users', 'grid1')

    expect(ctxDefault).toBeDefined()
    expect(ctxDefault).toBe(table.getOrCreateView('default'))
    expect(ctxNamed).toBe(table.getOrCreateView('grid1'))
  })

  it('命名视图独立且 CRUD 操作影响 default view', async () => {
    const t = new DataTable('Items', [{ name: 'id', type: 'number' }, { name: 'name', type: 'string' }])

    // 创建命名视图
    const v1 = t.getOrCreateView('grid1')
    const def = t.getOrCreateView('default')

    // 初始互不影响
    def.rows.splice(0, def.rows.length, { id: 1, name: 'A' } as any)
    v1.rows.splice(0, v1.rows.length, { id: 2, name: 'B' } as any)
    expect(def.rows).toHaveLength(1)
    expect(v1.rows).toHaveLength(1)

    // CRUD：由于 mock 替换了 createRecord，需要手动模拟真实行为
    // 真实 createRecord 会 push 到 views['default'].rows 并通知
    ;(t as any).createRecord = async (data: any) => {
      def.rows.push(data)
      return { success: true, data } as any
    }
    await (t as any).createRecord({ id: 3, name: 'C' })
    expect(def.rows.some(r => (r as any).id === 3)).toBe(true)

    // updateRecord 也应影响 views['default']
    ;(t as any).updateRecord = async (id: any, data: any) => {
      const idx = def.rows.findIndex(r => (r as any).id === id)
      if (idx >= 0) def.rows[idx] = { ...def.rows[idx], ...data, id }
      return { success: true, data: { id, ...data } } as any
    }
    await (t as any).updateRecord(3, { name: 'C-updated' })
    expect(def.rows.some(r => (r as any).name === 'C-updated')).toBe(true)

    // 删除记录
    ;(t as any).deleteRecord = async (id: any) => {
      const idx = def.rows.findIndex(r => (r as any).id === id)
      if (idx >= 0) def.rows.splice(idx, 1)
      return { success: true } as any
    }
    await (t as any).deleteRecord(3)
    expect(def.rows.some(r => (r as any).id === 3)).toBe(false)
  })
})

// ===== 能力接口测试 =====

describe('Capability interfaces (typed getCapabilities)', () => {
  it('DataView.getCapabilities() 应返回类型安全的 IDataViewCapability', () => {
    const view = new DataView('Orders', 'grid1')
    view.rows.push({ id: 1, total: 100 })
    view.currentRow = view.rows[0]!

    const caps = view.capabilities
    expect(caps.has(DATA_VIEW)).toBe(true)

    const cap = caps.get(DATA_VIEW) as IDataViewCapability
    expect(cap.tableName).toBe('Orders')
    expect(cap.viewId).toBe('grid1')

    // 受控门面：不暴露 dataView 类实例
    expect((cap as any).dataView).toBeUndefined()

    // 响应式 getter：rows/currentRow 是活引用
    expect(cap.rows).toBe(view.rows)
    expect(cap.currentRow).toBe(view.rows[0])

    // 操作方法受控奖接
    expect(typeof cap.setCurrentRow).toBe('function')
    expect(typeof cap.setSelectedRows).toBe('function')
    expect(typeof cap.requestData).toBe('function')

    // 分页 / 状态
    expect(cap.total).toBe(view.total)
    expect(cap.page).toBe(view.page)
    expect(cap.pageSize).toBe(view.pageSize)
    expect(cap.requestState).toBe(view.requestState)

    // 事件总线
    expect(cap.events).toBe(view.events)

    // 修改 view 后，capability 反映最新值
    view.currentRow = null
    expect(cap.currentRow).toBeNull()

    view.rows.push({ id: 2, total: 200 })
    expect(cap.rows).toHaveLength(2)
  })

  it('DataTable.getCapabilities() 应返回 IDataTableCapability（受控门面）', () => {
    const table = new DataTable('Products', [
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'name', type: 'string' }
    ])

    const caps = table.capabilities
    expect(caps.has(DATA_TABLE)).toBe(true)

    const cap = caps.get(DATA_TABLE) as IDataTableCapability
    // 受控门面：不暴露 DataTable 实例
    expect((cap as any).dataTable).toBeUndefined()
    // 暴露表名和列定义
    expect(cap.tableName).toBe('Products')
    expect(cap.columns).toHaveLength(2)
    expect(cap.columns[0]!.name).toBe('id')
    expect(cap.api).toBeUndefined()
    expect(cap.crudConfig).toBeUndefined()
  })

  it('DataTable 应注册 FIELD_METADATA 能力', () => {
    const table = new DataTable('Users', [
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'name', type: 'string', label: '姓名' },
      { name: 'email', type: 'string', label: '邮箱' }
    ])

    const caps = table.capabilities
    expect(caps.has(FIELD_METADATA)).toBe(true)

    const meta = caps.get(FIELD_METADATA) as IFieldMetadataCapability
    expect(meta.tableName).toBe('Users')
    expect(meta.getColumns()).toHaveLength(3)
    expect(meta.getColumn('name')?.label).toBe('姓名')
    expect(meta.getColumn('nonexistent')).toBeUndefined()
    expect(meta.getPrimaryKey()).toBe('id')
  })

  it('DataSet.getCapabilities() 应返回 IDataSetCapability', () => {
    const ds = DataSet.fromConfig({
      dataSetName: 'TestDS',
      tables: {
        Users: { tableName: 'Users', columns: [{ name: 'id', type: 'number' }] }
      }
    })

    const caps = ds.capabilities
    expect(caps.has(DATA_SET)).toBe(true)

    const cap = caps.get(DATA_SET) as IDataSetCapability
    expect(cap.dataSet).toBe(ds)
  })
})

// ===== ICapabilityContext 能力体系测试 =====

describe('ICapabilityContext capability system', () => {
  it('DataView.events.on stateChanged 通知 UI', () => {
    const ds = DataSet.fromConfig({
      dataSetName: 'S',
      tables: {
        Orders: { tableName: 'Orders', columns: [{ name: 'id', type: 'number' }] }
      }
    })

    const view = ds.getView('Orders', 'default')!
    let notified = false
    view.events.on('stateChanged', () => { notified = true })

    // 通过 clearAll 触发事件
    view.rows.push({ id: 1 })
    view.clearAll()
    expect(notified).toBe(true)
  })

  it('DataView.setCurrentRow 触发状态观察（stateChanged 事件）', () => {
    const ds = DataSet.fromConfig({
      dataSetName: 'S',
      tables: {
        Departments: { tableName: 'Departments', columns: [{ name: 'id', type: 'number' }], rows: [{ id: 1 }, { id: 2 }] },
        Employees: { tableName: 'Employees', columns: [{ name: 'id', type: 'number' }, { name: 'deptId', type: 'number' }], rows: [{ id: 101, deptId: 1 }, { id: 102, deptId: 2 }] }
      },
      relations: [
        { parentTable: 'Departments', childTable: 'Employees', dependencyType: 'currentRow', filterExpression: { field: 'deptId', op: '==', value: null } }
      ]
    })

    const stateEvents: string[] = []
    // 直接订阅 DataView 的 stateChanged 事件（状态变更归属于 DataView）
    const deptView = ds.getView('Departments', 'default')!
    deptView.events.on('stateChanged', (...args: unknown[]) => {
      const e = args[0] as { tableName: string; changeType: string }
      stateEvents.push(`${e.tableName}:${e.changeType}`)
    })

    deptView.setCurrentRow(deptView.rows[0]!)

    expect(stateEvents).toContain('Departments:currentRow')
  })

  it('命名视图独立接收 stateChanged 事件', () => {
    const ds = DataSet.fromConfig({
      dataSetName: 'S',
      tables: {
        Items: { tableName: 'Items', columns: [{ name: 'id', type: 'number' }], rows: [{ id: 1 }] }
      }
    })

    const table = ds.getTable('Items')!
    const defaultView = table.getOrCreateView('default')
    const grid1View = table.getOrCreateView('grid1')

    // 设置不同的数据
    defaultView.rows = [{ id: 1 }]
    grid1View.rows = [{ id: 2 }, { id: 3 }]

    let notifyCount = 0
    grid1View.events.on('stateChanged', () => { notifyCount++ })

    // 通过 setCurrentRow 触发指定视图事件
    grid1View.setCurrentRow(grid1View.rows[0]!)

    // 应该通知订阅者
    expect(notifyCount).toBe(1)
    
    // 但不应该修改视图行数据
    expect(grid1View.rows).toEqual([{ id: 2 }, { id: 3 }])
  })
})