import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import {
  SparkData,
  type DataView,
  type IDataRow,
  type TreeConfig,
} from '@spark-view/spark-data'
import type { TreeNode } from './RendererTree/zero-code'
import type { DataViewState } from './view-runtime-state.js'

/** 树形视图态（RendererTree 专用扩展）。 */
export type RendererTreeViewState = DataViewState & {
  treeData: ComputedRef<TreeNode[]>
  treeIdField: ComputedRef<string>
}

/** SparkData.createTreeManager 消费的种子节点形状。 */
interface TreeManagerSeedNode extends Record<string, unknown> {
  id: string | number
  name: string
  parentId?: string | number | null
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function readStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function toMutableRows(rows: readonly IDataRow[]): IDataRow[] {
  return rows as IDataRow[]
}

function toTreeRows(rows: readonly IDataRow[]): TreeNode[] {
  return rows as unknown as TreeNode[]
}

function resolveParentId(rawParentId: unknown): string | number | null {
  if (typeof rawParentId === 'string' || typeof rawParentId === 'number') return rawParentId
  if (rawParentId === null || rawParentId === undefined) return null
  return String(rawParentId)
}

function isAlreadyNested(rows: readonly unknown[]): boolean {
  return rows.some(row => {
    const record = toRecord(row)
    if (!record) return false
    return Array.isArray(record['children'])
  })
}

function buildNestedTreeRows(
  idField: string,
  parentIdField: string,
  textField: string,
  seedNodes: TreeManagerSeedNode[],
): IDataRow[] {
  return SparkData.createTreeManager({
    idField,
    parentIdField,
    textField,
    treeMode: 'nested',
  }, seedNodes).buildNestedTree() as unknown as IDataRow[]
}

export function buildTreeTableRows(
  view: DataView | null | undefined,
  rows: readonly IDataRow[],
  treeConfig: TreeConfig | undefined,
  primaryKey: string | undefined,
): IDataRow[] {
  if (rows.length === 0) return []
  if (isAlreadyNested(rows)) return toMutableRows(rows)
  if (!treeConfig) return toMutableRows(rows)

  if (view?.treeManager) {
    return view.treeManager.buildNestedTree() as unknown as IDataRow[]
  }

  const idFieldRaw = treeConfig.idField ?? primaryKey
  if (typeof idFieldRaw !== 'string' || idFieldRaw.length === 0) return toMutableRows(rows)

  const idField = idFieldRaw
  const parentIdField = treeConfig.parentIdField ?? 'parentId'
  const textField = treeConfig.textField ?? 'label'

  const seedNodes: TreeManagerSeedNode[] = []
  let hasParentLink = false

  for (const row of rows) {
    const record = toRecord(row)
    if (!record) continue

    const rawId = record[idField]
    if (typeof rawId !== 'string' && typeof rawId !== 'number') continue

    const parentId = resolveParentId(record[parentIdField])
    if (parentId !== null) hasParentLink = true

    seedNodes.push({
      ...record,
      id: rawId,
      parentId,
      name: readStringField(record, textField) ?? String(record[textField] ?? rawId),
    })
  }

  if (seedNodes.length === 0 || !hasParentLink) return toMutableRows(rows)

  return buildNestedTreeRows(idField, parentIdField, textField, seedNodes)
}

type RendererTreeViewStateOptions = {
  dataState: DataViewState
}

export function useRendererTreeViewState(options: RendererTreeViewStateOptions): RendererTreeViewState {
  const { rows, treeConfig } = options.dataState

  const treeIdField = computed<string>(() => treeConfig.value?.idField ?? 'id')

  const treeData = computed<TreeNode[]>(() => {
    const resolvedRows = toTreeRows(rows.value)
    if (resolvedRows.length === 0) return []
    if (isAlreadyNested(resolvedRows)) return resolvedRows
    if (!treeConfig.value) return resolvedRows

    const view = options.dataState.resolvedView.value
    const idField = treeIdField.value
    const parentIdField = treeConfig.value.parentIdField ?? 'parentId'
    const textField = treeConfig.value.textField ?? 'label'

    if (view?.treeManager) {
      return view.treeManager.buildNestedTree() as unknown as TreeNode[]
    }

    const seedNodes: TreeManagerSeedNode[] = resolvedRows.flatMap(row => {
      const rawId = row[idField]
      if (typeof rawId !== 'string' && typeof rawId !== 'number') return []

      const rowRecord = row as Record<string, unknown>
      const displayText =
        readStringField(rowRecord, textField) ??
        readStringField(rowRecord, 'label') ??
        readStringField(rowRecord, 'name') ??
        readStringField(rowRecord, 'title') ??
        String(rawId)

      return [{
        ...row,
        id: rawId,
        parentId: resolveParentId(row[parentIdField]),
        name: displayText,
      }]
    })

    return toTreeRows(buildNestedTreeRows(idField, parentIdField, textField, seedNodes))
  })

  return {
    ...options.dataState,
    treeData,
    treeIdField,
  }
}
