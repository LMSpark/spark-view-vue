import type { SparkChildrenProps } from '../../shared-types'

export interface RLinkProps extends SparkChildrenProps<'r-link'> {
  /** 链接文本 */
  label?: string
  /** 链接类型 */
  linkType?: '' | 'default' | 'primary' | 'success' | 'warning' | 'info' | 'danger'
  /** 是否显示下划线 */
  underline?: boolean
  /** 跳转地址 */
  href?: string
  /** 跳转目标 */
  target?: '_blank' | '_self' | '_parent' | '_top'
}
