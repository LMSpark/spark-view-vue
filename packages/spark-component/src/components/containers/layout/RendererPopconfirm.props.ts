import type { SparkNodeProps } from '../../shared-types'

export type RPopconfirmProps = SparkNodeProps & {
  /** 确认框标题 */
  title?: SparkText
  /** 确认按钮文案 */
  confirmButtonText?: SparkText
  /** 取消按钮文案 */
  cancelButtonText?: SparkText
  /** 确认按钮类型 */
  confirmButtonType?: '' | 'default' | 'primary' | 'success' | 'warning' | 'info' | 'danger'
  /** 取消按钮类型 */
  cancelButtonType?: '' | 'default' | 'primary' | 'success' | 'warning' | 'info' | 'danger'
  /** 图标名称 */
  icon?: SparkText
  /** 图标颜色 */
  iconColor?: SparkText
  /** 是否隐藏图标 */
  hideIcon?: boolean
  /** 自动隐藏延迟（毫秒） */
  hideAfter?: number
  /** 浮层宽度 */
  width?: number | string
}
