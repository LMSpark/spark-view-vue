import type {
  SparkGridLayoutProps,
  SparkNodeProps,
  SparkVisibilityContainerProps,
} from '../../../shared-types'
import type { RFooterProps } from '../../zones/RendererFooter.types'
import type { RHeaderProps } from '../../zones/RendererHeader.types'

export type RDrawerProps = SparkNodeProps & SparkVisibilityContainerProps & SparkGridLayoutProps & {
  /** 结构化头部 */
  header?: RHeaderProps
  /** 结构化底部 */
  footer?: RFooterProps
  /** 抽屉标题 */
  title?: SparkText
  /** 控制显隐 */
  modelValue?: boolean
  /** 内容区 CSS 类名 */
  bodyClass?: SparkText
}
