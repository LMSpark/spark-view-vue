import type { SparkDataDisplayProps, SparkNodeProps } from '../../shared-types'

export interface RTextDisplayProps extends SparkNodeProps, SparkDataDisplayProps<unknown> {
  /** 包裹标签名，如 span/div */
  tag?: SparkText
  /** 前缀 */
  prefix?: SparkText
  /** 后缀 */
  suffix?: SparkText
  /** 格式化方式 */
  format?: 'number' | 'currency' | 'percent' | 'date'
  /** 小数精度 */
  precision?: number
  /** 空值占位文本 */
  placeholder?: SparkText
  /** 文本 class */
  textClass?: SparkText
  /** 文本样式 */
  textStyle?: Record<string, unknown> | string
}
