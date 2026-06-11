/**
 * @module @spark-appworks/spark-component:components/fields/context/tableColumnContext
 * @spark-appworks/spark-component 的 components/fields/context/tableColumnContext 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
import type { ComputedRef, InjectionKey } from 'vue'

export const TABLE_COLUMN_RESIZABLE_KEY: InjectionKey<ComputedRef<boolean>> = Symbol('spark-table-column-resizable')
