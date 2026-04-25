import type { CSSProperties } from 'vue'
import type { SparkNodeProps } from '../../shared-types'

export interface RDisplayCountdownProps extends SparkNodeProps {
  /** 目标时间（时间戳或 Date） */
  value?: number | Date
  /** 格式化字符串，如 HH:mm:ss */
  format?: SparkText
  /** 前缀文本 */
  prefix?: SparkText
  /** 后缀文本 */
  suffix?: SparkText
  /** 标题 */
  title?: SparkText
  /** 值样式 */
  valueStyle?: CSSProperties
}
