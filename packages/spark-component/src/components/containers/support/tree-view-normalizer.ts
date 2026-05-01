import { SparkData, type DataView, type IDataRow } from '@spark-view/spark-data'

interface TreeSeedNode extends Record<string, unknown> {
  id: string | number
  name: string
  parentId?: string | number | null
}

export interface NormalizeRowsToNestedTreeOptions<TRow extends IDataRow> {
  view: DataView | null | undefined
  rows: TRow[]
  idField?: string
  parentIdField?: string
  textField?: string
  requireParentLink?: boolean
  resolveLabel?: (row: TRow, context: { textField: string; id: string | number }) => string
}

/**
 * 将平铺 rows 归一化为 nested tree。
 *
 * 语义：
 * - rows 已是 nested children 时原样返回
 * - 无 view/treeConfig 或无有效节点时原样返回
 * - requireParentLink=true 且没有任何 parentId 关系时原样返回
 */
export function normalizeRowsToNestedTree<TRow extends IDataRow>(options: NormalizeRowsToNestedTreeOptions<TRow>): TRow[] {
  const { view, rows } = options
  if (!view || rows.length === 0) return rows

  if (rows.some(row => Array.isArray((row as Record<string, unknown> | undefined)?.['children']))) {
    return rows
  }

  const treeConfig = view.treeConfig
  if (!treeConfig) return rows

  const idField = options.idField ?? treeConfig.idField ?? view.primaryKey
  const parentIdField = options.parentIdField ?? treeConfig.parentIdField ?? 'parentId'
  const textField = options.textField ?? treeConfig.textField ?? 'label'

  const seedNodes: TreeSeedNode[] = []
  let hasParentLink = false

  for (const row of rows) {
    const record = row as Record<string, unknown>
    const rawId = record[idField]
    if (typeof rawId !== 'string' && typeof rawId !== 'number') {
      continue
    }

    const rawParentId = record[parentIdField]
    const parentId = typeof rawParentId === 'string' || typeof rawParentId === 'number'
      ? rawParentId
      : rawParentId === null || rawParentId === undefined
        ? null
        : String(rawParentId)

    if (parentId !== null) {
      hasParentLink = true
    }

    const label = options.resolveLabel
      ? options.resolveLabel(row, { textField, id: rawId })
      : (typeof record[textField] === 'string' ? record[textField] : String(record[textField] ?? rawId))

    seedNodes.push({
      ...record,
      id: rawId,
      parentId,
      name: label,
    })
  }

  if (seedNodes.length === 0) return rows
  if (options.requireParentLink === true && !hasParentLink) return rows

  return SparkData.createTreeManager({
    idField,
    parentIdField,
    textField,
    treeMode: 'nested',
  }, seedNodes).buildNestedTree() as unknown as TRow[]
}
