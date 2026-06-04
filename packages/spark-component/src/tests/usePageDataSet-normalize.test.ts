import { describe, it, expect } from 'vitest'
import { usePageDataSet } from '../page/renderer/usePageDataSet'
import { DataSet } from '@spark-appworks/spark-data'

describe('usePageDataSet - DataSet 生命周期管理', () => {
  it('接受已编译的 DataSet 实例并正确存储', () => {
    const ds = DataSet.fromJson({
      stats: {
        totalUsers: 8523,
        todayOrders: 145,
        revenue: '¥89,234'
      },
      recentOrders: [
        { orderNo: 'ORD1738653421001', customer: '张三', amount: 2580, status: '已完成', date: '2026-02-04' },
        { orderNo: 'ORD1738653421002', customer: '李四', amount: 1299, status: '已发货', date: '2026-02-03' },
        { orderNo: 'ORD1738653421003', customer: '王五', amount: 4560, status: '已付款', date: '2026-02-03' },
        { orderNo: 'ORD1738653421004', customer: '赵六', amount: 899, status: '待付款', date: '2026-02-02' },
        { orderNo: 'ORD1738653421005', customer: '钱七', amount: 3200, status: '已完成', date: '2026-02-01' }
      ],
      title: 'Async Demo'
    })

    const pds = usePageDataSet({ enableDataSet: true })
    pds.initDataSet(ds)

    expect(pds.dataSet).toBe(ds)

    // 键名应与原始 pageData 的顶层键一致
    expect(Object.keys(ds.tables)).toEqual(expect.arrayContaining(['stats', 'recentOrders', 'title']))

    const statsView = ds.getView('stats', 'default')!
    expect(statsView).toBeDefined()
    expect(statsView.rows).toHaveLength(1)
    expect(statsView.rows[0]?.['totalUsers']).toBe(8523)

    const ordersView = ds.getView('recentOrders', 'default')!
    expect(ordersView).toBeDefined()
    expect(ordersView.rows).toHaveLength(5)
    expect(ordersView.rows[0]?.['orderNo']).toBe('ORD1738653421001')

    const titleView = ds.getView('title', 'default')!
    expect(titleView.rows[0]).toEqual({ value: 'Async Demo' })
  })

  it('enableDataSet 为 false 时 initDataSet 不存储', () => {
    const ds = DataSet.fromJson({ foo: 'bar' })
    const pds = usePageDataSet({ enableDataSet: false })
    pds.initDataSet(ds)
    expect(pds.dataSet).toBeNull()
  })

  it('clearDataSet 清除已存储的实例', () => {
    const ds = DataSet.fromJson({ foo: 'bar' })
    const pds = usePageDataSet({ enableDataSet: true })
    pds.initDataSet(ds)
    expect(pds.dataSet).toBe(ds)
    pds.clearDataSet()
    expect(pds.dataSet).toBeNull()
  })
})
