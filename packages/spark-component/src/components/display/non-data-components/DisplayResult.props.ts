/**
 * @module @spark-appworks/spark-component:components/display/non-data-components/DisplayResult.props
 * DisplayResult 模块，属于 SPARK component display/static-display。
 * 组件目录: display/non-data-components。
 * 导出 ClassModel symbol: RResultProps（共 1 个 symbol）。
 */
import type { SparkNodeProps } from '../../shared-types'

/** RResult Props 的属性契约。 */
export type RResultProps = SparkNodeProps & {
  /** 结果图标类型 */
    icon?: 'success' | 'warning' | 'info' | 'error'
    /** 结果标题 */
    title?: string
    /** 结果副标题 */
    subTitle?: string}
