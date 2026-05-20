import type { SparkDataDisplayProps, SparkNodeProps } from '../../shared-types'

export type ProgressColor = string | Array<{ color: SparkText; percentage: number }>

export type RProgressProps = SparkNodeProps & SparkDataDisplayProps<number> & {
  /** 百分比值（优先级高于 value/field） */
  percentage?: number
  /** 进度条类型 */
  progressType?: 'line' | 'circle' | 'dashboard'
  /** 线宽 */
  strokeWidth?: number
  /** 线形时文本是否内嵌 */
  textInside?: boolean
  /** 状态 */
  status?: 'success' | 'exception' | 'warning'
  /** 是否不确定进度 */
  indeterminate?: boolean
  /** 动画时长（毫秒） */
  duration?: number
  /** 进度色 */
  color?: ProgressColor
  /** 圆形进度宽度 */
  circleWidth?: number
  /** 是否显示文本 */
  showText?: boolean
  /** 线帽样式 */
  strokeLinecap?: 'butt' | 'round' | 'square'
  /** 文本模板 */
  formatText?: SparkText
}
