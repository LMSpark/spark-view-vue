/**
 * 计算列深度测试
 *
 * 覆盖范围：
 * 1. compileExpression — 基础算术、字符串拼接、ctx 上下文
 * 2. ComputedColumnDelegate — register / apply / strip / remove / destroy
 * 3. compileColumnsExpressions — 批量编译，失败行跳过
 * 4. DataView.setComputedColumn / setComputedColumnExpression
 * 5. DataView.setComputedContext — context 变更重编译
 * 6. 聚合函数 $sum / $count / $avg / $min / $max / $list / $join（DataSet 关联）
 * 7. auto-sync from DataTable.columns[].computeExpression
 * 8. 行操作自动重求值：appendRow / updateRowById / replaceRows / editRowById
 * 9. stripComputedColumns — CRUD 提交前剥离
 * 10. computedColumnNames getter
 * 11. removeComputedColumn
 * 12. 运行时错误降级为 undefined
 * 13. initComputedColumnsFromConfig 手动重触发
 */

import { describe, it, expect, vi } from 'vitest'
import {
  DataView,
  DataTable,
  DataSet,
  compileExpression,
  compileColumnsExpressions,
} from '@spark-view/spark-data'
import type { IDataRow, AggregateResolver } from '@spark-view/spark-data'

// ─────────────────────────────────────────────────────────────────────────────
// 工具：创建一个绑定了 DataTable 的 DataView（最小化依赖）
// ─────────────────────────────────────────────────────────────────────────────
function makeView(
  columns: Array<{ name: string; type?: string; isPrimaryKey?: boolean; computeExpression?: string }>,
  rows: IDataRow[] = [],
): DataView {
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
// 1. compileExpression — 低级编译器单元测试
// ─────────────────────────────────────────────────────────────────────────────
describe('compileExpression — 基础编译器', () => {
  it('算术表达式', () => {
    const fn = compileExpression('price * qty')
    expect(fn({ price: 10, qty: 3 } as IDataRow)).toBe(30)
    expect(fn({ price: 5.5, qty: 2 } as IDataRow)).toBe(11)
  })

  it('字符串拼接', () => {
    const fn = compileExpression("firstName + ' ' + lastName")
    expect(fn({ firstName: '张', lastName: '三' } as IDataRow)).toBe('张 三')
  })

  it('三元条件', () => {
    const fn = compileExpression("score >= 60 ? '及格' : '不及格'")
    expect(fn({ score: 80 } as IDataRow)).toBe('及格')
    expect(fn({ score: 50 } as IDataRow)).toBe('不及格')
  })

  it('ctx 外部上下文', () => {
    const fn = compileExpression('amount * ctx.taxRate', { taxRate: 0.13 })
    expect(fn({ amount: 100 } as IDataRow)).toBeCloseTo(13)
  })

  it('ctx 为 undefined 时不报错（表达式不使用 ctx）', () => {
    const fn = compileExpression('x + 1')
    expect(fn({ x: 9 } as IDataRow)).toBe(10)
  })

  it('编译期语法错误抛出异常', () => {
    expect(() => compileExpression('??invalid!!')).toThrow()
  })

  it('运行时错误返回 undefined（由 ComputedColumnDelegate.apply 捕获）', () => {
    // 直接调用编译好的函数 — 运行时错误会 throw（apply 层捕获）
    const fn = compileExpression('a.b.c.d')   // 中间链为 undefined 时 throw
    expect(() => fn({ a: null } as IDataRow)).toThrow()
  })

  it('无聚合时 resolver 不影响结果（快速路径）', () => {
    const resolver: AggregateResolver = { resolveChildRows: vi.fn(() => []) }
    const fn = compileExpression('x * 2', undefined, resolver)
    expect(fn({ x: 5 } as IDataRow)).toBe(10)
    // 快速路径不调用 resolver
    expect(resolver.resolveChildRows).not.toHaveBeenCalled()
  })

  it('同一编译函数多次调用，每次读取传入行对象的当前值', () => {
    const fn = compileExpression('price * qty')
    // 不同行对象传入，每次独立求值
    expect(fn({ price: 10, qty: 3 } as IDataRow)).toBe(30)
    expect(fn({ price: 20, qty: 3 } as IDataRow)).toBe(60)
    expect(fn({ price: 10, qty: 5 } as IDataRow)).toBe(50)
  })

  it('行对象字段被就地修改后，再次调用反映新值', () => {
    const fn = compileExpression('price * qty')
    const row = { price: 10, qty: 3 } as IDataRow
    expect(fn(row)).toBe(30)

    row['price'] = 20
    expect(fn(row)).toBe(60)   // 同一行对象，price 已变

    row['qty'] = 1
    expect(fn(row)).toBe(20)   // qty 也变
  })

  it('ctx 就地修改不影响已冻结的编译结果（ctx 在 compileExpression 时 freeze）', () => {
    const ctx = { taxRate: 0.1 }
    const fn = compileExpression('amount * ctx.taxRate', ctx)

    expect(fn({ amount: 100 } as IDataRow)).toBeCloseTo(10)

    // 修改原始 ctx 对象——编译器已做 Object.freeze，不应影响结果
    ctx.taxRate = 0.9
    expect(fn({ amount: 100 } as IDataRow)).toBeCloseTo(10)  // 仍是旧值
  })

  it('字段值为 0 / null / undefined 时表达式正常处理', () => {
    const fn = compileExpression('price * qty')
    expect(fn({ price: 0, qty: 99 } as IDataRow)).toBe(0)
    expect(fn({ price: null as unknown as number, qty: 3 } as IDataRow)).toBe(0) // null * 3 = 0（JS 强转）
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. ComputedColumnDelegate 单元测试（通过 DataView 公共 API 间接测试）
// ─────────────────────────────────────────────────────────────────────────────
describe('DataView — setComputedColumn / setComputedColumnExpression', () => {
  it('setComputedColumn 函数式 — 使用闭包捕获外部查找表', () => {
    // setComputedColumn 的典型优势：可引用闭包变量（字符串表达式做不到）
    const categoryLabel = new Map([
      ['A', '高级'],
      ['B', '中级'],
      ['C', '入门'],
    ])
    const view = makeView(
      [{ name: 'id', type: 'number', isPrimaryKey: true }, { name: 'category', type: 'string' }],
      [{ id: 1, category: 'A' }, { id: 2, category: 'C' }, { id: 3, category: 'X' }],
    )
    view.setComputedColumn('label', row =>
      categoryLabel.get(String(row['category'])) ?? '未知',
    )
    expect(f(view.rows[0], 'label')).toBe('高级')
    expect(f(view.rows[1], 'label')).toBe('入门')
    expect(f(view.rows[2], 'label')).toBe('未知')
  })

  it('setComputedColumn 函数式 — 调用外部工具函数格式化字段', () => {
    // 外部 formatter（字符串表达式无法调用任意函数）
    const fmt = (v: unknown) => `CNY ${Number(v).toFixed(2)}`
    const view = makeView(
      [{ name: 'id', type: 'number', isPrimaryKey: true }, { name: 'price', type: 'number' }],
      [{ id: 1, price: 9.9 }, { id: 2, price: 1234.5 }],
    )
    view.setComputedColumn('displayPrice', row => fmt(row['price']))
    expect(f(view.rows[0], 'displayPrice')).toBe('CNY 9.90')
    expect(f(view.rows[1], 'displayPrice')).toBe('CNY 1234.50')
  })

  it('setComputedColumnExpression 字符串表达式 — 注册后立即求值', () => {
    const view = makeView(
      [{ name: 'id', type: 'number', isPrimaryKey: true }, { name: 'price', type: 'number' }, { name: 'qty', type: 'number' }],
      [{ id: 1, price: 8, qty: 5 }],
    )
    view.setComputedColumnExpression('total', 'price * qty')
    expect(f(view.rows[0], 'total')).toBe(40)
  })

  it('链式：setComputedColumn 的函数结果可被后续字符串表达式引用', () => {
    // 先用函数列做复杂格式化，后续表达式列再引用其结果
    const view = makeView(
      [{ name: 'id', type: 'number', isPrimaryKey: true }, { name: 'score', type: 'number' }],
      [{ id: 1, score: 88 }],
    )
    // 函数列：将分数映射为等级字符（无法用简单算术表达式实现）
    view.setComputedColumn('grade', row => {
      const s = Number(row['score'])
      if (s >= 90) return 'A'
      if (s >= 80) return 'B'
      if (s >= 60) return 'C'
      return 'D'
    })
    // 表达式列引用 grade（字符串拼接）
    view.setComputedColumnExpression('summary', "score + '分 → ' + grade")
    expect(f(view.rows[0], 'grade')).toBe('B')
    expect(f(view.rows[0], 'summary')).toBe('88分 → B')
  })

  it('computedColumnNames 返回所有已注册名称', () => {
    const view = makeView([{ name: 'id', type: 'number', isPrimaryKey: true }])
    view.setComputedColumn('a', () => 1)
    view.setComputedColumn('b', () => 2)
    expect(view.computedColumnNames.has('a')).toBe(true)
    expect(view.computedColumnNames.has('b')).toBe(true)
    expect(view.computedColumnNames.size).toBe(2)
  })

  it('removeComputedColumn — 移除后停止更新，历史值保留', () => {
    const fmt = (v: unknown) => `#${v}`
    const view = makeView(
      [{ name: 'id', type: 'number', isPrimaryKey: true }],
      [{ id: 1 }],
    )
    view.setComputedColumn('tag', row => fmt(row['id']))
    expect(f(view.rows[0], 'tag')).toBe('#1')

    view.removeComputedColumn('tag')
    expect(view.computedColumnNames.has('tag')).toBe(false)

    // 移除后 appendRow 不再填充 tag
    view.appendRow({ id: 2 })
    expect(f(view.rows[1], 'tag')).toBeUndefined()

    // 历史行的 tag 保留（未被清除）
    expect(f(view.rows[0], 'tag')).toBe('#1')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. setComputedContext — ctx 变更重编译
// ─────────────────────────────────────────────────────────────────────────────
describe('DataView.setComputedContext', () => {
  it('context 变更后，DataTable 配置列自动重编译，手动注册表达式需重新注册', () => {
    const view = makeView(
      [{ name: 'id', type: 'number', isPrimaryKey: true }, { name: 'amount', type: 'number' }],
      [{ id: 1, amount: 1000 }],
    )
    view.setComputedContext({ taxRate: 0.1 })
    // 手动注册的表达式：ctx 在编译时被 freeze，不随 setComputedContext 更新
    view.setComputedColumnExpression('tax', 'amount * ctx.taxRate')
    expect(f(view.rows[0], 'tax') as number).toBeCloseTo(100)

    // 要使用新 ctx，需要重新注册表达式（手动注册行为，非 DataTable 配置列）
    view.setComputedContext({ taxRate: 0.2 })
    view.setComputedColumnExpression('tax', 'amount * ctx.taxRate')  // 重新注册以应用新 ctx
    expect(f(view.rows[0], 'tax') as number).toBeCloseTo(200)
  })

  it('context 变更时重新编译 DataTable 配置列', () => {
    const table = new DataTable('Sales', [
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'amount', type: 'number' },
      { name: 'tax', type: 'number', computeExpression: 'amount * ctx.taxRate' },
    ])
    const view = table.getOrCreateView('default')
    view.rows.splice(0, 0, { id: 1, amount: 500 })

    view.setComputedContext({ taxRate: 0.05 })
    expect(f(view.rows[0], 'tax') as number).toBeCloseTo(25)

    view.setComputedContext({ taxRate: 0.15 })
    expect(f(view.rows[0], 'tax') as number).toBeCloseTo(75)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Auto-sync from DataTable column config
// ─────────────────────────────────────────────────────────────────────────────
describe('DataTable.columns[].computeExpression — 自动编译', () => {
  it('attach DataTable 时自动编译并应用计算列（但 rows 为空安全）', () => {
    const table = new DataTable('Products', [
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'price', type: 'number' },
      { name: 'qty', type: 'number' },
      { name: 'total', type: 'number', computeExpression: 'price * qty' },
    ])
    const view = table.getOrCreateView('default')
    expect(view.computedColumnNames.has('total')).toBe(true)
  })

  it('fromConfig 加载后需手动调 initComputedColumnsFromConfig 触发首次求值', () => {
    // 注：DataSet.fromConfig 直接赋值 rows（绕过 replaceRows），
    // 所以初始行不会自动应用计算列，需手动触发一次 initComputedColumnsFromConfig。
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
    // 手动触发初始计算列求值
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'total')).toBe(60)
    expect(f(view.rows[1], 'total')).toBe(60)
  })

  it('编译失败的列跳过，其余列正常（compileColumnsExpressions 容错）', () => {
    // 直接测试 compileColumnsExpressions
    const result = compileColumnsExpressions([
      { name: 'good', computeExpression: 'x + 1' },
      { name: 'bad', computeExpression: '??invalid!!' },
      { name: 'also_good', computeExpression: 'x * 2' },
    ])
    expect(result.has('good')).toBe(true)
    expect(result.has('bad')).toBe(false)   // 编译失败，跳过
    expect(result.has('also_good')).toBe(true)
    expect(result.get('good')!({ x: 4 } as IDataRow)).toBe(5)
    expect(result.get('also_good')!({ x: 4 } as IDataRow)).toBe(8)
  })

  it('initComputedColumnsFromConfig 手动触发重编译并对现有 rows 求值', () => {
    const view = makeView(
      [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'price', type: 'number' },
        { name: 'qty', type: 'number' },
        { name: 'total', type: 'number', computeExpression: 'price * qty' },
      ],
      [{ id: 1, price: 8, qty: 5 }],
    )
    // makeView 中直接 splice/设置 rows（绕过 replaceRows），需手动初始化
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'total')).toBe(40)

    // 模拟列配置变更后重建场景：修改行字段再重触发
    const row0 = view.rows[0]!
    row0['price'] = 10
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'total')).toBe(50)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. 行操作自动重求值
// ─────────────────────────────────────────────────────────────────────────────
describe('行操作自动重求值', () => {
  it('appendRow — 新行立即得到计算列值', () => {
    const view = makeView(
      [{ name: 'id', type: 'number', isPrimaryKey: true }, { name: 'x', type: 'number' }],
      [{ id: 1, x: 2 }],
    )
    view.setComputedColumn('double', row => Number(row['x']) * 2)
    view.appendRow({ id: 2, x: 7 })
    expect(f(view.rows[1], 'double')).toBe(14)
  })

  it('updateRowById — 更新字段后计算列重算', () => {
    const view = makeView(
      [{ name: 'id', type: 'number', isPrimaryKey: true }, { name: 'price', type: 'number' }, { name: 'qty', type: 'number' }],
      [{ id: 1, price: 10, qty: 3 }],
    )
    view.setComputedColumnExpression('total', 'price * qty')
    expect(f(view.rows[0], 'total')).toBe(30)

    view.updateRowById(1, { price: 20 })
    expect(f(view.rows[0], 'total')).toBe(60)
  })

  it('replaceRows — 全量替换后所有新行有计算列值', () => {
    const view = makeView(
      [{ name: 'id', type: 'number', isPrimaryKey: true }, { name: 'v', type: 'number' }],
    )
    view.setComputedColumn('sq', row => Number(row['v']) ** 2)
    view.replaceRows([{ id: 1, v: 3 }, { id: 2, v: 4 }, { id: 3, v: 5 }])
    expect(view.rows.map(row => row['sq'])).toEqual([9, 16, 25])
  })

  it('updateFromServer — 服务端响应后重算', () => {
    const view = makeView(
      [{ name: 'id', type: 'number', isPrimaryKey: true }, { name: 'n', type: 'number' }],
    )
    view.setComputedColumn('half', row => Number(row['n']) / 2)
    view.updateFromServer({ rows: [{ id: 1, n: 10 }, { id: 2, n: 20 }] })
    expect(f(view.rows[0], 'half')).toBe(5)
    expect(f(view.rows[1], 'half')).toBe(10)
  })

  it('editRowById — 手工编辑后计算列也重算', async () => {
    const view = makeView(
      [{ name: 'id', type: 'number', isPrimaryKey: true }, { name: 'price', type: 'number' }, { name: 'qty', type: 'number' }],
      [{ id: 1, price: 5, qty: 4 }],
    )
    view.setComputedColumnExpression('total', 'price * qty')
    expect(f(view.rows[0], 'total')).toBe(20)

    await view.editRowById(1, { price: 10 })
    expect(f(view.rows[0], 'total')).toBe(40)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. stripComputedColumns — CRUD 提交前剥离
// ─────────────────────────────────────────────────────────────────────────────
describe('stripComputedColumns', () => {
  it('剥离已注册计算列字段，返回浅拷贝', () => {
    const view = makeView([
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'price', type: 'number' },
      { name: 'qty', type: 'number' },
    ])
    view.setComputedColumn('total', row => Number(row['price']) * Number(row['qty']))
    const row = { id: 1, price: 10, qty: 5, total: 50 }
    const stripped = view.stripComputedColumns(row)
    expect('total' in stripped).toBe(false)
    expect(stripped['price']).toBe(10)
    expect(stripped['qty']).toBe(5)
  })

  it('无计算列时返回原对象（零拷贝）', () => {
    const view = makeView([{ name: 'id', type: 'number', isPrimaryKey: true }])
    const row = { id: 1, name: 'A' }
    expect(view.stripComputedColumns(row)).toBe(row)   // 引用相同
  })

  it('不影响原始行对象（浅拷贝语义）', () => {
    const view = makeView([{ name: 'id', type: 'number', isPrimaryKey: true }])
    view.setComputedColumn('tag', () => 'x')
    const row = { id: 1, tag: 'x', name: 'A' }
    view.stripComputedColumns(row)
    expect(row['tag']).toBe('x')   // 原始对象未被修改
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. 运行时错误降级
// ─────────────────────────────────────────────────────────────────────────────
describe('运行时错误降级', () => {
  it('表达式求值抛出时，该字段写入 undefined，不影响其他列', () => {
    const view = makeView(
      [{ name: 'id', type: 'number', isPrimaryKey: true }, { name: 'obj' }],
      [],
    )
    // 访问 null.x 会 throw
    view.setComputedColumn('broken', row => (row['obj'] as { x: unknown } | null)!.x)
    view.setComputedColumn('safe', row => String(row['id']) + '!')

    view.appendRow({ id: 1, obj: null })
    expect(f(view.rows[0], 'broken')).toBeUndefined()
    expect(f(view.rows[0], 'safe')).toBe('1!')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. 聚合函数 — $sum / $count / $avg / $min / $max / $list / $join
// ─────────────────────────────────────────────────────────────────────────────
describe('聚合函数 — DataSet 关联', () => {
  function makeOrdersDS() {
    return DataSet.fromConfig({
      dataSetName: 'Shop',
      tables: {
        Orders: {
          tableName: 'Orders',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'customerId', type: 'number' },
            // 计算列：汇总关联 Items
            { name: 'totalAmount', type: 'number', computeExpression: "$sum('Items', 'amount')" },
            { name: 'itemCount',   type: 'number', computeExpression: "$count('Items')" },
            { name: 'avgAmount',   type: 'number', computeExpression: "$avg('Items', 'amount')" },
            { name: 'minAmount',   type: 'number', computeExpression: "$min('Items', 'amount')" },
            { name: 'maxAmount',   type: 'number', computeExpression: "$max('Items', 'amount')" },
            { name: 'nameList',    type: 'string', computeExpression: "$join('Items', 'name')" },
            { name: 'names',    type: 'string',     computeExpression: "$list('Items', 'name')" },
          ],
          rows: [
            { id: 1, customerId: 10 },
            { id: 2, customerId: 20 },
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
      relations: [
        {
          parentTable: 'Orders',
          childTable: 'Items',
          childField: 'orderId',
          dependencyType: 'currentRow',
        },
      ],
    })
  }

  it('$sum — 累计子行字段', () => {
    const ds = makeOrdersDS()
    const ordersView = ds.getView('Orders', 'default')!
    ordersView.initComputedColumnsFromConfig()
    expect(f(ordersView.rows[0], 'totalAmount')).toBe(350)  // 100+200+50
    expect(f(ordersView.rows[1], 'totalAmount')).toBe(80)
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
    // order 1: (100+200+50)/3 ≈ 116.67
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

  it('$join — 子行字段连接字符串', () => {
    const ds = makeOrdersDS()
    const view = ds.getView('Orders', 'default')!
    view.initComputedColumnsFromConfig()
    expect(f(view.rows[0], 'nameList')).toBe('A, B, C')
  })

  it('$join 自定义分隔符', () => {
    const ds = DataSet.fromConfig({
      dataSetName: 'DS2',
      tables: {
        Parents: {
          tableName: 'Parents',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'tags', type: 'string', computeExpression: "$join('Children', 'tag', ' | ')" },
          ],
          rows: [{ id: 1 }],
        },
        Children: {
          tableName: 'Children',
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
        parentTable: 'Parents',
        childTable: 'Children',
        childField: 'parentId',
        dependencyType: 'currentRow',
      }],
    })
    ds.getView('Parents', 'default')!.initComputedColumnsFromConfig()
    expect(f(ds.getView('Parents', 'default')!.rows[0], 'tags')).toBe('foo | bar')
  })

  it('子行为空时 $sum=0, $count=0, $avg=0, $min=undefined, $max=undefined, $list=[], $join=""', () => {
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
            { name: 'mn',   type: 'number',  computeExpression: "$min('C', 'v')" },
            { name: 'mx',   type: 'number',  computeExpression: "$max('C', 'v')" },
            { name: 'lst',  type: 'string',  computeExpression: "$list('C', 'v')" },
            { name: 'jn',   type: 'string',  computeExpression: "$join('C', 'v')" },
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
          rows: [], // 无子行
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
// 9. 聚合函数 — 动态行编辑正确性
//    验证子表行变化后重触发父视图求值时聚合结果是否正确
// ─────────────────────────────────────────────────────────────────────────────
describe('聚合函数 — 动态行编辑正确性', () => {
  /** 构建一个最小父子 DataSet，返回 { ds, parentView, childView } */
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
    expect(f(parentView.rows[0], 'total')).toBe(30)   // 10+20
    expect(f(parentView.rows[0], 'cnt')).toBe(2)
    expect(f(parentView.rows[1], 'total')).toBe(5)
    expect(f(parentView.rows[1], 'cnt')).toBe(1)
  })

  it('子表 appendRow 后，重触发父视图求值，聚合结果更新', () => {
    const { parentView, childView } = makeParentChildDS()

    // 子表新增一行 parentId=1
    childView.appendRow({ id: 10, parentId: 1, v: 30 })

    // 子行已变化，但父视图尚未重算——旧快照
    expect(f(parentView.rows[0], 'total')).toBe(30)

    // 重触发父视图聚合求值
    parentView.initComputedColumnsFromConfig()
    expect(f(parentView.rows[0], 'total')).toBe(60)   // 10+20+30
    expect(f(parentView.rows[0], 'cnt')).toBe(3)
    // parentId=2 未变
    expect(f(parentView.rows[1], 'total')).toBe(5)
  })

  it('子表 updateRowById 后，重触发父视图，聚合结果更新', () => {
    const { parentView, childView } = makeParentChildDS()

    childView.updateRowById(1, { v: 100 })   // id=1 v: 10 → 100

    parentView.initComputedColumnsFromConfig()
    expect(f(parentView.rows[0], 'total')).toBe(120)  // 100+20
    expect(f(parentView.rows[0], 'cnt')).toBe(2)
  })

  it('子表 replaceRows 后，重触发父视图，聚合结果更新', () => {
    const { parentView, childView } = makeParentChildDS()

    // 完全替换子表行
    childView.replaceRows([
      { id: 1, parentId: 1, v: 7 },
      { id: 2, parentId: 1, v: 3 },
      { id: 3, parentId: 2, v: 50 },
      { id: 4, parentId: 2, v: 50 },
    ])

    parentView.initComputedColumnsFromConfig()
    expect(f(parentView.rows[0], 'total')).toBe(10)   // 7+3
    expect(f(parentView.rows[0], 'cnt')).toBe(2)
    expect(f(parentView.rows[1], 'total')).toBe(100)  // 50+50
    expect(f(parentView.rows[1], 'cnt')).toBe(2)
  })

  it('子表删除行后（通过 replaceRows 模拟），重触发父视图，聚合缩减', () => {
    const { parentView, childView } = makeParentChildDS()

    // 删除 parentId=1 的一行（保留 id=2 v=20）
    childView.replaceRows(
      childView.rows.filter(r => r['id'] !== 1)
    )

    parentView.initComputedColumnsFromConfig()
    expect(f(parentView.rows[0], 'total')).toBe(20)   // 只剩 v=20
    expect(f(parentView.rows[0], 'cnt')).toBe(1)
  })

  it('父表 appendRow — 新父行聚合基于当前子表快照', () => {
    const { parentView, childView } = makeParentChildDS()

    // 先给子表加一行属于 parentId=3 的数据
    childView.appendRow({ id: 99, parentId: 3, v: 42 })

    // 父表新增 id=3 的行，appendRow 会立即触发 _applyComputedColumns
    parentView.appendRow({ id: 3 })

    // 聚合在 appendRow 时已计算
    expect(f(parentView.rows[2], 'total')).toBe(42)
    expect(f(parentView.rows[2], 'cnt')).toBe(1)
  })

  it('父表 updateRowById — 已有父行重算无副作用', () => {
    const { parentView } = makeParentChildDS()

    // 更新父行的非聚合字段（若父表有 label 之类）
    // 这里用不存在字段更新来单纯触发 _applyComputedColumns
    parentView.updateRowById(1, { note: 'updated' })

    // 聚合值应保持不变
    expect(f(parentView.rows[0], 'total')).toBe(30)
    expect(f(parentView.rows[0], 'cnt')).toBe(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10. compileColumnsExpressions 批量编译
// ─────────────────────────────────────────────────────────────────────────────
describe('compileColumnsExpressions', () => {
  it('只编译含 computeExpression 的列', () => {
    const map = compileColumnsExpressions([
      { name: 'id' },
      { name: 'name' },
      { name: 'total', computeExpression: 'price * qty' },
    ])
    expect(map.size).toBe(1)
    expect(map.has('total')).toBe(true)
  })

  it('空列表返回空 Map', () => {
    expect(compileColumnsExpressions([]).size).toBe(0)
  })

  it('编译失败列跳过，不影响后续列', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const map = compileColumnsExpressions([
      { name: 'ok1', computeExpression: 'a + b' },
      { name: 'fail', computeExpression: '???' },
      { name: 'ok2', computeExpression: 'a - b' },
    ])
    expect(map.has('ok1')).toBe(true)
    expect(map.has('fail')).toBe(false)
    expect(map.has('ok2')).toBe(true)
    warnSpy.mockRestore()
  })
})
