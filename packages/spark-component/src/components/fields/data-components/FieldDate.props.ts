/**
 * @module @spark-appworks/spark-component:components/fields/data-components/FieldDate.props
 * FieldDate 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: DatePickerType, RDateProps（共 2 个 symbol）。
 */
import type { SparkNodeProps, SparkRangeTemporalFieldProps } from '../../shared-types'

/** Date Picker Type 的语义模型。 */
export type DatePickerType =
  | 'year' | 'month' | 'date' | 'dates' | 'datetime'
  | 'week' | 'datetimerange' | 'daterange' | 'monthrange' | 'yearrange'

/** RDate Props 的属性契约。 */
export type RDateProps = SparkNodeProps & SparkRangeTemporalFieldProps<string | Date | Array<string | Date>> & {
  /** 日期选择器模式。 */
    dateType?: DatePickerType
    /** 提交值时使用的格式化模板。 */
    valueFormat?: string}
