/**
 * @module @spark-appworks/spark-component:components/display/non-data-components/DisplayCountdown.props
 * DisplayCountdown 模块，属于 SPARK component display/static-display。
 * 组件目录: display/non-data-components。
 * 导出 ClassModel symbol: RDisplayCountdownProps（共 1 个 symbol）。
 */
import type { CSSProperties } from 'vue'
import type { SparkNodeProps } from '../../shared-types'

/** RDisplay Countdown Props 的属性契约。 */
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
