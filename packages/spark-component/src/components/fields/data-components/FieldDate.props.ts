import type { SparkFieldProps } from '../../shared-types'

export type DatePickerType =
  | 'year' | 'month' | 'date' | 'dates' | 'datetime'
  | 'week' | 'datetimerange' | 'daterange' | 'monthrange' | 'yearrange'

export interface RDateProps extends SparkFieldProps<'r-date'> {
  width?: number
  modelValue?: string | Date | Array<string | Date>
  dateType?: DatePickerType
  startPlaceholder?: string
  endPlaceholder?: string
  rangeSeparator?: string
  format?: string
  valueFormat?: string
  clearable?: boolean
  filterMode?: string
  filterVariant?: string
  filterRange?: boolean
}
