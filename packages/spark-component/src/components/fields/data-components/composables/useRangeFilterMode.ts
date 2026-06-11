/**
 * @module @spark-appworks/spark-component:components/fields/data-components/composables/useRangeFilterMode
 * @spark-appworks/spark-component:components/fields/data-components/composables/useRangeFilterMode 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
import { computed } from 'vue'
import type { SparkRangeFilterProps } from '../../../shared-types.js'

export function useRangeFilterMode(props: SparkRangeFilterProps) {
  return computed(() => props.filterMode === 'range')
}