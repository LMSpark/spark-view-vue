/**
 * @module @spark-appworks/spark-component:components/display/data-components/DisplayStatistic.props
 * DisplayStatistic 模块，属于 SPARK component display/data-display。
 * 组件目录: display/data-components。
 * 导出 ClassModel symbol: RStatisticProps（共 1 个 symbol）。
 */
import type { SparkDataDisplayProps, SparkNodeProps } from '../../shared-types'

/** RStatistic Props 的属性契约。 */
export type RStatisticProps = SparkNodeProps & SparkDataDisplayProps<number | string> & {
  /** 统计标题 */
    title?: string
    /** 小数精度 */
    precision?: number
    /** 小数分隔符 */
    decimalSeparator?: string
    /** 千分位分隔符 */
    groupSeparator?: string
    /** 前缀 */
    prefix?: string
    /** 后缀 */
    suffix?: string
    /** 数值样式 */
    valueStyle?: Record<string, unknown> | string}
