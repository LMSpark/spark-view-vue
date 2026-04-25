import type { SparkNodeProps } from '../../shared-types'

export interface RAnchorLinkProps extends SparkNodeProps {
  /** 锚点链接 */
  href?: SparkText
  /** 链接标题 */
  title?: SparkText
}
