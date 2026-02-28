/**
 * 计算列深度测试 — 纯配置驱动
 *
 * 所有计算列均通过 DataColumn.computeExpression 列配置声明，
 * 不使用 setComputedColumn / setComputedColumnExpression 硬编码方式。
 *
 * 覆盖范围：
 * 1. 基础表达式（算术、字符串拼接、三元条件）
 * 2. 链式计算列（后序列引用前序列结果）
 * 3. ctx 上下文（setComputedContext 驱动动态重编译）
 * 4. 动态行操作自动重算（appendRow / updateRowById / replaceRows / editRowById / updateFromServer）
 * 5. 聚合函数 — DataSet 关联（$sum / $count / $avg / $min / $max / $list / $join）
 * 6. 混合表达式（算术 + 聚合 + ctx 组合）
 * 7. 聚合 — 动态行编辑后重触发正确性
 * 8. stripComputedColumns — CRUD 提交前剥离
 * 9. 运行时错误降级为 undefined
 * 10. 边界条件（空子行、0/null 字段、编译失败容错、computedColumnNames、removeComputedColumn）
 */

import { describe, it, expect, vi } from 'vitest'
import { DataTable, DataSet } from '@spark-view/spark-data'
import type { IDataRow } from '@spark-view/spark-data'

// ─────────────────────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────────────────────

/** 创建绑定 DataTable 的 DataView，列配置驱动 */
function makeView(
  columns: Array<{ name: string; type?: string; isPrimaryKey?: boolean; computeExpression?: string }>,
  rows: IDataRow[] = [],
) {
  const table = new DataTable('T', columns.map(c => {
    const col: { name: string; type: string; isPrimaryKey?: boolean; computeExpression?: string } = {
      name: c.name,
      type: c.type ?? 'string',
    }
    if (c.isPrimaryKey !== undefined) col.isPrimaryKey = c.isPrimaryKey
    if (c.computeExpression !== undefined) col.computeExpression = c.computeExpression
    return col
  }))
  const view = table.getOrCreateView('default')
  view.rows.splice(0, view.rows.length, ...rows)
  return view
}

/** 读取行字段（绕过索引签名 noPropertyAccessFromIndexSignature） */
const f = (row: IDataRow | undefined, field: string): unknown => row?.[field]

// ─────────────────────────────────────────────────────────────────────────────
// 1. 基础表达式
// ─────────────────────────────────────────────────────────────────────────────
describe('列配置 — 基础表达式', () => {
  it('算术：price * qty', () => {
    const view = makeView(
      [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'price', type: 'number' },
        { name: 'qty', type: 'number' },
        { name: 'total', type: 'number', computeExpression: 'price * qty' },
      ],
      [{ id: 1, price: 10, qty: 3 }, { id: 2, price: 5.5, qty: 2 }],
    )
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'total')).toBe(30)
    expect(f(view.rows[1], 'total')).toBe(11)
  })

  it('字符串拼接：firstName + lastName', () => {
    const view = makeView(
      [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'firstName', type: 'string' },
        { name: 'lastName', type: 'string' },
        { name: 'fullName', type: 'string', computeExpression: "firstName + ' ' + lastName" },
      ],
      [{ id: 1, firstName: '张', lastName: '三' }],
    )
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'fullName')).toBe('张 三')
  })

  it('三元条件：score >= 60', () => {
    const view = makeView(
      [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'score', type: 'number' },
        { name: 'result', type: 'string', computeExpression: "score >= 60 ? '及格' : '不及格'" },
      ],
      [{ id: 1, score: 80 }, { id: 2, score: 50 }],
    )
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'result')).toBe('及格')
    expect(f(view.rows[1], 'result')).toBe('不及格')
  })

  it('字段值为 0 / null 时表达式正常处理', () => {
    const view = makeView(
      [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'price', type: 'number' },
        { name: 'qty', type: 'number' },
        { name: 'total', type: 'number', computeExpression: 'price * qty' },
      ],
      [
        { id: 1, price: 0, qty: 99 },
        { id: 2, price: null, qty: 3 },
      ],
    )
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'total')).toBe(0)
    expect(f(view.rows[1], 'total')).toBe(0)  // null * 3 = 0（JS 强转）
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. 链式计算列
// ─────────────────────────────────────────────────────────────────────────────
describe('列配置 — 链式计算列', () => {
  it('前序列 subtotal 被后序列 tax 引用', () => {
    const view = makeView(
      [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'price', type: 'number' },
        { name: 'qty', type: 'number' },
        { name: 'subtotal', type: 'number', computeExpression: 'price * qty' },
        { name: 'tax', type: 'number', computeExpression: 'subtotal * 0.1' },
      ],
      [{ id: 1, price: 100, qty: 2 }],
    )
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'subtotal')).toBe(200)
    expect(f(view.rows[0], 'tax') as number).toBeCloseTo(20)
  })

  it('三级链：price*qty → subtotal → tax → grandTotal', () => {
    const view = makeView(
      [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'price', type: 'number' },
        { name: 'qty', type: 'number' },
        { name: 'subtotal', type: 'number', computeExpression: 'price * qty' },
        { name: 'tax', type: 'number', computeExpression: 'subtotal * 0.08' },
        { name: 'grandTotal', type: 'number', computeExpression: 'subtotal + tax' },
      ],
      [{ id: 1, price: 100, qty: 5 }],
    )
    view.initComputedColumnsFromConfig()
    // subtotal=500, tax=40, grandTotal=540
    expect(f(view.rows[0], 'subtotal')).toBe(500)
    expect(f(view.rows[0], 'tax') as number).toBeCloseTo(40)
    expect(f(view.rows[0], 'grandTotal') as number).toBeCloseTo(540)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. ctx 上下文 — setComputedContext 动态切换
// ─────────────────────────────────────────────────────────────────────────────
describe('列配置 — ctx 上下文', () => {
  it('ctx.taxRate 驱动税率计算', () => {
    const view = makeView(
      [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'amount', type: 'number' },
        { name: 'tax', type: 'number', computeExpression: 'amount * ctx.taxRate' },
      ],
      [{ id: 1, amount: 1000 }],
    )
    view.setComputedContext({ taxRate: 0.1 })
    expect(f(view.rows[0], 'tax') as number).toBeCloseTo(100)
  })

  it('setComputedContext 切换后自动重编译、全量重算', () => {
    const table = new DataTable('Sales', [
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'amount', type: 'number' },
      { name: 'tax', type: 'number', computeExpression: 'amount * ctx.taxRate' },
    ])
    const view = table.getOrCreateView('default')
    view.rows.splice(0, 0, { id: 1, amount: 500 })

    view.setComputedContext({ taxRate: 0.05 })
    expect(f(view.rows[0], 'tax') as number).toBeCloseTo(25)

    // 切换税率 → 自动重编译 + 全量重算
    view.setComputedContext({ taxRate: 0.15 })
    expect(f(view.rows[0], 'tax') as number).toBeCloseTo(75)
  })

  it('ctx 多字段：discount + taxRate 联合计算', () => {
    const view = makeView(
      [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'amount', type: 'number' },
        { name: 'final', type: 'number', computeExpression: 'amount * (1 - ctx.discount) * (1 + ctx.taxRate)' },
      ],
      [{ id: 1, amount: 1000 }],
    )
    view.setComputedContext({ discount: 0.2, taxRate: 0.08 })
    // 1000 * 0.8 * 1.08 = 864
    expect(f(view.rows[0], 'final') as number).toBeCloseTo(864)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. 动态行操作自动重算
// ─────────────────────────────────────────────────────────────────────────────
describe('列配置 — 动态行操作自动重算', () => {
  /** 通用订单 View 配置：id, price, qty → total */
  function makeOrderView(rows: IDataRow[] = []) {
    return makeView(
      [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'price', type: 'number' },
        { name: 'qty', type: 'number' },
        { name: 'total', type: 'number', computeExpression: 'price * qty' },
      ],
      rows,
    )
  }

  it('initComputedColumnsFromConfig — 初始行求值', () => {
    const view = makeOrderView([{ id: 1, price: 8, qty: 5 }])
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'total')).toBe(40)
  })

  it('appendRow — 新行自动带计算列值', () => {
    const view = makeOrderView([{ id: 1, price: 10, qty: 2 }])
    view.initComputedColumnsFromConfig()

    view.appendRow({ id: 2, price: 7, qty: 3 })
    expect(f(view.rows[1], 'total')).toBe(21)
  })

  it('updateRowById — 源字段变更后计算列自动重算', () => {
    const view = makeOrderView([{ id: 1, price: 10, qty: 3 }])
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'total')).toBe(30)

    view.updateRowById(1, { price: 20 })
    expect(f(view.rows[0], 'total')).toBe(60)

    view.updateRowById(1, { qty: 1 })
    expect(f(view.rows[0], 'total')).toBe(20)
  })

  it('replaceRows — 全量替换后所有行自动重算', () => {
    const view = makeView([
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'v', type: 'number' },
      { name: 'sq', type: 'number', computeExpression: 'v * v' },
    ])
    view.replaceRows([{ id: 1, v: 3 }, { id: 2, v: 4 }, { id: 3, v: 5 }])
    expect(view.rows.map(r => r['sq'])).toEqual([9, 16, 25])
  })

  it('editRowById — 编辑后计算列动态重算', async () => {
    const view = makeOrderView([{ id: 1, price: 5, qty: 4 }])
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'total')).toBe(20)

    await view.editRowById(1, { price: 10 })
    expect(f(view.rows[0], 'total')).toBe(40)
  })

  it('updateFromServer — 服务端响应后自动重算', () => {
    const view = makeView([
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'n', type: 'number' },
      { name: 'half', type: 'number', computeExpression: 'n / 2' },
    ])
    view.updateFromServer({ rows: [{ id: 1, n: 10 }, { id: 2, n: 20 }] })
    expect(f(view.rows[0], 'half')).toBe(5)
    expect(f(view.rows[1], 'half')).toBe(10)
  })

  it('多次连续 updateRowById — 每次都反映最新值', () => {
    const view = makeOrderView([{ id: 1, price: 10, qty: 2 }])
    view.initComputedColumnsFromConfig()

    view.updateRowById(1, { price: 20 })
    expect(f(view.rows[0], 'total')).toBe(40)

    view.updateRowById(1, { qty: 5 })
    expect(f(view.rows[0], 'total')).toBe(100)

    view.updateRowById(1, { price: 1, qty: 1 })
    expect(f(view.rows[0], 'total')).toBe(1)
  })

  it('initComputedColumnsFromConfig 可手动重触发求值', () => {
    const view = makeOrderView([{ id: 1, price: 8, qty: 5 }])
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'total')).toBe(40)

    // 直接修改行字段（绕过 API），手动重触发
    view.rows[0]!['price'] = 10
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'total')).toBe(50)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. 聚合函数 — DataSet 关联
// ─────────────────────────────────────────────────────────────────────────────
describe('列配置 — 聚合函数', () => {
  /** 标准订单-明细 DataSet 配置 */
  function makeOrdersDS() {
    return DataSet.fromConfig({
      dataSetName: 'Shop',
      tables: {
        Orders: {
          tableName: 'Orders',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'totalAmount', type: 'number', computeExpression: "$sum('Items', 'amount')" },
            { name: 'itemCount',   type: 'number', computeExpression: "$count('Items')" },
            { name: 'avgAmount',   type: 'number', computeExpression: "$avg('Items', 'amount')" },
            { name: 'minAmount',   type: 'number', computeExpression: "$min('Items', 'amount')" },
            { name: 'maxAmount',   type: 'number', computeExpression: "$max('Items', 'amount')" },
            { name: 'nameList',    type: 'string', computeExpression: "$join('Items', 'name')" },
            { name: 'names',       type: 'string', computeExpression: "$list('Items', 'name')" },
          ],
          rows: [
            { id: 1 },
            { id: 2 },
          ],
        },
        Items: {
          tableName: 'Items',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'orderId', type: 'number' },
            { name: 'name', type: 'string' },
            { name: 'amount', type: 'number' },
          ],
          rows: [
            { id: 101, orderId: 1, name: 'A', amount: 100 },
            { id: 102, orderId: 1, name: 'B', amount: 200 },
            { id: 103, orderId: 1, name: 'C', amount: 50 },
            { id: 104, orderId: 2, name: 'X', amount: 80 },
          ],
        },
      },
      relations: [{
        parentTable: 'Orders',
        childTable: 'Items',
        childField: 'orderId',
        dependencyType: 'currentRow',
      }],
    })
  }

  it('$sum — 累计子行字段', () => {
    const ds = makeOrdersDS()
    const view = ds.getView('Orders', 'default')!
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'totalAmount')).toBe(350)
    expect(f(view.rows[1], 'totalAmount')).toBe(80)
  })

  it('$count — 子行数量', () => {
    const ds = makeOrdersDS()
    const view = ds.getView('Orders', 'default')!
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'itemCount')).toBe(3)
    expect(f(view.rows[1], 'itemCount')).toBe(1)
  })

  it('$avg — 子行均值', () => {
    const ds = makeOrdersDS()
    const view = ds.getView('Orders', 'default')!
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'avgAmount') as number).toBeCloseTo(116.67, 1)
  })

  it('$min / $max — 子行极值', () => {
    const ds = makeOrdersDS()
    const view = ds.getView('Orders', 'default')!
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'minAmount')).toBe(50)
    expect(f(view.rows[0], 'maxAmount')).toBe(200)
  })

  it('$list — 返回子行字段数组', () => {
    const ds = makeOrdersDS()
    const view = ds.getView('Orders', 'default')!
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'names')).toEqual(['A', 'B', 'C'])
    expect(f(view.rows[1], 'names')).toEqual(['X'])
  })

  it('$join — 子行字段连接字符串（默认分隔符）', () => {
    const ds = makeOrdersDS()
    const view = ds.getView('Orders', 'default')!
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'nameList')).toBe('A, B, C')
  })

  it('$join — 自定义分隔符', () => {
    const ds = DataSet.fromConfig({
      dataSetName: 'DS',
      tables: {
        P: {
          tableName: 'P',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'tags', type: 'string', computeExpression: "$join('C', 'tag', ' | ')" },
          ],
          rows: [{ id: 1 }],
        },
        C: {
          tableName: 'C',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'parentId', type: 'number' },
            { name: 'tag', type: 'string' },
          ],
          rows: [
            { id: 1, parentId: 1, tag: 'foo' },
            { id: 2, parentId: 1, tag: 'bar' },
          ],
        },
      },
      relations: [{
        parentTable: 'P',
        childTable: 'C',
        childField: 'parentId',
        dependencyType: 'currentRow',
      }],
    })
    ds.getView('P', 'default')!.initComputedColumnsFromConfig()
    expect(f(ds.getView('P', 'default')!.rows[0], 'tags')).toBe('foo | bar')
  })

  it('子行为空时聚合边界值正确', () => {
    const ds = DataSet.fromConfig({
      dataSetName: 'EmptyDS',
      tables: {
        P: {
          tableName: 'P',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'total', type: 'number', computeExpression: "$sum('C', 'v')" },
            { name: 'cnt',   type: 'number', computeExpression: "$count('C')" },
            { name: 'avg',   type: 'number', computeExpression: "$avg('C', 'v')" },
            { name: 'mn',    type: 'number', computeExpression: "$min('C', 'v')" },
            { name: 'mx',    type: 'number', computeExpression: "$max('C', 'v')" },
            { name: 'lst',   type: 'string', computeExpression: "$list('C', 'v')" },
            { name: 'jn',    type: 'string', computeExpression: "$join('C', 'v')" },
          ],
          rows: [{ id: 1 }],
        },
        C: {
          tableName: 'C',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'parentId', type: 'number' },
            { name: 'v', type: 'number' },
          ],
          rows: [],
        },
      },
      relations: [{
        parentTable: 'P',
        childTable: 'C',
        childField: 'parentId',
        dependencyType: 'currentRow',
      }],
    })
    const view = ds.getView('P', 'default')!
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'total')).toBe(0)
    expect(f(view.rows[0], 'cnt')).toBe(0)
    expect(f(view.rows[0], 'avg')).toBe(0)
    expect(f(view.rows[0], 'mn')).toBeUndefined()
    expect(f(view.rows[0], 'mx')).toBeUndefined()
    expect(f(view.rows[0], 'lst')).toEqual([])
    expect(f(view.rows[0], 'jn')).toBe('')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. 混合表达式 — 算术 + 聚合 + ctx 组合
// ─────────────────────────────────────────────────────────────────────────────
describe('列配置 — 混合表达式', () => {
  /** 构建含子表的 DataSet */
  function makeMixedDS(
    parentColumns: Array<{ name: string; type: string; isPrimaryKey?: boolean; computeExpression?: string }>,
  ) {
    return DataSet.fromConfig({
      dataSetName: 'Mixed',
      tables: {
        Orders: {
          tableName: 'Orders',
          columns: parentColumns,
          rows: [{ id: 1 }, { id: 2 }],
        },
        Items: {
          tableName: 'Items',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'orderId', type: 'number' },
            { name: 'amount', type: 'number' },
            { name: 'name', type: 'string' },
          ],
          rows: [
            { id: 1, orderId: 1, amount: 100, name: 'A' },
            { id: 2, orderId: 1, amount: 200, name: 'B' },
            { id: 3, orderId: 2, amount: 50,  name: 'C' },
          ],
        },
      },
      relations: [{
        parentTable: 'Orders',
        childTable: 'Items',
        childField: 'orderId',
        dependencyType: 'currentRow',
      }],
    })
  }

  it('聚合 + 算术：$sum * 1.08（含税总额）', () => {
    const ds = makeMixedDS([
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'taxTotal', type: 'number', computeExpression: "$sum('Items', 'amount') * 1.08" },
    ])
    const view = ds.getView('Orders', 'default')!
    view.initComputedColumnsFromConfig()
    // order 1: (100+200) * 1.08 = 324
    expect(f(view.rows[0], 'taxTotal') as number).toBeCloseTo(324)
    // order 2: 50 * 1.08 = 54
    expect(f(view.rows[1], 'taxTotal') as number).toBeCloseTo(54)
  })

  it('聚合 + ctx：$sum * ctx.taxRate', () => {
    const ds = makeMixedDS([
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'tax', type: 'number', computeExpression: "$sum('Items', 'amount') * ctx.taxRate" },
    ])
    const view = ds.getView('Orders', 'default')!
    view.setComputedContext({ taxRate: 0.1 })
    // order 1: 300 * 0.1 = 30
    expect(f(view.rows[0], 'tax') as number).toBeCloseTo(30)
    // 切换 ctx → 自动重算
    view.setComputedContext({ taxRate: 0.2 })
    expect(f(view.rows[0], 'tax') as number).toBeCloseTo(60)
  })

  it('聚合 + 三元：$count > 0 ? $avg : 0', () => {
    const ds = makeMixedDS([
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'safeAvg', type: 'number', computeExpression: "$count('Items') > 0 ? $avg('Items', 'amount') : 0" },
    ])
    const view = ds.getView('Orders', 'default')!
    view.initComputedColumnsFromConfig()
    // order 1: count=2 > 0 → avg = 150
    expect(f(view.rows[0], 'safeAvg') as number).toBeCloseTo(150)
  })

  it('聚合 + 字符串拼接：行字段 + $count + $sum', () => {
    const ds = makeMixedDS([
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'summary', type: 'string', computeExpression: "'订单' + id + '：' + $count('Items') + '项，合计' + $sum('Items', 'amount')" },
    ])
    const view = ds.getView('Orders', 'default')!
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'summary')).toBe('订单1：2项，合计300')
    expect(f(view.rows[1], 'summary')).toBe('订单2：1项，合计50')
  })

  it('链式 + 聚合：subtotal=$sum → tax=subtotal*ctx → grandTotal=subtotal+tax', () => {
    const ds = makeMixedDS([
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'subtotal', type: 'number', computeExpression: "$sum('Items', 'amount')" },
      { name: 'tax', type: 'number', computeExpression: 'subtotal * ctx.taxRate' },
      { name: 'grandTotal', type: 'number', computeExpression: 'subtotal + tax' },
    ])
    const view = ds.getView('Orders', 'default')!
    view.setComputedContext({ taxRate: 0.1 })
    // order 1: subtotal=300, tax=30, grandTotal=330
    expect(f(view.rows[0], 'subtotal')).toBe(300)
    expect(f(view.rows[0], 'tax') as number).toBeCloseTo(30)
    expect(f(view.rows[0], 'grandTotal') as number).toBeCloseTo(330)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. 聚合 — 动态行编辑后重触发
// ─────────────────────────────────────────────────────────────────────────────
describe('列配置 — 聚合动态行编辑', () => {
  function makeParentChildDS() {
    const ds = DataSet.fromConfig({
      dataSetName: 'Agg',
      tables: {
        Parent: {
          tableName: 'Parent',
          columns: [
            { name: 'id',    type: 'number', isPrimaryKey: true },
            { name: 'total', type: 'number', computeExpression: "$sum('Child', 'v')" },
            { name: 'cnt',   type: 'number', computeExpression: "$count('Child')" },
          ],
          rows: [{ id: 1 }, { id: 2 }],
        },
        Child: {
          tableName: 'Child',
          columns: [
            { name: 'id',       type: 'number', isPrimaryKey: true },
            { name: 'parentId', type: 'number' },
            { name: 'v',        type: 'number' },
          ],
          rows: [
            { id: 1, parentId: 1, v: 10 },
            { id: 2, parentId: 1, v: 20 },
            { id: 3, parentId: 2, v: 5 },
          ],
        },
      },
      relations: [{
        parentTable: 'Parent',
        childTable: 'Child',
        childField: 'parentId',
        dependencyType: 'currentRow',
      }],
    })
    const parentView = ds.getView('Parent', 'default')!
    const childView  = ds.getView('Child',  'default')!
    parentView.initComputedColumnsFromConfig()
    return { ds, parentView, childView }
  }

  it('初始聚合正确', () => {
    const { parentView } = makeParentChildDS()
    expect(f(parentView.rows[0], 'total')).toBe(30)
    expect(f(parentView.rows[0], 'cnt')).toBe(2)
    expect(f(parentView.rows[1], 'total')).toBe(5)
    expect(f(parentView.rows[1], 'cnt')).toBe(1)
  })

  it('子表 appendRow → 重触发 → 聚合更新', () => {
    const { parentView, childView } = makeParentChildDS()
    childView.appendRow({ id: 10, parentId: 1, v: 30 })

    parentView.initComputedColumnsFromConfig()
    expect(f(parentView.rows[0], 'total')).toBe(60)
    expect(f(parentView.rows[0], 'cnt')).toBe(3)
    expect(f(parentView.rows[1], 'total')).toBe(5)
  })

  it('子表 updateRowById → 重触发 → 聚合更新', () => {
    const { parentView, childView } = makeParentChildDS()
    childView.updateRowById(1, { v: 100 })

    parentView.initComputedColumnsFromConfig()
    expect(f(parentView.rows[0], 'total')).toBe(120)
    expect(f(parentView.rows[0], 'cnt')).toBe(2)
  })

  it('子表 replaceRows → 重触发 → 聚合更新', () => {
    const { parentView, childView } = makeParentChildDS()
    childView.replaceRows([
      { id: 1, parentId: 1, v: 7 },
      { id: 2, parentId: 1, v: 3 },
      { id: 3, parentId: 2, v: 50 },
      { id: 4, parentId: 2, v: 50 },
    ])

    parentView.initComputedColumnsFromConfig()
    expect(f(parentView.rows[0], 'total')).toBe(10)
    expect(f(parentView.rows[1], 'total')).toBe(100)
  })

  it('子表删除行 → 重触发 → 聚合缩减', () => {
    const { parentView, childView } = makeParentChildDS()
    childView.replaceRows(childView.rows.filter(r => r['id'] !== 1))

    parentView.initComputedColumnsFromConfig()
    expect(f(parentView.rows[0], 'total')).toBe(20)
    expect(f(parentView.rows[0], 'cnt')).toBe(1)
  })

  it('父表 appendRow — 新父行聚合基于当前子表快照', () => {
    const { parentView, childView } = makeParentChildDS()
    childView.appendRow({ id: 99, parentId: 3, v: 42 })
    parentView.appendRow({ id: 3 })

    expect(f(parentView.rows[2], 'total')).toBe(42)
    expect(f(parentView.rows[2], 'cnt')).toBe(1)
  })

  it('父表 updateRowById — 聚合值不受非关联字段更新影响', () => {
    const { parentView } = makeParentChildDS()
    parentView.updateRowById(1, { note: 'updated' })

    expect(f(parentView.rows[0], 'total')).toBe(30)
    expect(f(parentView.rows[0], 'cnt')).toBe(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. stripComputedColumns — CRUD 提交前剥离
// ─────────────────────────────────────────────────────────────────────────────
describe('列配置 — stripComputedColumns', () => {
  it('剥离配置列计算字段，返回浅拷贝', () => {
    const view = makeView([
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'price', type: 'number' },
      { name: 'qty', type: 'number' },
      { name: 'total', type: 'number', computeExpression: 'price * qty' },
    ])
    const row = { id: 1, price: 10, qty: 5, total: 50 }
    const stripped = view.stripComputedColumns(row)
    expect('total' in stripped).toBe(false)
    expect(stripped['price']).toBe(10)
    expect(stripped['qty']).toBe(5)
  })

  it('无计算列时返回原对象引用（零拷贝）', () => {
    const view = makeView([
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'name', type: 'string' },
    ])
    const row = { id: 1, name: 'A' }
    expect(view.stripComputedColumns(row)).toBe(row)
  })

  it('strip 不影响原始行对象', () => {
    const view = makeView([
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'x', type: 'number' },
      { name: 'tag', type: 'string', computeExpression: "'#' + x" },
    ])
    const row = { id: 1, x: 10, tag: '#10' }
    view.stripComputedColumns(row)
    expect(row['tag']).toBe('#10')
  })

  it('聚合计算列也被正确剥离', () => {
    const ds = DataSet.fromConfig({
      dataSetName: 'DS',
      tables: {
        P: {
          tableName: 'P',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'total', type: 'number', computeExpression: "$sum('C', 'v')" },
          ],
          rows: [{ id: 1 }],
        },
        C: {
          tableName: 'C',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'parentId', type: 'number' },
            { name: 'v', type: 'number' },
          ],
          rows: [{ id: 1, parentId: 1, v: 100 }],
        },
      },
      relations: [{
        parentTable: 'P',
        childTable: 'C',
        childField: 'parentId',
        dependencyType: 'currentRow',
      }],
    })
    const view = ds.getView('P', 'default')!
    view.initComputedColumnsFromConfig()
    const stripped = view.stripComputedColumns(view.rows[0]!)
    expect('total' in stripped).toBe(false)
    expect(stripped['id']).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. 运行时错误降级
// ─────────────────────────────────────────────────────────────────────────────
describe('列配置 — 运行时错误降级', () => {
  it('表达式求值抛出时写入 undefined，不影响其他计算列', () => {
    const view = makeView(
      [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'obj', type: 'string' },
        { name: 'broken', type: 'string', computeExpression: 'obj.x.y' },
        { name: 'safe', type: 'string', computeExpression: "id + '!'" },
      ],
      [],
    )
    view.appendRow({ id: 1, obj: null })
    expect(f(view.rows[0], 'broken')).toBeUndefined()
    expect(f(view.rows[0], 'safe')).toBe('1!')
  })

  it('编译失败的列跳过，其余计算列正常工作', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const view = makeView(
      [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'x', type: 'number' },
        { name: 'good', type: 'number', computeExpression: 'x + 1' },
        { name: 'bad', type: 'number', computeExpression: '??invalid!!' },
        { name: 'also_good', type: 'number', computeExpression: 'x * 2' },
      ],
      [{ id: 1, x: 4 }],
    )
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'good')).toBe(5)
    expect(f(view.rows[0], 'also_good')).toBe(8)
    // bad 列编译失败，未注册
    expect(view.computedColumnNames.has('bad')).toBe(false)
    warnSpy.mockRestore()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10. 边界与管理
// ─────────────────────────────────────────────────────────────────────────────
describe('列配置 — 边界与管理', () => {
  it('computedColumnNames 精确反映配置列', () => {
    const view = makeView([
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'x', type: 'number' },
      { name: 'a', type: 'number', computeExpression: 'x + 1' },
      { name: 'b', type: 'number', computeExpression: 'x * 2' },
    ])
    expect(view.computedColumnNames.has('a')).toBe(true)
    expect(view.computedColumnNames.has('b')).toBe(true)
    expect(view.computedColumnNames.has('x')).toBe(false)
    expect(view.computedColumnNames.size).toBe(2)
  })

  it('removeComputedColumn — 移除后新行不再填充，历史值保留', () => {
    const view = makeView(
      [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'x', type: 'number' },
        { name: 'tag', type: 'string', computeExpression: "'#' + x" },
      ],
      [{ id: 1, x: 10 }],
    )
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'tag')).toBe('#10')

    view.removeComputedColumn('tag')
    expect(view.computedColumnNames.has('tag')).toBe(false)

    view.appendRow({ id: 2, x: 20 })
    expect(f(view.rows[1], 'tag')).toBeUndefined()
    expect(f(view.rows[0], 'tag')).toBe('#10')
  })

  it('DataSet.fromConfig 加载后 initComputedColumnsFromConfig 触发首次求值', () => {
    const ds = DataSet.fromConfig({
      dataSetName: 'DS',
      tables: {
        Items: {
          tableName: 'Items',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'price', type: 'number' },
            { name: 'qty', type: 'number' },
            { name: 'total', type: 'number', computeExpression: 'price * qty' },
          ],
          rows: [
            { id: 1, price: 20, qty: 3 },
            { id: 2, price: 15, qty: 4 },
          ],
        },
      },
    })
    const view = ds.getView('Items', 'default')!
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'total')).toBe(60)
    expect(f(view.rows[1], 'total')).toBe(60)
  })

  it('DataTable attach 时自动注册计算列（空 rows 安全）', () => {
    const table = new DataTable('Products', [
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'price', type: 'number' },
      { name: 'total', type: 'number', computeExpression: 'price * 2' },
    ])
    const view = table.getOrCreateView('default')
    expect(view.computedColumnNames.has('total')).toBe(true)
    expect(view.rows.length).toBe(0)
  })
})
