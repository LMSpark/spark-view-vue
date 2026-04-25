import type { SparkDataDisplayProps, SparkNodeProps } from '../../shared-types'

export type TagType = 'success' | 'info' | 'warning' | 'danger'

export interface RTagProps extends SparkNodeProps, SparkDataDisplayProps<string> {
  /** 显式内容，优先级高于 value/field */
  content?: SparkText
  /** 标签类型 */
  tagType?: '' | TagType
  /** 动态类型映射（按值命中） */
  dynamicType?: Record<string, '' | TagType>
  /** 是否可关闭 */
  closable?: boolean
  /** 是否禁用过渡动画 */
  disableTransitions?: boolean
  /** 是否描边 */
  hit?: boolean
  /** 是否圆角 */
  round?: boolean
  /** 自定义颜色 */
  color?: SparkText
  /** 尺寸 */
  size?: 'large' | 'default' | 'small'
  /** 视觉效果 */
  effect?: 'dark' | 'light' | 'plain'
}
