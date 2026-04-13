import type { SparkComponentBaseProps } from '../../shared-types'

export interface RTreeNodeSummaryProps extends SparkComponentBaseProps<'r-tree-node-summary'> {
  nameField?: string
  typeField?: string
  statusField?: string
  ownerField?: string
  metaField?: string
  extraField?: string
  showType?: boolean
  showStatus?: boolean
  showOwner?: boolean
  showMeta?: boolean
  showExtra?: boolean
}
