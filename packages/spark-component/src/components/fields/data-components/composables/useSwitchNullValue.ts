/**
 * @module @spark-appworks/spark-component:components/fields/data-components/composables/useSwitchNullValue
 * @spark-appworks/spark-component:components/fields/data-components/composables/useSwitchNullValue 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: BoundBooleanColumn, UseSwitchNullValueOptions（共 2 个 symbol）。
 */
import { computed, watchEffect } from 'vue'
import type { DataRow } from '@spark-appworks/spark-data'
import type { ValueRef } from '../../../shared-types.js'
import { isDataViewEditingSource } from '../../context/dataViewEditing'

/** Bound Boolean Column 的语义模型。 */
type BoundBooleanColumn = {
    /** 类型标识。 */
type: string
    /** 是否 allow DBNull。 */
allowDBNull?: boolean | undefined}

/** Use Switch Null Value Options 的调用配置。 */
type UseSwitchNullValueOptions = {
    /** bound Column 字段。 */
boundColumn: ValueRef<BoundBooleanColumn | null | undefined>
    /** context Data 字段。 */
contextData: DataRow | null
    /** data Source 字段。 */
dataSource: unknown
    /** 绑定字段名。 */
fieldName: ValueRef<string>
    /** sync Value 回调。 */
syncValue: (value: boolean | null) => void}

export function useSwitchNullValue(options: UseSwitchNullValueOptions) {
  const normalizedEmptyValue = computed<boolean | null>(() => {
    const column = options.boundColumn.value
    if (!column) return false
    const colType = column.type.toLowerCase()
    if (colType !== 'boolean' && colType !== 'bool') return false
    return column.allowDBNull === true ? null : false
  })

  watchEffect(() => {
    const contextData = options.contextData
    const fieldName = options.fieldName.value
    if (fieldName.length === 0 || contextData === null) return
    const column = options.boundColumn.value
    if (!column) return
    const colType = column.type.toLowerCase()
    if (colType !== 'boolean' && colType !== 'bool') return
    const raw = contextData[fieldName]
    if (raw === '' || raw === undefined) {
      if (isDataViewEditingSource(options.dataSource) && options.dataSource.getPkKey(contextData) === undefined) return
      options.syncValue(normalizedEmptyValue.value)
    }
  })

  return {
    normalizedEmptyValue,
  }
}