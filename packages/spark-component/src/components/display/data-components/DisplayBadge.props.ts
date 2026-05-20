import type { SparkDataDisplayProps, SparkNodeProps } from '../../shared-types'

export type RBadgeProps = SparkNodeProps & SparkDataDisplayProps<string | number> & {
  /** 徽标显示值（优先使用该字段渲染角标）。 */
  badgeValue?: SparkText | number
  /** 徽标的最大显示阈值；超出后按 `99+` 这类形式展示。 */
  max?: number
  /** 是否仅显示小红点。 */
  isDot?: boolean
  /** 是否隐藏徽标。 */
  hiddenBadge?: boolean
  /** 徽标主题类型。 */
  badgeType?: '' | 'primary' | 'success' | 'warning' | 'info' | 'danger'
  /** 值为 0 时是否仍显示徽标。 */
  showZero?: boolean
  /** 自定义徽标颜色。 */
  color?: SparkText
  /** 徽标偏移量 [x, y]。 */
  offset?: [number, number]
  /** 徽标内联样式对象。 */
  badgeStyle?: object
  /** 徽标附加 class。 */
  badgeClass?: SparkText
}
