import { describe, expect, it } from 'vitest'
import { SparkData } from '@spark-view/spark-data'

describe('DataView static-data 本地过滤表达式', () => {
  it('支持结合计算列、FIELD 值函数与 placeholder 参数解析', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'StaticFilterExpr',
      tables: {
        Orders: {
          tableName: 'Orders',
          resourceType: 'static-data',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'price', type: 'number' },
            { name: 'qty', type: 'number' },
            { name: 'minTotal', type: 'number' },
            { name: 'thresholdField', type: 'string' },
            { name: 'total', type: 'number', computeExpression: 'price * qty' },
          ],
          views: {
            default: {
              rows: [
                { id: 1, price: 10, qty: 2, minTotal: 25, thresholdField: 'minTotal' },
                { id: 2, price: 20, qty: 2, minTotal: 30, thresholdField: 'minTotal' },
                { id: 3, price: 5, qty: 3, minTotal: 20, thresholdField: 'minTotal' },
              ],
              filterExpression: {
                field: 'total',
                op: '>=',
                value: {
                  func: 'FIELD',
                  args: ['$[thresholdField]'],
                },
              },
            },
          },
        },
      },
    })

    const view = ds.getView('Orders')!
    expect(view.rows.map(row => row['id'])).toEqual([2])
    expect(view.rows[0]?.['total']).toBe(40)

    await view.setFilter(undefined)

    expect(view.rows.map(row => row['id'])).toEqual([1, 2, 3])
    expect(view.rows.map(row => row['total'])).toEqual([20, 40, 15])
  })

  it('支持 !condition 与 !or 否定节点', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'StaticFilterNegation',
      tables: {
        Tasks: {
          tableName: 'Tasks',
          resourceType: 'static-data',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'status', type: 'string' },
            { name: 'priority', type: 'number' },
          ],
          views: {
            default: {
              rows: [
                { id: 1, status: 'draft', priority: 1 },
                { id: 2, status: 'archived', priority: 3 },
                { id: 3, status: 'done', priority: 5 },
              ],
            },
          },
        },
      },
    })

    const view = ds.getView('Tasks')!

    await view.setFilter({
      type: '!or',
      children: [
        { type: '!condition', field: 'status', op: '==', value: 'draft' },
        { field: 'priority', op: '>=', value: 5 },
      ],
    })

    expect(view.rows.map(row => row['id'])).toEqual([1])
  })
})