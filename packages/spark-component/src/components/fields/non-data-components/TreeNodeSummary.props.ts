import type { SparkNodeProps } from '../../shared-types'

export interface RTreeNodeSummaryProps extends SparkNodeProps {
  /** 名称字段名 */
  nameField?: string
  /** 类型字段名 */
  typeField?: string
  /** 状态字段名 */
  statusField?: string
  /** 负责人字段名 */
  ownerField?: string
  /** 元信息字段名 */
  metaField?: string
  /** 扩展字段名 */
  extraField?: string
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
