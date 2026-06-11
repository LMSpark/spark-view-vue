/**
 * @module @spark-appworks/spark-component:components/display/non-data-components/DisplayDescriptions.props
 * DisplayDescriptions 模块，属于 SPARK component display/static-display。
 * 组件目录: display/non-data-components。
 * 导出 ClassModel symbol: RDescriptionsProps（共 1 个 symbol）。
 */
import type { SparkNodeProps } from '../../shared-types'

/** RDescriptions Props 的属性契约。 */
export type RDescriptionsProps = SparkNodeProps & {
  /** 描述列表标题 */
    title?: string
    /** 操作区附加内容 */
    extra?: string
    /** 是否显示边框 */
    border?: boolean
    /** 每行展示的描述列数 */
    column?: number
    /** 排列方向 */
    direction?: 'horizontal' | 'vertical'
    /** 尺寸 */
    descriptionsSize?: 'large' | 'default' | 'small'}
