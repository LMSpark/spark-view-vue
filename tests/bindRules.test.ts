import { describe, it, expect } from 'vitest'
import { isReactive } from 'vue'
import { bindDataToRules } from '../packages/spark-component/src/renderer/utils/bindRules'
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

    const bound = bindDataToRules({ rules, pageData: {}, pageFunctions: {}, dataSet })
    expect(bound).toHaveLength(1)

    const r = bound[0]!
    const rp = r.props as Record<string, any>
    expect(rp).toBeDefined()
    // el-table 仍需 props.data（Element Plus 原生属性），值为 DataView.rows 响应式数组
    expect(Array.isArray(rp['data'])).toBe(true)
    expect(rp['data']).toEqual([{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }])

    // props.dataSource 应包含 rows + meta（现在 props.dataSource 就是 DataView）
    expect(rp['dataSource']).toBeDefined()
    expect(rp['dataSource'].rows).toEqual([{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }])
    expect(rp['dataSource'].total).toBeDefined()
    expect(rp['dataSource'].page).toBeDefined()
    expect(rp['dataSource'].pageSize).toBeDefined()

    // props.dataSource 应即为 DataView 实例
    const dv = dataSet.getView('Users', 'default')
    expect(rp['dataSource']).toBe(dv)

    // DataView 应为响应式对象（Vue reactive）
    expect(isReactive(dv)).toBe(true)
    expect(isReactive(rp['dataSource'])).toBe(true)

    // 同时注入 DataView（props.dataView）并可调用方法
    expect(rp['dataView']).toBe(dv)
    expect(typeof (rp['dataView']?.loadFromServer)).toBe('function')
  })
})