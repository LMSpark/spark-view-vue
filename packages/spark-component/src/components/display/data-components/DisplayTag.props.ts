/**
 * @module @spark-appworks/spark-component:components/display/data-components/DisplayTag.props
 * DisplayTag 模块，属于 SPARK component display/data-display。
 * 组件目录: display/data-components。
 * 导出 ClassModel symbol: TagType, RTagProps（共 2 个 symbol）。
 */
import type { SparkDataDisplayProps, SparkNodeProps } from '../../shared-types'

/** Tag Type 的语义模型。 */
export type TagType = 'success' | 'info' | 'warning' | 'danger'

/** RTag Props 的属性契约。 */
export type RTagProps = SparkNodeProps & SparkDataDisplayProps<string> & {
  /** 显式内容，优先级高于 value/field */
    content?: string
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
    color?: string
    /** 尺寸 */
    size?: 'large' | 'default' | 'small'
    /** 视觉效果 */
    effect?: 'dark' | 'light' | 'plain'}
