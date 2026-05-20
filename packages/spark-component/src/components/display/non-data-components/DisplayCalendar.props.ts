import type { SparkNodeProps } from '../../shared-types'

export interface RDisplayCalendarProps extends SparkNodeProps {
  /** 当前日期 */
    value?: Date
    /** 日期范围 [start, end] */
    range?: [Date, Date]
}
