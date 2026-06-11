/**
 * @module @spark-appworks/spark-component:components/fields/data-components/FieldTimeSelect.props
 * FieldTimeSelect 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: RTimeSelectProps（共 1 个 symbol）。
 */
import type { SparkFieldSemanticProps, SparkNodeProps } from '../../shared-types'

/** RTime Select Props 的属性契约。 */
export type RTimeSelectProps = SparkNodeProps & SparkFieldSemanticProps<string> & {
  /** 可选时间段的起始时间。 */
    start?: string
    /** 可选时间段的结束时间。 */
    end?: string
    /** 相邻时间选项之间的步长。 */
    step?: string
    /** 可选择的最小时间。 */
    minTime?: string
    /** 可选择的最大时间。 */
    maxTime?: string}
