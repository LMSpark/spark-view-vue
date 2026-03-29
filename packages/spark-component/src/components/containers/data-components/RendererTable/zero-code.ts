import type { DataView, IDataRow } from '@spark-view/spark-data'
import type { IPageServiceCapability, LoggerApi } from '@spark-view/spark-utils'
import type { SparkNode } from '../../../internal'
import { createBuiltinActionHandler, getSelectedRows, isBuiltinActionDisabled as _isBuiltinActionDisabled } from '../../builtin-actions'
import { createBaseCrudMethods, createCrudEventDefaults, useEventDefaults } from '../../support/index.js'
import type { RendererTableApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-condition */

interface NativeTableLike {
  clearSelection?: () => void
  toggleRowSelection?: (row: IDataRow, selected?: boolean) => void
  setCurrentRow?: (row: IDataRow | null) => void
  doLayout?: () => void
}

interface RendererTableZeroCodeOptions {
  props: Readonly<Record<string, unknown>>
  resolvedView: ValueRef<DataView | null | undefined>
  nativeTableRef: ValueRef<NativeTableLike | null>
  pageService: IPageServiceCapability | null | undefined
  logger: LoggerApi
  filterModel: Record<string, unknown>
  resetFilters: () => void
  hasFilters: ValueRef<boolean>
  activeFilterCount: ValueRef<number>
  handleFilterSearch: () => Promise<void>
}

type LoadTreeNestedResult = Awaited<ReturnType<RendererTableApi['loadTreeNested']>>
type LoadTreeChildrenResult = Awaited<ReturnType<RendererTableApi['loadTreeChildren']>>
type LoadTreePathResult = Awaited<ReturnType<RendererTableApi['loadTreePath']>>
type MoveNodeResult = Awaited<ReturnType<RendererTableApi['moveNode']>>
type SearchTreeNestedResult = Awaited<ReturnType<RendererTableApi['searchTreeNested']>>

type LoadTreeNestedFn = (rootId?: string | number | null, limit?: number, depthLimit?: number) => Promise<NonNullable<LoadTreeNestedResult>>
type LoadTreePathFn = (id: string | number) => Promise<NonNullable<LoadTreePathResult>>
type MoveNodeFn = (nodeId: string | number, newParentId: string | number | null, index?: number) => Promise<NonNullable<MoveNodeResult>>
type SearchTreeNestedFn = (keyword: string, limit?: number) => Promise<unknown[]>

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

function hasRemoteListApi(view: DataView | null | undefined): boolean {
  return Boolean(view?.dataTable?.api?.list)
}

export function createRendererTableZeroCode(options: RendererTableZeroCodeOptions) {
  const { dispatch } = useEventDefaults(createCrudEventDefaults({
    'current-change': {
      systemDefault: (currentRow: unknown) => {
        options.resolvedView.value?.selection.setCurrentRow((currentRow as IDataRow | null) ?? null)
      },
    },
    'row-click': {
      systemDefault: (row: unknown) => {
        options.resolvedView.value?.selection.setCurrentRow(row as IDataRow)
        options.nativeTableRef.value?.setCurrentRow?.(row as IDataRow)
      },
    },
    'selection-change': {
      systemDefault: (selection: unknown) => {
        options.resolvedView.value?.selection.setSelectedRows(selection as IDataRow[])
      },
    },
  }), options.props)

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
      await options.handleFilterSearch()
    },
    async loadTreeNested(rootId, limit, depthLimit) {
      const view = options.resolvedView.value
      if (!view) return null
      const loadTreeNested = ((nextRootId?: string | number | null, nextLimit?: number, nextDepthLimit?: number) =>
        view.loadTreeNested(nextRootId, nextLimit, nextDepthLimit)) as unknown as LoadTreeNestedFn
      const resultUnknown: unknown = await loadTreeNested(rootId, limit, depthLimit)
      return sanitizeTreePayload(resultUnknown as LoadTreeNestedResult, view)
    },
    async loadTreeChildren(parentId, limit) {
      const view = options.resolvedView.value
      if (!view) return []
      const result: LoadTreeChildrenResult = await view.loadTreeChildren(parentId, limit)
      return sanitizeTreePayload(result, view)
    },
    async loadTreePath(id) {
      const view = options.resolvedView.value
      if (!view) return null
      const loadTreePath = view.loadTreePath.bind(view) as unknown as LoadTreePathFn
      const resultUnknown: unknown = await loadTreePath(id)
      return resultUnknown as LoadTreePathResult
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
      const moveNode = ((nextNodeId: string | number, nextParentId: string | number | null, nextIndex?: number) =>
        view.moveTreeNode(nextNodeId, nextParentId, nextIndex)) as unknown as MoveNodeFn
      const resultUnknown: unknown = await moveNode(nodeId, newParentId, index)
      return sanitizeTreePayload(resultUnknown as MoveNodeResult, view)
    },
    async searchTreeNested(keyword, limit) {
      const view = options.resolvedView.value
      if (!view) return []
      const searchTreeNested = view.searchTreeNested.bind(view) as unknown as SearchTreeNestedFn
      const resultUnknown: unknown = await searchTreeNested(keyword, limit)
      if (!Array.isArray(resultUnknown)) return []
      return sanitizeTreePayload(resultUnknown as SearchTreeNestedResult, view)
    },
    // Override: Table uses selection.setCurrentRow + nativeTableRef sync
    setCurrentRow(row) {
      const targetRow = row ?? null
      options.resolvedView.value?.selection.setCurrentRow(targetRow)
      options.nativeTableRef.value?.setCurrentRow?.(targetRow)
    },
    setCurrentRowById(id) {
      const view = options.resolvedView.value
      if (!view) return false
      const updated = view.selection.setCurrentRowById(id ?? null)
      options.nativeTableRef.value?.setCurrentRow?.(view.currentRow ?? null)
      return updated
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
    getFilterModel() {
      return { ...options.filterModel }
    },
    resetFilters() {
      options.resetFilters()
    },
    hasActiveFilters() {
      return options.hasFilters.value
    },
    getActiveFilterCount() {
      return options.activeFilterCount.value
    },
  }

  const builtinHandler = createBuiltinActionHandler({
    getView: () => options.resolvedView.value,
    getPageService: () => options.pageService,
    getLogger: () => options.logger,
    hasRemoteListApi: view => hasRemoteListApi(view),
  })

  function isBuiltinActionDisabled(action: SparkNode, scope?: { row?: IDataRow; index?: number }): boolean {
    return _isBuiltinActionDisabled(action, options.resolvedView.value, scope)
  }

  function handleBuiltinToolbarAction(action: SparkNode): void {
    builtinHandler.handleToolbar(action)
  }

  function handleBuiltinRowAction(action: SparkNode, row: IDataRow, index: number): void {
    builtinHandler.handleRow(action, row, index)
  }

  return {
    dispatch,
    tableApi,
    hasRemoteListApi,
    isBuiltinActionDisabled,
    handleBuiltinToolbarAction,
    handleBuiltinRowAction,
  }
}