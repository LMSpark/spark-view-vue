import type { SparkNodeProps } from '../../shared-types'

export interface RAlertProps extends SparkNodeProps {
  /** 标题 */
  title?: SparkText
  /** 描述文本 */
  description?: SparkText
  /** 提示类型 */
  alertType?: 'success' | 'warning' | 'info' | 'error'
  /** 是否可关闭 */
  closable?: boolean
  /** 关闭按钮文本 */
  closeText?: SparkText
  /** 是否居中 */
  center?: boolean
  /** 是否显示图标 */
  showIcon?: boolean
  /** 主题效果 */
  effect?: 'light' | 'dark'
}
