import type { SparkHierarchicalOptionFieldProps, SparkNodeProps } from '../../shared-types'

// 这里不再为 JS 基础类型保留导出别名，树选值直接使用原生联合类型。

export type RTreeSelectProps = SparkNodeProps & SparkHierarchicalOptionFieldProps<string | number | boolean | Array<string | number | boolean>> & {
  /** 初次渲染时是否默认展开全部节点。 */
    defaultExpandAll?: boolean
    /** 是否在节点展开后再渲染其子节点。 */
    renderAfterExpand?: boolean}
