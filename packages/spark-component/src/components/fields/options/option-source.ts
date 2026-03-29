import { SparkData, type DataView } from '@spark-view/spark-data'

interface TreeOptionSeedNode extends Record<string, unknown> {
  id: string | number
  name: string
  parentId?: string | number | null
}

export function buildOptionSourceFromView(
  view: DataView,
  labelField: string,
  childrenField: string,
): unknown[] {
  const rows = view.rows
  if (rows.some(row => Array.isArray((row as Record<string, unknown> | undefined)?.[childrenField]))) {
    return rows
  }

  const treeConfig = view.treeConfig
  if (!treeConfig) return rows

  const idField = treeConfig.idField ?? view.primaryKey
  const parentIdField = treeConfig.parentIdField ?? 'parentId'
  const textField = treeConfig.textField ?? labelField

  const seedNodes: TreeOptionSeedNode[] = rows.flatMap(row => {
    const record = row as Record<string, unknown>
    const rawId = record[idField]
    if (typeof rawId !== 'string' && typeof rawId !== 'number') {
      return []
    }

    const rawParentId = record[parentIdField]
    const parentId = typeof rawParentId === 'string' || typeof rawParentId === 'number'
      ? rawParentId
      : rawParentId === null || rawParentId === undefined
        ? null
        : String(rawParentId)

    const rawText = record[textField]

    return [{
      ...record,
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