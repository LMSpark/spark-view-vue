import { describe, expect, it } from 'vitest'
import { SparkData } from '@spark-appworks/spark-data'

describe('DataView static-data 本地过滤表达式', () => {
  it('支持结合计算列与结构化 ref 参数解析', async () => {
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
            { name: 'total', type: 'number', computeExpression: 'price * qty' },
          ],
          views: {
            default: {
              rows: [
                { id: 1, price: 10, qty: 2, minTotal: 25 },
                { id: 2, price: 20, qty: 2, minTotal: 30 },
                { id: 3, price: 5, qty: 3, minTotal: 20 },
              ],
              filterExpression: {
                field: 'total',
                op: '>=',
                value: { kind: 'field', field: 'minTotal' },
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

  it('缺失字段占位会 fail-fast', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'StaticFilterMissingField',
      tables: {
        Orders: {
          tableName: 'Orders',
          resourceType: 'static-data',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'total', type: 'number' },
          ],
          views: {
            default: {
              rows: [{ id: 1, total: 20 }],
            },
          },
        },
      },
    })

    const view = ds.getView('Orders')!

    await expect(view.setFilter({
      field: 'total',
      op: '>=',
      value: { kind: 'field', field: 'missingField' },
    })).rejects.toThrow('不存在的字段')
  })

  it('旧 placeholder 协议在配置入口会 fail-fast', () => {
    expect(() => SparkData.createDataSet({
      dataSetName: 'StaticFilterLegacyPlaceholderConfig',
      tables: {
        Orders: {
          tableName: 'Orders',
          resourceType: 'static-data',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'total', type: 'number' },
            { name: 'minTotal', type: 'number' },
          ],
          views: {
            default: {
              rows: [{ id: 1, total: 20, minTotal: 10 }],
              filterExpression: {
                field: 'total',
                op: '>=',
                value: '$[minTotal]',
              },
            },
          },
        },
      },
    })).toThrow('占位字符串协议已移除')
  })

  it('旧转义占位协议在 setFilter 入口会 fail-fast', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'StaticFilterLegacyEscapedPlaceholder',
      tables: {
        Tags: {
          tableName: 'Tags',
          resourceType: 'static-data',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'tag', type: 'string' },
          ],
          views: {
            default: {
              rows: [{ id: 1, tag: '$[draft]' }],
            },
          },
        },
      },
    })

    const view = ds.getView('Tags')!

    await expect(view.setFilter({
      field: 'tag',
      op: '==',
      value: '\\$[draft]',
    })).rejects.toThrow('占位字符串协议已移除')
  })

  it('旧字符串插值占位在 setFilter 入口会 fail-fast', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'StaticFilterInterpolation',
      tables: {
        Tags: {
          tableName: 'Tags',
          resourceType: 'static-data',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'tag', type: 'string' },
          ],
          views: {
            default: {
              rows: [{ id: 1, tag: 'prefix-draft' }],
            },
          },
        },
      },
    })

    const view = ds.getView('Tags')!

    await expect(view.setFilter({
      field: 'tag',
      op: '==',
      value: 'prefix-$[tag]',
    })).rejects.toThrow('占位字符串协议已移除')
  })

  it('旧父行占位在 setFilter 入口会 fail-fast', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'StaticFilterParentScope',
      tables: {
        Tags: {
          tableName: 'Tags',
          resourceType: 'static-data',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'tag', type: 'string' },
          ],
          views: {
            default: {
              rows: [{ id: 1, tag: 'draft' }],
            },
          },
        },
      },
    })

    const view = ds.getView('Tags')!

    await expect(view.setFilter({
      field: 'tag',
      op: '==',
      value: '$parent[id]',
    })).rejects.toThrow('协议已移除')
  })
})