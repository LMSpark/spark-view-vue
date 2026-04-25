import type { SparkNodeProps } from '../../shared-types'

export interface RBreadcrumbProps extends SparkNodeProps {
  /** 分隔符文本，例如 `/` 或 `>` */
  separator?: SparkText
  /** 分隔符图标名，优先级高于 separator 文本 */
  separatorIcon?: SparkText
}
