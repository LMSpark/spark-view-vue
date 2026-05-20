import type { SparkNodeProps } from '../../shared-types'

export interface RPopconfirmProps extends SparkNodeProps {
  /** 确认框标题 */
    title?: string
    /** 确认按钮文案 */
    confirmButtonText?: string
    /** 取消按钮文案 */
    cancelButtonText?: string
    /** 确认按钮类型 */
    confirmButtonType?: '' | 'default' | 'primary' | 'success' | 'warning' | 'info' | 'danger'
    /** 取消按钮类型 */
    cancelButtonType?: '' | 'default' | 'primary' | 'success' | 'warning' | 'info' | 'danger'
    /** 图标名称 */
    icon?: string
    /** 图标颜色 */
    iconColor?: string
    /** 是否隐藏图标 */
    hideIcon?: boolean
    /** 自动隐藏延迟（毫秒） */
    hideAfter?: number
    /** 浮层宽度 */
    width?: number | string
}
