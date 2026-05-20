import type { SparkNodeProps } from '../../shared-types'

export interface RDisplayIconProps extends SparkNodeProps {
  /** 图标名称（由项目图标注册表解析） */
    icon?: string
    /** 图标大小 */
    iconSize?: number | string
    /** 图标颜色 */
    color?: string
}
