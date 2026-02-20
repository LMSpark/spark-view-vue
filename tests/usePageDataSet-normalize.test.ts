import { describe, it, expect } from 'vitest'
import { usePageDataSet } from '@spark-view/spark-data'

describe('usePageDataSet - pagedata -> dataset 归一化', () => {
  it('应该把任意 pagedata.json 归一化为 DataSet（object/array/primitive）', () => {
    const pageData = {
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
      title: 'Async Demo' // primitive -> single-cell table
    }

    const { dataSet, initDataSet } = usePageDataSet({ enableDataSet: true })
    initDataSet(pageData)

    expect(dataSet.value).not.toBeNull()
    const ds = dataSet.value!

    // 键名应与 pageData 的顶层键一致
    expect(Object.keys(ds.tables)).toEqual(expect.arrayContaining(['stats', 'recentOrders', 'title']))

    const statsView = ds.getView('stats', 'default')!
    expect(statsView).toBeDefined()
    expect(statsView.rows).toHaveLength(1)
    expect((statsView.rows[0] as any).totalUsers).toBe(8523)

    const ordersView = ds.getView('recentOrders', 'default')!
    expect(ordersView).toBeDefined()
    expect(ordersView.rows).toHaveLength(5)
    expect((ordersView.rows[0] as any).orderNo).toBe('ORD1738653421001')

    const titleView = ds.getView('title', 'default')!
    expect(titleView.rows[0]).toEqual({ value: 'Async Demo' })
  })
})