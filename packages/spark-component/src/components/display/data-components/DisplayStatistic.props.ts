import type { SparkDataDisplayProps, SparkNodeProps } from '../../shared-types'

export interface RStatisticProps extends SparkNodeProps, SparkDataDisplayProps<number | string> {
  /** 统计标题 */
  title?: SparkText
  /** DataView 输出读取键 */
  dataKey?: SparkText
  /** 小数精度 */
  precision?: number
  /** 小数分隔符 */
  decimalSeparator?: SparkText
  /** 千分位分隔符 */
  groupSeparator?: SparkText
  /** 前缀 */
  prefix?: SparkText
  /** 后缀 */
  suffix?: SparkText
  /** 数值样式 */
  valueStyle?: Record<string, unknown> | string
}
