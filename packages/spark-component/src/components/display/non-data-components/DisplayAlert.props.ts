/**
 * @module @spark-appworks/spark-component:components/display/non-data-components/DisplayAlert.props
 * DisplayAlert 模块，属于 SPARK component display/static-display。
 * 组件目录: display/non-data-components。
 * 导出 ClassModel symbol: RAlertProps（共 1 个 symbol）。
 */
import type { SparkNodeProps } from '../../shared-types'

/** RAlert Props 的属性契约。 */
export type RAlertProps = SparkNodeProps & {
  /** 标题 */
    title?: string
    /** 描述文本 */
    description?: string
    /** 提示类型 */
    alertType?: 'success' | 'warning' | 'info' | 'error'
    /** 是否可关闭 */
    closable?: boolean
    /** 关闭按钮文本 */
    closeText?: string
    /** 是否居中 */
    center?: boolean
    /** 是否显示图标 */
    showIcon?: boolean
    /** 主题效果 */
    effect?: 'light' | 'dark'}
