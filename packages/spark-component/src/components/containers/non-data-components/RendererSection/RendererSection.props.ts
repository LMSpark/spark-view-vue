import type { SparkChildrenProps } from '../../../shared-types'
import type { HeaderNode } from '../../RendererHeader.types'

export interface RSectionProps extends SparkChildrenProps<'r-section'> {
  /** 结构化头部 */
  header?: HeaderNode
  /** 分区标题 */
  title?: string
  /** 分区描述 */
  description?: string
  /** 是否可折叠 */
  collapsible?: boolean
  /** 默认折叠 */
  defaultCollapsed?: boolean
  /** 显示边框 */
  bordered?: boolean
  /** 使用卡片样式 */
  useCard?: boolean
  /** 卡片阴影模式 */
  cardShadow?: 'always' | 'hover' | 'never'
  /** 内容区 CSS 类名 */
  bodyClass?: string
  /** 展开文案 */
  expandText?: string
  /** 收起文案 */
  collapseText?: string
  /** 显示切换图标 */
  showToggleIcon?: boolean
  /** 展开图标文案 */
  expandIconText?: string
  /** 收起图标文案 */
  collapseIconText?: string
  /** CSS Grid 列数 */
  gridColumns?: number
  /** 栅格间距 */
  gridGap?: number | string
  /** 栅格行高 */
  gridAutoRows?: string
}
