import type { SparkFieldProps, SparkNodeProps } from '../../shared-types'

export type ProgressColor = string | Array<{ color: string; percentage: number }>

export interface RProgressProps extends SparkNodeProps {
  /** 显式进度值 */
  value?: number
  /** 数据字段绑定键（通常映射到当前行 field） */
  field?: SparkFieldProps['field']
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
  formatText?: string
}
