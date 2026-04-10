import { computed, ref, watch } from 'vue'
import { SparkData, type DataView, type IDataRow } from '@spark-view/spark-data'
import type { SparkNode } from '../../../../core/types.js'
import type { ValueRef } from '../../../shared-types.js'

interface RendererTableViewStateOptions {
  filterNode: ValueRef<SparkNode | undefined>
  baseTableAttrs: ValueRef<Record<string, unknown>>
  resolvedView: ValueRef<DataView | null | undefined>
  filteredRows: ValueRef<IDataRow[] | undefined>
  readStringAttr: (name: string) => string | undefined
  readBooleanAttr: (name: string) => boolean | undefined
  readNumberAttr: (name: string) => number | undefined
}

interface TableTreeSeedNode extends Record<string, unknown> {
  id: string | number
  name: string
  parentId?: string | number | null
}

const DEFAULT_TABLE_TREE_PROPS: Readonly<Record<string, unknown>> = Object.freeze({
  children: 'children',
  hasChildren: 'hasChildren',
})

export function useRendererTableViewState(options: RendererTableViewStateOptions) {
  const tableData = computed(() => buildTreeTableRows(
    options.resolvedView.value,
    options.filteredRows.value ?? options.resolvedView.value?.rows ?? [],
  ))

  const tableRowKeyValue = computed(() =>
    options.readStringAttr('rowKey')
    ?? options.resolvedView.value?.primaryKey
    ?? options.resolvedView.value?.treeConfig?.idField
  )

  const tableTreePropsValue = computed<Record<string, unknown> | undefined>(() => {
    if (!options.resolvedView.value?.treeConfig) return undefined
    return DEFAULT_TABLE_TREE_PROPS
  })

  const tableAttrs = computed<Record<string, unknown>>(() => {
    const result = { ...options.baseTableAttrs.value }
    if (!options.resolvedView.value?.treeConfig) return result

    if (result['rowKey'] === undefined && result['row-key'] === undefined && tableRowKeyValue.value) {
      result['rowKey'] = tableRowKeyValue.value
    }

    if (result['treeProps'] === undefined && result['tree-props'] === undefined && tableTreePropsValue.value) {
      result['treeProps'] = tableTreePropsValue.value
    }

    return result
  })

  const filterCollapsibleValue = computed(() => (options.filterNode.value?.props?.['collapsible'] as boolean | undefined) ?? options.readBooleanAttr('filterCollapsible') ?? false)
  const filterDefaultCollapsedValue = computed(() => (options.filterNode.value?.props?.['defaultCollapsed'] as boolean | undefined) ?? options.readBooleanAttr('filterDefaultCollapsed') ?? false)
  const filterAutoFitMinWidthValue = computed(() => (options.filterNode.value?.props?.['autoFitMinWidth'] as string | undefined) ?? options.readStringAttr('filterAutoFitMinWidth') ?? '220px')
  const filterItemSpanValue = computed(() => (options.filterNode.value?.props?.['itemSpan'] as number | undefined) ?? options.readNumberAttr('filterItemSpan') ?? 1)

  const filtersCollapsed = ref(filterDefaultCollapsedValue.value)

  watch(filterDefaultCollapsedValue, (value) => {
    filtersCollapsed.value = value
  })

  function toggleFiltersCollapsed() {
    if (!filterCollapsibleValue.value) return
    filtersCollapsed.value = !filtersCollapsed.value
  }

  return {
    tableData,
    tableAttrs,
    filterCollapsibleValue,
    filterAutoFitMinWidthValue,
    filterItemSpanValue,
    filtersCollapsed,
    toggleFiltersCollapsed,
  }
}

function buildTreeTableRows(view: DataView | null | undefined, rows: IDataRow[]): IDataRow[] {
  if (!view || rows.length === 0) return rows
  if (rows.some(row => Array.isArray((row as Record<string, unknown> | undefined)?.['children']))) {
    return rows
  }

  const treeConfig = view.treeConfig
  if (!treeConfig) return rows

  const idField = treeConfig.idField ?? view.primaryKey
  const parentIdField = treeConfig.parentIdField ?? 'parentId'
  const textField = treeConfig.textField ?? 'label'

  const seedNodes: TableTreeSeedNode[] = []
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

    seedNodes.push({
      ...record,
      id: rawId,
      parentId,
      name: typeof record[textField] === 'string'
        ? record[textField]
        : String(record[textField] ?? rawId),
    })
  }

  if (seedNodes.length === 0 || !hasParentLink) return rows

  return SparkData.createTreeManager({
    idField,
    parentIdField,
    textField,
    treeMode: 'nested',
  }, seedNodes).buildNestedTree() as IDataRow[]
}