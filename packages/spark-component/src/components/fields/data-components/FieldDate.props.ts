import type { SparkNodeProps, SparkRangeTemporalFieldProps } from '../../shared-types'

export type DatePickerType =
  | 'year' | 'month' | 'date' | 'dates' | 'datetime'
  | 'week' | 'datetimerange' | 'daterange' | 'monthrange' | 'yearrange'

export type RDateProps = SparkNodeProps & SparkRangeTemporalFieldProps<string | Date | Array<string | Date>> & {
  /** 日期选择器模式。 */
  dateType?: DatePickerType
  /** 提交值时使用的格式化模板。 */
  valueFormat?: SparkText
}
