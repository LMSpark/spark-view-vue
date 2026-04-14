import type { SparkNodeProps, SparkValueBindingProps } from '../../shared-types'

export interface RStatisticProps extends SparkNodeProps, SparkValueBindingProps<number | string> {
  /** 统计标题 */
  title?: string
  /** 数据绑定键（值级绑定） */
  dataKey?: string
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
  valueStyle?: Record<string, unknown> | string
}
