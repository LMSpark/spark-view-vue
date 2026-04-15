import type {
  SparkGridLayoutProps,
  SparkNodeProps,
  SparkVisibilityContainerProps,
} from '../../../shared-types'
import type { FooterNode } from '../../RendererFooter.types'
import type { HeaderNode } from '../../RendererHeader.types'

export interface RDrawerProps
  extends SparkNodeProps,
    SparkVisibilityContainerProps,
    SparkGridLayoutProps {
  /** 结构化头部 */
  header?: HeaderNode
  /** 结构化底部 */
  footer?: FooterNode
  /** 抽屉标题 */
  title?: string
  /** 控制显隐 */
  value?: boolean
  /** 内容区 CSS 类名 */
  bodyClass?: string
}
