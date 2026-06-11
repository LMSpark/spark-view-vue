/**
 * @module @spark-appworks/spark-component:components/display/non-data-components/DisplayCalendar.props
 * DisplayCalendar 模块，属于 SPARK component display/static-display。
 * 组件目录: display/non-data-components。
 * 导出 ClassModel symbol: RDisplayCalendarProps（共 1 个 symbol）。
 */
import type { SparkNodeProps } from '../../shared-types'

/** RDisplay Calendar Props 的属性契约。 */
export type RDisplayCalendarProps = SparkNodeProps & {
  /** 当前日期 */
    value?: Date
    /** 日期范围 [start, end] */
    range?: [Date, Date]}
