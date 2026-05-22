import type { CSSProperties } from 'vue'
import type { SparkNodeProps } from '../../shared-types'

export type RDisplayCountdownProps = SparkNodeProps & {
  /** 目标时间（时间戳或 Date） */
    value?: number | Date
    /** 格式化字符串，如 HH:mm:ss */
    format?: string
    /** 前缀文本 */
    prefix?: string
    /** 后缀文本 */
    suffix?: string
    /** 标题 */
    title?: string
    /** 值样式 */
    valueStyle?: CSSProperties}
