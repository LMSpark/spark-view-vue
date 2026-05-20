import type { SparkNodeProps } from '../../shared-types'

export type RTreeNodeSummaryProps = SparkNodeProps & {
  /** 名称字段名 */
  nameField?: SparkText
  /** 类型字段名 */
  typeField?: SparkText
  /** 状态字段名 */
  statusField?: SparkText
  /** 负责人字段名 */
  ownerField?: SparkText
  /** 元信息字段名 */
  metaField?: SparkText
  /** 扩展字段名 */
  extraField?: SparkText
  /** 是否展示类型 */
  showType?: boolean
  /** 是否展示状态 */
  showStatus?: boolean
  /** 是否展示负责人 */
  showOwner?: boolean
  /** 是否展示元信息 */
  showMeta?: boolean
  /** 是否展示扩展信息 */
  showExtra?: boolean
}
