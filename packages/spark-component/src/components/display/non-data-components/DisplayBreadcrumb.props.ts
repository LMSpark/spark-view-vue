import type { SparkNodeProps } from '../../shared-types'

export type RBreadcrumbProps = SparkNodeProps & {
  /** 分隔符文本，例如 `/` 或 `>` */
    separator?: string
    /** 分隔符图标名，优先级高于 separator 文本 */
    separatorIcon?: string}
