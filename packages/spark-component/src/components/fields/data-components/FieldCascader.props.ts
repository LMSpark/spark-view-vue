/**
 * @module @spark-appworks/spark-component:components/fields/data-components/FieldCascader.props
 * FieldCascader 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: CascaderPath, CascaderValue, RCascaderProps（共 3 个 symbol）。
 */
import type { SparkHierarchicalOptionFieldProps, SparkNodeProps } from '../../shared-types'

/** Cascader Path 的语义模型。 */
export type CascaderPath = Array<string | number | boolean>
/** Cascader Value 的语义模型。 */
export type CascaderValue = CascaderPath | CascaderPath[]

/** RCascader Props 的属性契约。 */
export type RCascaderProps = SparkNodeProps & SparkHierarchicalOptionFieldProps<CascaderValue> & {
  /** 选中结果是否保留完整路径。 */
    emitPath?: boolean}
