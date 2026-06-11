/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererPopconfirm.props
 * RendererPopconfirm 模块，属于 SPARK component container/layout-container。
 * 组件目录: containers/layout。
 * 导出 ClassModel symbol: RPopconfirmProps（共 1 个 symbol）。
 */
import type { SparkNodeProps } from '../../shared-types'

/** RPopconfirm Props 的属性契约。 */
export type RPopconfirmProps = SparkNodeProps & {
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
    width?: number | string}
