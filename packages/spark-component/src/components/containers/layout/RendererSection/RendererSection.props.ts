import type { SparkGridLayoutProps, SparkNodeProps } from '../../../shared-types'
import type { RendererHeaderProps } from '../../page-frame/RendererHeader.types'

export interface RSectionProps extends SparkNodeProps, SparkGridLayoutProps {
  /** 结构化头部 @componentRef r-header */
  header?: RendererHeaderProps
  /** 分区标题 */
  title?: SparkText
  /** 分区描述 */
  description?: SparkText
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
  bodyClass?: SparkText
  /** 展开文案 */
  expandText?: SparkText
  /** 收起文案 */
  collapseText?: SparkText
  /** 显示切换图标 */
  showToggleIcon?: boolean
  /** 展开图标文案 */
  expandIconText?: SparkText
  /** 收起图标文案 */
  collapseIconText?: SparkText
}
