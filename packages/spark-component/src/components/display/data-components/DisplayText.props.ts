import type { SparkDataDisplayProps, SparkNodeProps } from '../../shared-types'

export interface RTextDisplayProps extends SparkNodeProps, SparkDataDisplayProps<unknown> {
  /** 包裹标签名，如 span/div */
  tag?: string
  /** 前缀 */
  prefix?: string
  /** 后缀 */
  suffix?: string
  /** 格式化方式 */
  format?: 'number' | 'currency' | 'percent' | 'date'
  /** 小数精度 */
  precision?: number
  /** 空值占位文本 */
  placeholder?: string
  /** 文本 class */
  textClass?: string
  /** 文本样式 */
  textStyle?: Record<string, unknown> | string
}
