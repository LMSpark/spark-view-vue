import type { SparkNodeProps } from '../../shared-types'

export type RAnchorLinkProps = SparkNodeProps & {
  /** 锚点链接 */
  href?: SparkText
  /** 链接标题 */
  title?: SparkText
}
