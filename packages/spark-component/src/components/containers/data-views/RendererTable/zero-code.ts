import type { DataView, DataRow } from '@spark-view/spark-data'
import type { LoggerApi } from '@spark-view/spark-utils'
import { getSelectedRows } from '../../../../page/actions/index.js'
import { createContainerCrudContext, getNativeRefValue } from '../zero-code-shared.js'
import { isDataRecord, toDataRecord } from '../data-row-utils.js'
import type { RendererTableApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-condition */

export interface NativeTableLike {
  clearSelection?: () => void
  toggleRowSelection?: (row: DataRow, selected?: boolean) => void
  setCurrentRow?: (row: DataRow | null) => void
  doLayout?: () => void
}

interface RendererTableZeroCodeOptions {
  props: Readonly<Record<string, unknown>>
  resolvedView: ValueRef<DataView | null>
  nativeTableRef: ValueRef<NativeTableLike | null>
  currentRowOriginatorId?: string
  selectedRowsOriginatorId?: string
  logger: LoggerApi
}

function isDataRow(value: unknown): value is DataRow {
  return isDataRecord(value)
}

function toDataRows(value: unknown): DataRow[] {
  return Array.isArray(value) ? value.filter(isDataRow) : []
}

function isNativeTableLike(value: unknown): value is NativeTableLike {
  if (typeof value !== 'object' || value === null) return false
  const clearSelection = Reflect.get(value, 'clearSelection')
  const toggleRowSelection = Reflect.get(value, 'toggleRowSelection')
  const setCurrentRow = Reflect.get(value, 'setCurrentRow')
  const doLayout = Reflect.get(value, 'doLayout')
  return (clearSelection === undefined || typeof clearSelection === 'function')
    && (toggleRowSelection === undefined || typeof toggleRowSelection === 'function')
    && (setCurrentRow === undefined || typeof setCurrentRow === 'function')
    && (doLayout === undefined || typeof doLayout === 'function')
}

function stripSyntheticTreeName<T>(value: T, textField: string | undefined): T
function stripSyntheticTreeName(value: unknown, textField: string | undefined): unknown {
  if (textField === undefined || textField === 'name') return value

  if (Array.isArray(value)) {
    let changed = false
    const nextValue = value.map(item => {
      const nextItem = stripSyntheticTreeName(item, textField)
      if (nextItem !== item) changed = true
      return nextItem
    })
    return changed ? nextValue : value
  }

  const record = toDataRecord(value)
  if (!record) return value

  const entries = Object.entries(record)
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

  return changed ? nextValue : value
}

function sanitizeTreePayload<T>(value: T, view: DataView | null | undefined): T
function sanitizeTreePayload(value: unknown, view: DataView | null | undefined): unknown {
  return stripSyntheticTreeName(value, view?.treeConfig?.textField)
}

export function createRendererTableZeroCode(options: RendererTableZeroCodeOptions) {
  const {
    props,
    resolvedView,
    nativeTableRef,
    currentRowOriginatorId,
    selectedRowsOriginatorId,
  } = options

  const { dispatch, baseMethods } = createContainerCrudContext({
    props,
    resolvedView,
    eventDefaults: {
      'current-change': {
        systemDefault: (currentRow: unknown) => {
          resolvedView.value?.selection.setCurrentRow(
            isDataRow(currentRow) ? currentRow : null,
            currentRowOriginatorId,
          )
        },
      },
      'row-click': {
        systemDefault: (row: unknown) => {
          if (!isDataRow(row)) return
          resolvedView.value?.selection.setCurrentRow(
            row,
            currentRowOriginatorId,
          )
        },
      },
      'selection-change': {
        systemDefault: (selection: unknown) => {
          resolvedView.value?.selection.setSelectedRows(
            toDataRows(selection),
            selectedRowsOriginatorId,
          )
        },
      },
    },
  })

  function getNativeTable() {
    return getNativeRefValue(nativeTableRef, isNativeTableLike)
  }

  const tableApi: RendererTableApi = {
    ...baseMethods,
    getRows() {
      return resolvedView.value?.rows ?? []
    },
    getSelectedRows() {
      return resolvedView.value ? getSelectedRows(resolvedView.value) : []
    },
    async query() {
      const view = resolvedView.value
      if (!view) return
      if (typeof view.refresh === 'function') {
        await view.refresh()
      }
    },
    async loadTreeNested(rootId, limit, depthLimit) {
      const view = resolvedView.value
      if (!view) return null
      const result = await view.loadTreeNested(rootId, limit, depthLimit)
      return sanitizeTreePayload(result, view)
    },
    async loadTreeChildren(parentId, limit) {
      const view = resolvedView.value
      if (!view) return []
      const result = await view.loadTreeChildren(parentId, limit)
      return sanitizeTreePayload(result, view)
    },
    async loadTreePath(id) {
      const view = resolvedView.value
      if (!view) return null
      const result = await view.loadTreePath(id)
      return sanitizeTreePayload(result, view)
    },
    async expandToNode(key) {
      const view = resolvedView.value
      if (!view) return
      await view.expandTreeToNode(key)
      tableApi.setCurrentRowById(key)
    },
    async moveNode(nodeId, newParentId, index) {
      const view = resolvedView.value
      if (!view) return null
      const result = await view.moveTreeNode(nodeId, newParentId, index)
      return sanitizeTreePayload(result, view)
    },
    async searchTreeNested(keyword, limit) {
      const view = resolvedView.value
      if (!view) return []
      const result = await view.searchTreeNested(keyword, limit)
      return sanitizeTreePayload(result, view)
    },
    // DataView-first: watcher in RendererTable.vue syncs to nativeTableRef
    setCurrentRow(row) {
      const targetRow = row ?? null
      resolvedView.value?.selection.setCurrentRow(targetRow)
    },
    setCurrentRowById(id) {
      const view = resolvedView.value
      if (!view) return false
      return view.selection.setCurrentRowById(id ?? null)
    },
    setSelectedRows(rows) {
      resolvedView.value?.selection.setSelectedRows(rows)
    },
    setSelectedRowsById(ids) {
      return resolvedView.value?.selection.setSelectedRowsById(ids) ?? 0
    },
    clearSelectedRows() {
      resolvedView.value?.selection.clearSelectedRows()
    },
    clearUiSelection() {
      getNativeTable()?.clearSelection?.()
    },
    toggleUiRowSelection(row, selected = true) {
      getNativeTable()?.toggleRowSelection?.(row, selected)
    },
    doLayout() {
      getNativeTable()?.doLayout?.()
    },
    getNativeTable() {
      return getNativeTable()
    },
  }

  return {
    dispatch,
    tableApi,
  }
}
