import type { DataView, IDataRow } from '@spark-view/spark-data'
import type { IPageServiceCapability } from '../../../internal'
import type { LoggerApi } from '@spark-view/spark-utils'
import type { SparkNode } from '../../../internal'
import { isBuiltinActionDisabled } from '../../support/actions/builtin-action-disabled'
import { getSelectedRows } from '../../../../page/actions/index.js'
import { createBaseCrudMethods, createCrudDispatcher } from '../../support/index.js'
import type { RendererTableApi } from './types'
import type { ValueRef } from '../../../shared-types.js'
import type { BuiltinActionScope } from '../../../../page/actions/index.js'

/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-condition */

export interface NativeTableLike {
  clearSelection?: () => void
  toggleRowSelection?: (row: IDataRow, selected?: boolean) => void
  setCurrentRow?: (row: IDataRow | null) => void
  doLayout?: () => void
}

interface RendererTableZeroCodeOptions {
  props: Readonly<Record<string, unknown>>
  resolvedView: ValueRef<DataView | null | undefined>
  nativeTableRef: ValueRef<NativeTableLike | null>
  currentRowOriginatorId?: string
  selectedRowsOriginatorId?: string
  pageService: IPageServiceCapability | null | undefined
  logger: LoggerApi
}

type LoadTreePathResult = Awaited<ReturnType<RendererTableApi['loadTreePath']>>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getRecordEntries(record: Record<string, unknown>): Array<[string, unknown]> {
  const entries: Array<[string, unknown]> = []
  for (const key in record) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue
    entries.push([key, record[key]])
  }
  return entries
}

function stripSyntheticTreeName<T>(value: T, textField: string | undefined): T {
  if (textField === undefined || textField === 'name') return value

  if (Array.isArray(value)) {
    let changed = false
    const nextValue = value.map(item => {
      const nextItem = stripSyntheticTreeName(item, textField)
      if (nextItem !== item) changed = true
      return nextItem
    })
    return (changed ? nextValue : value) as T
  }

  if (!isRecord(value)) return value

  const entries = getRecordEntries(value)
  const duplicatedLabelEntry = entries.find(([key]) => key === textField)
  const hasDuplicatedLabel = duplicatedLabelEntry !== undefined
  const duplicatedLabel = duplicatedLabelEntry?.[1]
  let changed = false
  const nextValue: Record<string, unknown> = {}

  for (const [key, entryValue] of entries) {
    if (key === 'name' && hasDuplicatedLabel && Object.is(duplicatedLabel, entryValue)) {
      changed = true
      continue
    }
    const nextEntryValue = stripSyntheticTreeName(entryValue, textField)
    if (nextEntryValue !== entryValue) changed = true
    nextValue[key] = nextEntryValue
  }

  return (changed ? nextValue : value) as T
}

function sanitizeTreePayload<T>(value: T, view: DataView | null | undefined): T {
  return stripSyntheticTreeName(value, view?.treeConfig?.textField)
}

export function createRendererTableZeroCode(options: RendererTableZeroCodeOptions) {
  const { dispatch } = createCrudDispatcher(options.props, {
    'current-change': {
      systemDefault: (currentRow: unknown) => {
        options.resolvedView.value?.selection.setCurrentRow(
          (currentRow as IDataRow | null) ?? null,
          options.currentRowOriginatorId,
        )
      },
    },
    'row-click': {
      systemDefault: (row: unknown) => {
        options.resolvedView.value?.selection.setCurrentRow(
          row as IDataRow,
          options.currentRowOriginatorId,
        )
      },
    },
    'selection-change': {
      systemDefault: (selection: unknown) => {
        options.resolvedView.value?.selection.setSelectedRows(
          selection as IDataRow[],
          options.selectedRowsOriginatorId,
        )
      },
    },
  })

  const baseMethods = createBaseCrudMethods(options.resolvedView, dispatch)

  const tableApi: RendererTableApi = {
    ...baseMethods,
    getRows() {
      return options.resolvedView.value?.rows ?? []
    },
    getSelectedRows() {
      return options.resolvedView.value ? getSelectedRows(options.resolvedView.value) : []
    },
    async query() {
      const view = options.resolvedView.value
      if (!view) return
      if (typeof view.refresh === 'function') {
        await view.refresh()
      }
    },
    async loadTreeNested(rootId, limit, depthLimit) {
      const view = options.resolvedView.value
      if (!view) return null
      const result = await view.loadTreeNested(rootId, limit, depthLimit)
      return sanitizeTreePayload(result, view)
    },
    async loadTreeChildren(parentId, limit) {
      const view = options.resolvedView.value
      if (!view) return []
      const result = await view.loadTreeChildren(parentId, limit)
      return sanitizeTreePayload(result, view)
    },
    async loadTreePath(id) {
      const view = options.resolvedView.value
      if (!view) return null
      const result = await view.loadTreePath(id)
      return sanitizeTreePayload(result, view) as LoadTreePathResult
    },
    async expandToNode(key) {
      const view = options.resolvedView.value
      if (!view) return
      await view.expandTreeToNode(key)
      tableApi.setCurrentRowById(key)
    },
    async moveNode(nodeId, newParentId, index) {
      const view = options.resolvedView.value
      if (!view) return null
      const result = await view.moveTreeNode(nodeId, newParentId, index)
      return sanitizeTreePayload(result, view)
    },
    async searchTreeNested(keyword, limit) {
      const view = options.resolvedView.value
      if (!view) return []
      const result = await view.searchTreeNested(keyword, limit)
      return sanitizeTreePayload(result, view)
    },
    // DataView-first: watcher in RendererTable.vue syncs to nativeTableRef
    setCurrentRow(row) {
      const targetRow = row ?? null
      options.resolvedView.value?.selection.setCurrentRow(targetRow)
    },
    setCurrentRowById(id) {
      const view = options.resolvedView.value
      if (!view) return false
      return view.selection.setCurrentRowById(id ?? null)
    },
    setSelectedRows(rows) {
      options.resolvedView.value?.selection.setSelectedRows(rows)
    },
    setSelectedRowsById(ids) {
      return options.resolvedView.value?.selection.setSelectedRowsById(ids) ?? 0
    },
    clearSelectedRows() {
      options.resolvedView.value?.selection.clearSelectedRows()
    },
    clearUiSelection() {
      options.nativeTableRef.value?.clearSelection?.()
    },
    toggleUiRowSelection(row, selected = true) {
      options.nativeTableRef.value?.toggleRowSelection?.(row, selected)
    },
    doLayout() {
      options.nativeTableRef.value?.doLayout?.()
    },
    getNativeTable() {
      return options.nativeTableRef.value
    },
  }

  function isBuiltinActionDisabledAtScope(action: SparkNode, scope?: BuiltinActionScope): boolean {
    return isBuiltinActionDisabled(action, options.resolvedView.value, scope)
  }

  return {
    dispatch,
    tableApi,
    isBuiltinActionDisabled: isBuiltinActionDisabledAtScope,
  }
}