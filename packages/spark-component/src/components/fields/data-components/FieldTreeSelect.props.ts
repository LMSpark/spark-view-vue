/**
 * @module @spark-appworks/spark-component:components/fields/data-components/FieldTreeSelect.props
 * FieldTreeSelect 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: RTreeSelectProps（共 1 个 symbol）。
 */
import type { SparkHierarchicalOptionFieldProps, SparkNodeProps } from '../../shared-types'

// 这里不再为 JS 基础类型保留导出别名，树选值直接使用原生联合类型。

/** RTree Select Props 的属性契约。 */
export type RTreeSelectProps = SparkNodeProps & SparkHierarchicalOptionFieldProps<string | number | boolean | Array<string | number | boolean>> & {
  /** 初次渲染时是否默认展开全部节点。 */
    defaultExpandAll?: boolean
    /** 是否在节点展开后再渲染其子节点。 */
    renderAfterExpand?: boolean}
