import type { SparkChildrenProps, SparkVisibilityEventProps } from '../../../shared-types'
import type { FooterNode } from '../../RendererFooter.types'
import type { HeaderNode } from '../../RendererHeader.types'

export interface RDrawerProps extends SparkChildrenProps<'r-drawer'>, SparkVisibilityEventProps {
  /** 结构化头部 */
  header?: HeaderNode
  /** 结构化底部 */
  footer?: FooterNode
  /** 抽屉标题 */
  title?: string
  /** 控制显隐（v-model） */
  modelValue?: boolean
  /** 内容区 CSS 类名 */
  bodyClass?: string
  /** CSS Grid 列数 */
  gridColumns?: number
  /** 栅格间距 */
  gridGap?: number | string
  /** 栅格行高 */
  gridAutoRows?: string
}
