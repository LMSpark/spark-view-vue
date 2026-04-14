import type { SparkNodeProps } from '../../shared-types'

export interface RDisplayIconProps extends SparkNodeProps {
/** 图标名称（Element Plus 图标名，如 'Edit', 'Delete', 'Search'） */
  icon?: string
  /** 图标大小 */
  iconSize?: number | string
  /** 图标颜色 */
  color?: string
}
