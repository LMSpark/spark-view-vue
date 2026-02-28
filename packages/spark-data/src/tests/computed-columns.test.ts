/**
 * 计算列深度测试 — 纯配置驱动
 *
 * 所有计算列均通过 DataColumn.computeExpression 列配置声明。
 * 编译归 DataTable（set dataTable 触发），求值归 DataView（行操作自动触发）。
 *
 * 覆盖范围：
 * 1. 基础表达式（算术、字符串拼接、三元条件、0/null 边界）
 * 2. 多语句函数体（if/else、变量声明、for 循环）
 * 3. 链式计算列（后序列引用前序列结果）
 * 4. ctx 上下文（setComputedContext 动态切换）
 * 5. 动态行操作自动求值（replaceRows / appendRow / updateRowById / editRowById / updateFromServer）
 * 6. 聚合函数 — DataSet 关联（$sum / $count / $avg / $min / $max / $list / $join）
 * 7. 混合表达式（算术 + 聚合 + ctx 组合）
 * 8. 聚合 — 动态行编辑后 recomputeColumns 重算
 * 9. CRUD 提交前剥离（stripComputedColumns 内部）
 * 10. 运行时错误降级为 undefined
 * 11. 边界条件（编译缓存、fromConfig 自动求值、空 rows 安全）
 */

import { describe, it, expect, vi } from 'vitest'
import { DataTable, DataSet } from '@spark-view/spark-data'
import type { IDataRow } from '@spark-view/spark-data'

// ─────────────────────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 创建绑定 DataTable 的 DataView。
 * 通过 replaceRows 填充初始行（自动触发计算列求值）。
 */
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
  if (rows.length > 0) view.replaceRows(rows)
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
    expect(f(view.rows[0], 'total')).toBe(0)
    expect(f(view.rows[1], 'total')).toBe(0)  // null * 3 = 0（JS 强转）
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. 多语句函数体（支持任意 JS 逻辑）
// ─────────────────────────────────────────────────────────────────────────────
describe('列配置 — 多语句函数体', () => {
  it('if/else 分支', () => {
    const view = makeView(
      [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'score', type: 'number' },
        {
          name: 'grade', type: 'string',
          computeExpression: `
            if (score >= 90) return 'A';
            else if (score >= 80) return 'B';
            else if (score >= 60) return 'C';
            else return 'D';
          `,
        },
      ],
      [{ id: 1, score: 95 }, { id: 2, score: 72 }, { id: 3, score: 45 }],
    )
    expect(f(view.rows[0], 'grade')).toBe('A')
    expect(f(view.rows[1], 'grade')).toBe('C')
    expect(f(view.rows[2], 'grade')).toBe('D')
  })

  it('变量声明 + 复合计算', () => {
    const view = makeView(
      [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'price', type: 'number' },
        { name: 'qty', type: 'number' },
        {
          name: 'finalPrice', type: 'number',
          computeExpression: `
            var subtotal = price * qty;
            var discount = subtotal > 500 ? 0.9 : 1.0;
            return subtotal * discount;
          `,
        },
      ],
      [{ id: 1, price: 100, qty: 6 }, { id: 2, price: 100, qty: 3 }],
    )
    // id=1: 600 * 0.9 = 540; id=2: 300 * 1.0 = 300
    expect(f(view.rows[0], 'finalPrice')).toBe(540)
    expect(f(view.rows[1], 'finalPrice')).toBe(300)
  })

  it('for 循环累加', () => {
    const view = makeView(
      [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'n', type: 'number' },
        {
          name: 'factorial', type: 'number',
          computeExpression: `
            var result = 1;
            for (var i = 2; i <= n; i++) result *= i;
            return result;
          `,
        },
      ],
      [{ id: 1, n: 5 }, { id: 2, n: 0 }, { id: 3, n: 1 }],
    )
    expect(f(view.rows[0], 'factorial')).toBe(120)
    expect(f(view.rows[1], 'factorial')).toBe(1)
    expect(f(view.rows[2], 'factorial')).toBe(1)
  })

  it('函数体 + ctx 联合', () => {
    const view = makeView(
      [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'amount', type: 'number' },
        {
          name: 'tier', type: 'string',
          computeExpression: `
            var threshold = ctx.vipThreshold || 1000;
            if (amount >= threshold) return 'VIP';
            return '普通';
          `,
        },
      ],
      [{ id: 1, amount: 1500 }, { id: 2, amount: 300 }],
    )
    view.setComputedContext({ vipThreshold: 1000 })
    expect(f(view.rows[0], 'tier')).toBe('VIP')
    expect(f(view.rows[1], 'tier')).toBe('普通')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. 链式计算列
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
    expect(f(view.rows[0], 'subtotal')).toBe(500)
    expect(f(view.rows[0], 'tax') as number).toBeCloseTo(40)
    expect(f(view.rows[0], 'grandTotal') as number).toBeCloseTo(540)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. ctx 上下文 — setComputedContext 动态切换
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
    view.replaceRows([{ id: 1, amount: 500 }])

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
// 5. 动态行操作自动求值
// ─────────────────────────────────────────────────────────────────────────────
describe('列配置 — 动态行操作自动求值', () => {
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

  it('replaceRows — 全量替换后自动求值', () => {
    const view = makeOrderView()
    view.replaceRows([{ id: 1, price: 8, qty: 5 }])
    expect(f(view.rows[0], 'total')).toBe(40)
  })

  it('appendRow — 新行自动带计算列值', () => {
    const view = makeOrderView([{ id: 1, price: 10, qty: 2 }])
    view.appendRow({ id: 2, price: 7, qty: 3 })
    expect(f(view.rows[1], 'total')).toBe(21)
  })

  it('updateRowById — 源字段变更后计算列自动重算', () => {
    const view = makeOrderView([{ id: 1, price: 10, qty: 3 }])
    expect(f(view.rows[0], 'total')).toBe(30)

    view.updateRowById(1, { price: 20 })
    expect(f(view.rows[0], 'total')).toBe(60)

    view.updateRowById(1, { qty: 1 })
    expect(f(view.rows[0], 'total')).toBe(20)
  })

  it('replaceRows — 批量替换全部自动求值', () => {
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
    expect(f(view.rows[0], 'total')).toBe(20)

    await view.editRowById(1, { price: 10 })
    expect(f(view.rows[0], 'total')).toBe(40)
  })

  it('updateFromServer — 服务端响应后自动求值', () => {
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

    view.updateRowById(1, { price: 20 })
    expect(f(view.rows[0], 'total')).toBe(40)

    view.updateRowById(1, { qty: 5 })
    expect(f(view.rows[0], 'total')).toBe(100)

    view.updateRowById(1, { price: 1, qty: 1 })
    expect(f(view.rows[0], 'total')).toBe(1)
  })

  it('recomputeColumns — 直接修改行后手动重算', () => {
    const view = makeOrderView([{ id: 1, price: 8, qty: 5 }])
    expect(f(view.rows[0], 'total')).toBe(40)

    // 直接修改行字段（绕过 API），手动重触发
    view.rows[0]!['price'] = 10
    view.recomputeColumns()
    expect(f(view.rows[0], 'total')).toBe(50)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. 聚合函数 — DataSet 关联
// ─────────────────────────────────────────────────────────────────────────────
describe('列配置 — 聚合函数', () => {
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
          rows: [{ id: 1 }, { id: 2 }],
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

  it('$sum — 累计子行字段（DataSet.fromConfig 自动求值）', () => {
    const ds = makeOrdersDS()
    const view = ds.getView('Orders', 'default')!
    expect(f(view.rows[0], 'totalAmount')).toBe(350)
    expect(f(view.rows[1], 'totalAmount')).toBe(80)
  })

  it('$count — 子行数量', () => {
    const ds = makeOrdersDS()
    const view = ds.getView('Orders', 'default')!
    expect(f(view.rows[0], 'itemCount')).toBe(3)
    expect(f(view.rows[1], 'itemCount')).toBe(1)
  })

  it('$avg — 子行均值', () => {
    const ds = makeOrdersDS()
    const view = ds.getView('Orders', 'default')!
    expect(f(view.rows[0], 'avgAmount') as number).toBeCloseTo(116.67, 1)
  })

  it('$min / $max — 子行极值', () => {
    const ds = makeOrdersDS()
    const view = ds.getView('Orders', 'default')!
    expect(f(view.rows[0], 'minAmount')).toBe(50)
    expect(f(view.rows[0], 'maxAmount')).toBe(200)
  })

  it('$list — 返回子行字段数组', () => {
    const ds = makeOrdersDS()
    const view = ds.getView('Orders', 'default')!
    expect(f(view.rows[0], 'names')).toEqual(['A', 'B', 'C'])
    expect(f(view.rows[1], 'names')).toEqual(['X'])
  })

  it('$join — 子行字段连接字符串（默认分隔符）', () => {
    const ds = makeOrdersDS()
    const view = ds.getView('Orders', 'default')!
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
// 7. 混合表达式 — 算术 + 聚合 + ctx 组合
// ─────────────────────────────────────────────────────────────────────────────
describe('列配置 — 混合表达式', () => {
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
    expect(f(view.rows[0], 'taxTotal') as number).toBeCloseTo(324)
    expect(f(view.rows[1], 'taxTotal') as number).toBeCloseTo(54)
  })

  it('聚合 + ctx：$sum * ctx.taxRate', () => {
    const ds = makeMixedDS([
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'tax', type: 'number', computeExpression: "$sum('Items', 'amount') * ctx.taxRate" },
    ])
    const view = ds.getView('Orders', 'default')!
    view.setComputedContext({ taxRate: 0.1 })
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
    expect(f(view.rows[0], 'safeAvg') as number).toBeCloseTo(150)
  })

  it('聚合 + 字符串拼接', () => {
    const ds = makeMixedDS([
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'summary', type: 'string', computeExpression: "'订单' + id + '：' + $count('Items') + '项，合计' + $sum('Items', 'amount')" },
    ])
    const view = ds.getView('Orders', 'default')!
    expect(f(view.rows[0], 'summary')).toBe('订单1：2项，合计300')
    expect(f(view.rows[1], 'summary')).toBe('订单2：1项，合计50')
  })

  it('链式 + 聚合 + ctx', () => {
    const ds = makeMixedDS([
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'subtotal', type: 'number', computeExpression: "$sum('Items', 'amount')" },
      { name: 'tax', type: 'number', computeExpression: 'subtotal * ctx.taxRate' },
      { name: 'grandTotal', type: 'number', computeExpression: 'subtotal + tax' },
    ])
    const view = ds.getView('Orders', 'default')!
    view.setComputedContext({ taxRate: 0.1 })
    expect(f(view.rows[0], 'subtotal')).toBe(300)
    expect(f(view.rows[0], 'tax') as number).toBeCloseTo(30)
    expect(f(view.rows[0], 'grandTotal') as number).toBeCloseTo(330)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. 聚合 — 子表行编辑后 recomputeColumns
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
    return { ds, parentView, childView }
  }

  it('DataSet.fromConfig 后聚合即已求值', () => {
    const { parentView } = makeParentChildDS()
    expect(f(parentView.rows[0], 'total')).toBe(30)
    expect(f(parentView.rows[0], 'cnt')).toBe(2)
    expect(f(parentView.rows[1], 'total')).toBe(5)
    expect(f(parentView.rows[1], 'cnt')).toBe(1)
  })

  it('子表 appendRow → recomputeColumns → 聚合更新', () => {
    const { parentView, childView } = makeParentChildDS()
    childView.appendRow({ id: 10, parentId: 1, v: 30 })

    parentView.recomputeColumns()
    expect(f(parentView.rows[0], 'total')).toBe(60)
    expect(f(parentView.rows[0], 'cnt')).toBe(3)
    expect(f(parentView.rows[1], 'total')).toBe(5)
  })

  it('子表 updateRowById → recomputeColumns → 聚合更新', () => {
    const { parentView, childView } = makeParentChildDS()
    childView.updateRowById(1, { v: 100 })

    parentView.recomputeColumns()
    expect(f(parentView.rows[0], 'total')).toBe(120)
    expect(f(parentView.rows[0], 'cnt')).toBe(2)
  })

  it('子表 replaceRows → recomputeColumns → 聚合更新', () => {
    const { parentView, childView } = makeParentChildDS()
    childView.replaceRows([
      { id: 1, parentId: 1, v: 7 },
      { id: 2, parentId: 1, v: 3 },
      { id: 3, parentId: 2, v: 50 },
      { id: 4, parentId: 2, v: 50 },
    ])

    parentView.recomputeColumns()
    expect(f(parentView.rows[0], 'total')).toBe(10)
    expect(f(parentView.rows[1], 'total')).toBe(100)
  })

  it('子表删除行 → recomputeColumns → 聚合缩减', () => {
    const { parentView, childView } = makeParentChildDS()
    childView.replaceRows(childView.rows.filter(r => r['id'] !== 1))

    parentView.recomputeColumns()
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
// 9. CRUD 提交前剥离（内部由 CrudDelegate 调用）
// ─────────────────────────────────────────────────────────────────────────────
describe('列配置 — stripComputedColumns', () => {
  it('剥离计算字段，返回浅拷贝', () => {
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
    const stripped = view.stripComputedColumns(view.rows[0]!)
    expect('total' in stripped).toBe(false)
    expect(stripped['id']).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10. 运行时错误降级
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
    expect(f(view.rows[0], 'good')).toBe(5)
    expect(f(view.rows[0], 'also_good')).toBe(8)
    expect(view.computedColumnNames.has('bad')).toBe(false)
    warnSpy.mockRestore()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 11. 边界条件
// ─────────────────────────────────────────────────────────────────────────────
describe('列配置 — 边界条件', () => {
  it('DataSet.fromConfig 自动编译 + 求值（无需手动触发）', () => {
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
    // 无需 initComputedColumnsFromConfig / recomputeColumns
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

  it('编译缓存命中 — 相同 ctx 不重编译', () => {
    const view = makeView([
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'x', type: 'number' },
      { name: 'result', type: 'number', computeExpression: 'x + ctx.offset' },
    ])
    view.setComputedContext({ offset: 10 })
    view.replaceRows([{ id: 1, x: 5 }])
    expect(f(view.rows[0], 'result')).toBe(15)

    // 再次设置相同 ctx → 不应重编译，结果仍正确
    view.setComputedContext({ offset: 10 })
    expect(f(view.rows[0], 'result')).toBe(15)
  })

  it('新增 DataTable 后 replaceRows 自动触发计算', () => {
    const table = new DataTable('Calc', [
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'a', type: 'number' },
      { name: 'b', type: 'number' },
      { name: 'sum', type: 'number', computeExpression: 'a + b' },
    ])
    const view = table.getOrCreateView('default')
    // 无需任何初始化，replaceRows 自动求值
    view.replaceRows([{ id: 1, a: 3, b: 7 }])
    expect(f(view.rows[0], 'sum')).toBe(10)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 12. 字符串内函数定义（表达式支持任意 JS 逻辑）
// ─────────────────────────────────────────────────────────────────────────────
describe('列配置 — 字符串内函数定义', () => {
  it('基础函数定义 + 调用', () => {
    const view = makeView(
      [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'a', type: 'number' },
        { name: 'b', type: 'number' },
        { name: 'sum', type: 'number', computeExpression: 'function add(x,y){ return x+y; }; return add(a, b);' },
      ],
      [{ id: 1, a: 5, b: 6 }],
    )
    expect(f(view.rows[0], 'sum')).toBe(11)
  })

  it('工具函数 + 多次调用', () => {
    const view = makeView(
      [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'price', type: 'number' },
        { name: 'qty', type: 'number' },
        {
          name: 'formatted', type: 'string',
          computeExpression: `
            function fmt(n) { return '￥' + n.toFixed(2); }
            var total = price * qty;
            return fmt(total);
          `,
        },
      ],
      [{ id: 1, price: 99.5, qty: 3 }],
    )
    expect(f(view.rows[0], 'formatted')).toBe('￥298.50')
  })

  it('递归函数（斐波那契）', () => {
    const view = makeView(
      [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'n', type: 'number' },
        {
          name: 'fib', type: 'number',
          computeExpression: `
            function fib(x) {
              if (x <= 1) return x;
              return fib(x - 1) + fib(x - 2);
            }
            return fib(n);
          `,
        },
      ],
      [{ id: 1, n: 10 }, { id: 2, n: 0 }, { id: 3, n: 6 }],
    )
    expect(f(view.rows[0], 'fib')).toBe(55)
    expect(f(view.rows[1], 'fib')).toBe(0)
    expect(f(view.rows[2], 'fib')).toBe(8)
  })

  it('函数引用 ctx 上下文', () => {
    const view = makeView(
      [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'amount', type: 'number' },
        {
          name: 'tax', type: 'number',
          computeExpression: `
            function calcTax(val, rate) { return val * rate; }
            return calcTax(amount, ctx.taxRate);
          `,
        },
      ],
      [{ id: 1, amount: 1000 }],
    )
    view.setComputedContext({ taxRate: 0.13 })
    expect(f(view.rows[0], 'tax') as number).toBeCloseTo(130)
  })

  it('数组处理函数', () => {
    const view = makeView(
      [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'items', type: 'string' },
        {
          name: 'parsed', type: 'string',
          computeExpression: `
            function parse(str) {
              var arr = str.split(',');
              return arr.map(function(s){ return s.trim().toUpperCase(); }).join(' | ');
            }
            return parse(items);
          `,
        },
      ],
      [{ id: 1, items: 'apple, banana, cherry' }],
    )
    expect(f(view.rows[0], 'parsed')).toBe('APPLE | BANANA | CHERRY')
  })

  it('多个函数定义协作', () => {
    const view = makeView(
      [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'w', type: 'number' },
        { name: 'h', type: 'number' },
        {
          name: 'bmi', type: 'string',
          computeExpression: `
            function calcBMI(weight, height) { return weight / (height * height); }
            function classify(bmi) {
              if (bmi < 18.5) return '偏瘦';
              if (bmi < 24) return '正常';
              if (bmi < 28) return '偏胖';
              return '肥胖';
            }
            return classify(calcBMI(w, h));
          `,
        },
      ],
      [
        { id: 1, w: 65, h: 1.75 },  // BMI ≈ 21.2 → 正常
        { id: 2, w: 90, h: 1.70 },  // BMI ≈ 31.1 → 肥胖
      ],
    )
    expect(f(view.rows[0], 'bmi')).toBe('正常')
    expect(f(view.rows[1], 'bmi')).toBe('肥胖')
  })
})
