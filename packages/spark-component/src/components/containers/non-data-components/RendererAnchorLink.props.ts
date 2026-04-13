import type { SparkComponentBaseProps } from '../../shared-types'

export interface RAnchorLinkProps extends SparkComponentBaseProps<'r-anchor-link'> {
  /** 锚点链接 */
  href?: string
  /** 链接标题 */
  title?: string
}
