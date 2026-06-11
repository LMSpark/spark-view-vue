/**
 * @module @spark-appworks/spark-component:components/fields/data-components/FieldIcon.props
 * FieldIcon 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: RIconProps（共 1 个 symbol）。
 */
import type { SparkNodeProps, SparkOptionFieldProps } from '../../shared-types'

/** RIcon Props 的属性契约。 */
export type RIconProps = SparkNodeProps & SparkOptionFieldProps<string> & {
  /** 图标名称解析时使用的 class 前缀。 */
    classPrefix?: string}
