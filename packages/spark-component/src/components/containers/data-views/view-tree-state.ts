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
import {
  resolveTreeNodeText,
  toDataRecord,
  toMutableRows,
} from './data-row-utils.js'

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

interface TreeFieldNames {
  idField: string
  parentIdField: string
  textField: string
}

interface TreeSeedBuildResult {
  seedNodes: TreeManagerSeedNode[]
  hasParentLink: boolean
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
    const record = toDataRecord(row)
    if (!record) return false
    return Array.isArray(record['children'])
  })
}

function resolveTreeFieldNames(
  treeConfig: TreeConfig,
  primaryKey: string | undefined,
): TreeFieldNames | null {
  const idFieldRaw = treeConfig.idField ?? primaryKey
  if (typeof idFieldRaw !== 'string' || idFieldRaw.length === 0) return null
  return {
    idField: idFieldRaw,
    parentIdField: treeConfig.parentIdField ?? 'parentId',
    textField: treeConfig.textField ?? 'label',
  }
}

function buildTreeSeedNodes(rows: readonly IDataRow[], fields: TreeFieldNames): TreeSeedBuildResult {
  const seedNodes: TreeManagerSeedNode[] = []
  let hasParentLink = false

  for (const row of rows) {
    const record = toDataRecord(row)
    if (!record) continue

    const rawId = record[fields.idField]
    if (typeof rawId !== 'string' && typeof rawId !== 'number') continue

    const parentId = resolveParentId(record[fields.parentIdField])
    if (parentId !== null) hasParentLink = true

    seedNodes.push({
      ...record,
      id: rawId,
      parentId,
      name: resolveTreeNodeText(record, fields.textField, String(record[fields.textField] ?? rawId)),
    })
  }

  return { seedNodes, hasParentLink }
}

function buildNestedTreeRows(fields: TreeFieldNames, seedNodes: TreeManagerSeedNode[]): IDataRow[] {
  return SparkData.createTreeManager({
    idField: fields.idField,
    parentIdField: fields.parentIdField,
    textField: fields.textField,
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

  const fields = resolveTreeFieldNames(treeConfig, primaryKey)
  if (!fields) return toMutableRows(rows)

  const { seedNodes, hasParentLink } = buildTreeSeedNodes(rows, fields)
  if (seedNodes.length === 0 || !hasParentLink) return toMutableRows(rows)

  return buildNestedTreeRows(fields, seedNodes)
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
    if (view?.treeManager) {
      return view.treeManager.buildNestedTree() as unknown as TreeNode[]
    }

    const fields = resolveTreeFieldNames(treeConfig.value, treeIdField.value)
    if (!fields) return resolvedRows

    const { seedNodes } = buildTreeSeedNodes(resolvedRows, fields)
    return toTreeRows(buildNestedTreeRows(fields, seedNodes))
  })

  return {
    ...options.dataState,
    treeData,
    treeIdField,
  }
}
