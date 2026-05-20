import type { SparkNodeProps } from '../../shared-types'

export type RCardProps = SparkNodeProps & {
  /** 卡片头部文本 */
  header?: SparkText
  /** 阴影显示策略 */
  shadow?: 'always' | 'hover' | 'never'
  /** 卡片主体样式 */
  bodyStyle?: Record<string, unknown> | string
  /** 卡片主体 class */
  bodyClass?: SparkText
}
