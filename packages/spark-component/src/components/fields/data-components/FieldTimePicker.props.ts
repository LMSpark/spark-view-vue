/**
 * @module @spark-appworks/spark-component:components/fields/data-components/FieldTimePicker.props
 * FieldTimePicker 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: RTimePickerProps（共 1 个 symbol）。
 */
import type { SparkNodeProps, SparkTemporalPickerProps } from '../../shared-types'

/** RTime Picker Props 的属性契约。 */
export type RTimePickerProps = SparkNodeProps & SparkTemporalPickerProps<string | Date> & {
  /** 是否启用时间范围选择。 */
    isRange?: boolean
    /** 是否使用箭头调整时间。 */
    arrowControl?: boolean}
