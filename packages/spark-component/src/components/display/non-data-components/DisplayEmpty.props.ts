/**
 * @module @spark-appworks/spark-component:components/display/non-data-components/DisplayEmpty.props
 * DisplayEmpty 模块，属于 SPARK component display/static-display。
 * 组件目录: display/non-data-components。
 * 导出 ClassModel symbol: REmptyProps（共 1 个 symbol）。
 */
import type { SparkNodeProps } from '../../shared-types'

/** REmpty Props 的属性契约。 */
export type REmptyProps = SparkNodeProps & {
  /** 空状态图片地址 */
    image?: string
    /** 图片尺寸（像素） */
    imageSize?: number
    /** 空状态描述文案 */
    description?: string}
