import type { SparkRangeFilterProps, SparkTemporalPickerProps } from '../../shared-types'

export type DatePickerType =
  | 'year' | 'month' | 'date' | 'dates' | 'datetime'
  | 'week' | 'datetimerange' | 'daterange' | 'monthrange' | 'yearrange'

export interface RDateProps extends SparkTemporalPickerProps, SparkRangeFilterProps {
  value?: string | Date | Array<string | Date>
  dateType?: DatePickerType
  valueFormat?: string
}
