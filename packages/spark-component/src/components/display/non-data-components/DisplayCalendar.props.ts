import type { SparkComponentBaseProps } from '../../shared-types'

export interface RDisplayCalendarProps extends SparkComponentBaseProps<'display-calendar'> {
/** 当前日期 */
  modelValue?: Date
  /** 日期范围 [start, end] */
  range?: [Date, Date]
}
