import type { SparkNodeProps } from '../../shared-types'

export type RDisplayCalendarProps = SparkNodeProps & {
/** 当前日期 */
  value?: Date
  /** 日期范围 [start, end] */
  range?: [Date, Date]
}
