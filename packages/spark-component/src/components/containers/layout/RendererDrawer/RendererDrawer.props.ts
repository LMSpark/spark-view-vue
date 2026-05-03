import type {
  SparkGridLayoutProps,
  SparkNodeProps,
  SparkVisibilityContainerProps,
} from '../../../shared-types'
import type { RendererFooterProps } from '../../zones/RendererFooter.types'
import type { RendererHeaderProps } from '../../zones/RendererHeader.types'

export interface RDrawerProps
  extends SparkNodeProps,
    SparkVisibilityContainerProps,
    SparkGridLayoutProps {
  /** 结构化头部 @componentRef r-header */
  header?: RendererHeaderProps
  /** 结构化底部 @componentRef r-footer */
  footer?: RendererFooterProps
  /** 抽屉标题 */
  title?: SparkText
  /** 控制显隐 */
  modelValue?: boolean
  /** 内容区 CSS 类名 */
  bodyClass?: SparkText
}
