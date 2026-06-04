import { SparkData, type DataView, type FlatTreeNode } from '@spark-appworks/spark-data'

export function buildOptionSourceFromView(
  view: DataView,
  labelField: string,
  childrenField: string,
): unknown[] {
  const rows = view.rows
  if (rows.some(row => Array.isArray(row[childrenField]))) {
    return rows
  }

  const treeConfig = view.treeConfig
  if (!treeConfig) return rows

  // 优先复用 DataView 内部已同步的 TreeManager
  if (view.treeManager) {
    return view.treeManager.buildNestedTree()
  }

  const idField = treeConfig.idField ?? view.primaryKey
  const parentIdField = treeConfig.parentIdField ?? 'parentId'
  const textField = treeConfig.textField ?? labelField

  const seedNodes: FlatTreeNode[] = rows.flatMap(row => {
    const rawId = row[idField]
    if (typeof rawId !== 'string' && typeof rawId !== 'number') {
      return []
    }

    const rawParentId = row[parentIdField]
    const parentId = typeof rawParentId === 'string' || typeof rawParentId === 'number'
      ? rawParentId
      : rawParentId === null || rawParentId === undefined
        ? null
        : String(rawParentId)

    const rawText = row[textField]

    return [{
      ...row,
      id: rawId,
      parentId,
      name: typeof rawText === 'string'
        ? rawText
        : String(rawText ?? rawId),
    }]
  })

  if (seedNodes.length === 0) return rows

  return SparkData.createTreeManager({
    idField,
    parentIdField,
    textField,
    treeMode: 'nested',
  }, seedNodes).buildNestedTree()
}
