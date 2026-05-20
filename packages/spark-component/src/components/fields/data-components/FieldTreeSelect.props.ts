import type { SparkHierarchicalOptionFieldProps, SparkNodeProps } from '../../shared-types'

export type TreeSelectPrimitive = string | number | boolean
export type TreeSelectValue = TreeSelectPrimitive | TreeSelectPrimitive[]

export type RTreeSelectProps = SparkNodeProps & SparkHierarchicalOptionFieldProps<TreeSelectValue> & {
  /** 初次渲染时是否默认展开全部节点。 */
  defaultExpandAll?: boolean
  /** 是否在节点展开后再渲染其子节点。 */
  renderAfterExpand?: boolean
}
