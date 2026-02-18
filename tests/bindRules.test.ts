import { describe, it, expect } from 'vitest'
import { isReactive } from 'vue'
import { bindDataToRules } from '../packages/spark-renderer/src/utils/bindRules'
import { SparkData } from '../packages/spark-data/src/spark-data'

describe('bindRules - DataKey rows -> IDataSource binding', () => {
  it('el-table 应仅绑定 props.dataSource（DataView / IDataSource）', () => {
    const dataSet = SparkData.createDataSet({
      dataSetName: 'TestDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [{ name: 'id', type: 'number' }, { name: 'name', type: 'string' }],
          rows: [ { id: 1, name: 'Alice' }, { id: 2, name: 'Bob' } ]
        }
      }
    })

    const rules = [
      { type: 'el-table', dataKey: 'TestDS@Users@default@rows' }
    ] as any[]

    const bound = bindDataToRules({ rules, pageData: {}, pageFunctions: {}, dataSet, formApi: null })
    expect(bound).toHaveLength(1)

    const r = bound[0]
    expect(r.props).toBeDefined()
    // 兼容逻辑已移除：el-table 只绑定 props.dataSource（props.data 不再使用）
    expect(r.props.data).toBeUndefined()

    // props.dataSource 应包含 rows + meta（现在 props.dataSource 就是 DataView）
    expect(r.props.dataSource).toBeDefined()
    expect(r.props.dataSource.rows).toEqual([{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }])
    expect(r.props.dataSource.total).toBeDefined()
    expect(r.props.dataSource.page).toBeDefined()
    expect(r.props.dataSource.pageSize).toBeDefined()

    // props.dataSource 应即为 DataView 实例
    const dv = dataSet.getView('Users', 'default')
    expect(r.props.dataSource).toBe(dv)

    // DataView 应为响应式对象（Vue reactive）
    expect(isReactive(dv)).toBe(true)
    expect(isReactive(r.props.dataSource)).toBe(true)

    // 同时注入 DataView（props.dataView）并可调用方法
    expect(r.props.dataView).toBe(dv)
    expect(typeof (r.props.dataView?.loadFromServer)).toBe('function')
  })
})