import type { SparkChildrenProps, SparkTitleContentProps } from '../../shared-types'

export interface RPageHeaderProps extends SparkChildrenProps<'r-page-header'>, SparkTitleContentProps {
  /** 图标名称 */
  icon?: string
}
