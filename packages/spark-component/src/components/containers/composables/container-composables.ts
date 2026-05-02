/**
 * container-composables.ts
 *
 * 容器层公共 composable 汇总文件。
 * 统一放置 DataSource / ModuleContext / Toolbar / DataViewEventBridge / FormDetailContainer /
 * ContainerGrid / CompositeItemGrid / FilterPanel，消除跨文件 cross-import，保持单一来源。
 *
 * 外部消费者继续通过各自的原始路径导入；原始文件均已改为单行 re-export。
 */

// ============================================================
// § 外部依赖
// ============================================================

import {
  computed,
  onUnmounted,
  reactive,
  ref,
  shallowReactive,
  toRef,
  toValue,
  watch,
  watchEffect,
} from 'vue'
import type { CSSProperties, ComputedRef, MaybeRefOrGetter, Ref } from 'vue'
import type {
  DataView,
  FilterExpression,
  FilterOperator,
  FilterValueExpression,
  IDataSource,
  IDataRow,
} from '@spark-view/spark-data'
import type { ValueRef } from '../../shared-types.js'
import {
  DATA_SOURCE,
  MODULE_CONTEXT,
  getSparkNodeChildren,
  nodeInputProp,
  useSparkPageComponent,
  type IModuleContext,
  type ModuleContextCapability,
  type SparkNode,
} from '../../internal.js'
export type ToolbarPosition = 'top' | 'bottom' | 'left' | 'right'

import { useContainerDataSource } from '../data-components/view-state.js'
import type { RToolbarProps } from '../non-data-components/RendererToolbar.types'
import { createCurrentRowScope } from '../support/scopeFactories'
import { syncReactiveRow } from '../../support/row-mirror-sync'

// ============================================================
// § useContainerGrid
// ============================================================

const DEFAULT_GRID_COLUMNS = 24
const DEFAULT_GRID_GAP = '0px'
const DEFAULT_AUTO_ROWS = 'minmax(32px, auto)'
const AUTO_FIT_MAX_TRACKS = 4
const DEFAULT_COL_SPAN_KEYS = ['colSpan', 'gridColSpan', 'span'] as const
const DEFAULT_ROW_SPAN_KEYS = ['rowSpan', 'gridRowSpan'] as const
const TOOLBAR_POSITIONS = ['top', 'bottom', 'left', 'right'] as const
const DEFAULT_TOOLBAR_CLASS = 'renderer-toolbar-default'
const DEFAULT_TOOLBAR_POSITION: ToolbarPosition = 'top'
const DEFAULT_NUMERIC_ZERO = 0
const FILTER_SYNC_ERROR_MESSAGE = 'RendererFilter: 同步过滤表达式失败'
const FILTER_APPLY_ERROR_MESSAGE = 'RendererFilter: 应用过滤失败'
const FILTER_OPERATOR_BETWEEN: FilterOperator = 'between'
const FILTER_OPERATOR_IN: FilterOperator = 'in'
const FILTER_OPERATOR_CONTAINS: FilterOperator = 'contains'
const FILTER_OPERATOR_EQUALS: FilterOperator = '=='
const FILTER_VALUE_KIND_FIELD = 'field'
const FILTER_NODE_TYPE_TEXT = 'r-text'
const FILTER_NODE_TYPE_DATE = 'r-date'
const FILTER_NODE_TYPE_NUMBER = 'r-number'
const DATAKEY_SUFFIX_AGGREGATE_RESULT = '@aggregateResult'
const DATAKEY_SUFFIX_SELECTION_AGGREGATE_RESULT = '@selectionAggregateResult'
const FORM_CONTAINER_LOG_PREFIX = 'RendererForm'
const DETAIL_CONTAINER_LOG_PREFIX = 'RendererDetail'
const CONTEXT_SYNC_SKIP_SAME_REF = true

type OptionalString = string | null | undefined
type OptionalStringOrNumber = string | number | null | undefined

interface ErrorLoggerLike {
  error(message: string, error?: unknown): void
}

function toFiniteInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function toNonEmptyString(value: unknown, fallback = ''): string {
  return hasStringValue(value) && value.trim().length > 0 ? value : fallback
}

function toPositiveInteger(value: unknown, fallback: number): number {
  return Math.max(1, toFiniteInteger(value) ?? fallback)
}

function hasStringValue(value: unknown): value is string {
  return typeof value === 'string'
}

export function normalizeGridGap(value: unknown): string {
  if (typeof value === 'number') return `${value}px`
  if (hasStringValue(value) && value.trim()) return value
  return DEFAULT_GRID_GAP
}

export function normalizeSpan(value: unknown, fallback: number): number {
  return toPositiveInteger(value, fallback)
}

function getFirstNodeInput(child: SparkNode, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = nodeInputProp(child, key)
    if (value !== undefined) return value
  }
  return undefined
}

function getSpanValue(child: SparkNode, keys: readonly string[], fallback: number): number {
  return normalizeSpan(getFirstNodeInput(child, keys), fallback)
}

function hasNodeInputOverride(child: SparkNode, keys: readonly string[]): boolean {
  return getFirstNodeInput(child, keys) !== undefined
}

interface UseContainerGridOptions {
  children: MaybeRefOrGetter<SparkNode[]>
  columns?: MaybeRefOrGetter<number>
  gap?: MaybeRefOrGetter<number | string>
  autoRows?: MaybeRefOrGetter<string>
  autoFitMinWidth?: MaybeRefOrGetter<string>
  defaultColSpan?: MaybeRefOrGetter<number>
  /** 当最后一行不满时，自动拉宽以填满行宽 */
  autoFillLastRow?: boolean
}

export interface ContainerGridState {
  gridStyle: ComputedRef<CSSProperties>
  getChildGridStyle: (child: SparkNode, index?: number) => CSSProperties
  gridChildren: ComputedRef<SparkNode[]>
}

function normalizeAutoFitSpan(rawSpan: number, totalColumns: number, childCount: number): number {
  const safeColumns = Math.max(1, Math.floor(totalColumns))
  const safeChildCount = Math.max(1, Math.floor(childCount))
  const targetColumns = Math.min(safeChildCount, AUTO_FIT_MAX_TRACKS)
  const baseSpan = Math.max(1, Math.floor(safeColumns / targetColumns))

  return Math.max(1, Math.round(rawSpan / baseSpan))
}

function getAutoFitTrackCount(childCount: number): number {
  return Math.max(1, Math.min(Math.floor(childCount), AUTO_FIT_MAX_TRACKS))
}

function resolveGridOptions(options: UseContainerGridOptions) {
  const children = toValue(options.children)
  const columns = toPositiveInteger(toValue(options.columns ?? DEFAULT_GRID_COLUMNS), DEFAULT_GRID_COLUMNS)
  const autoFitMinWidth = toNonEmptyString(toValue(options.autoFitMinWidth ?? ''))
  const hasAutoFit = autoFitMinWidth.length > 0
  const defaultColSpanValue = toValue(options.defaultColSpan)
  const defaultColSpan = defaultColSpanValue ?? DEFAULT_GRID_COLUMNS
  return {
    children,
    columns,
    autoFitMinWidth,
    hasAutoFit,
    defaultColSpanValue,
    defaultColSpan,
    gridTemplateColumns: hasAutoFit
      ? `repeat(auto-fit, minmax(${autoFitMinWidth}, 1fr))`
      : `repeat(${columns}, minmax(0, 1fr))`,
  }
}

function resolveLastRowColSpan(params: {
  enabled: boolean | undefined
  index: number | undefined
  childrenLength: number
  columns: number
  colSpan: number
  hasAutoFit: boolean
  hasExplicitColSpan: boolean
}): number {
  const { enabled, index, childrenLength, columns, colSpan, hasAutoFit, hasExplicitColSpan } = params
  if (!enabled || index === undefined) return colSpan

  if (hasAutoFit) {
    const trackCount = getAutoFitTrackCount(childrenLength)
    const baseSpan = hasExplicitColSpan ? Math.max(1, colSpan) : 1
    const itemsPerRow = Math.max(1, Math.floor(trackCount / baseSpan))
    const remainder = childrenLength % itemsPerRow
    const lastRowItemCount = remainder === 0 ? itemsPerRow : remainder
    const lastRowStartIndex = childrenLength - lastRowItemCount

    if (index < lastRowStartIndex) return colSpan
    if (lastRowItemCount === 1) return trackCount
    if (lastRowItemCount === 2 && trackCount % 2 === 0) return Math.max(baseSpan, trackCount / 2)
    return hasExplicitColSpan ? colSpan : 1
  }

  const itemsPerRow = Math.max(1, Math.floor(columns / colSpan))
  const lastRowStartIndex = Math.floor(childrenLength / itemsPerRow) * itemsPerRow
  if (index < lastRowStartIndex) return colSpan
  const lastRowItemCount = childrenLength - lastRowStartIndex
  return lastRowItemCount > 0 && lastRowItemCount < itemsPerRow
    ? Math.ceil(columns / lastRowItemCount)
    : colSpan
}

export function useContainerGrid(options: UseContainerGridOptions): ContainerGridState {
  const resolvedGridOptions = computed(() => resolveGridOptions(options))

  const gridStyle = computed<CSSProperties>(() => {
    const resolved = resolvedGridOptions.value
    return {
      display: 'grid',
      gridTemplateColumns: resolved.gridTemplateColumns,
      gap: normalizeGridGap(toValue(options.gap ?? DEFAULT_GRID_GAP)),
      gridAutoRows: toValue(options.autoRows ?? DEFAULT_AUTO_ROWS) || DEFAULT_AUTO_ROWS,
      alignItems: 'start',
    }
  })

  function getChildGridStyle(child: SparkNode, index?: number): CSSProperties {
    const resolved = resolvedGridOptions.value
    const rawColSpan = getSpanValue(child, DEFAULT_COL_SPAN_KEYS, resolved.defaultColSpan)
    const hasExplicitColSpan = hasNodeInputOverride(child, DEFAULT_COL_SPAN_KEYS) || resolved.defaultColSpanValue !== undefined
    const colSpan = resolved.hasAutoFit
      ? normalizeAutoFitSpan(rawColSpan, resolved.columns, resolved.children.length)
      : rawColSpan
    const rowSpan = getSpanValue(child, DEFAULT_ROW_SPAN_KEYS, 1)
    const finalColSpan = resolveLastRowColSpan({
      enabled: options.autoFillLastRow,
      index,
      childrenLength: resolved.children.length,
      columns: resolved.columns,
      colSpan,
      hasAutoFit: resolved.hasAutoFit,
      hasExplicitColSpan,
    })

    const childGridStyle: CSSProperties = {
      gridRow: `span ${rowSpan} / span ${rowSpan}`,
      minWidth: 0,
    }

    if (!resolved.hasAutoFit || hasExplicitColSpan || finalColSpan > 1) {
      childGridStyle.gridColumn = `span ${finalColSpan} / span ${finalColSpan}`
    }

    return childGridStyle
  }

  return {
    gridStyle,
    getChildGridStyle,
    gridChildren: computed(() => resolvedGridOptions.value.children),
  }
}

// ============================================================
// § useCompositeItemGrid
// ============================================================

interface UseCompositeItemGridOptions {
  children?: () => SparkNode['children'] | undefined
  bodyClass?: () => OptionalString
  gridColumns?: () => OptionalStringOrNumber
  gridAutoRows?: () => OptionalString
  gridGap?: () => OptionalStringOrNumber
}

export interface CompositeItemGridState {
  contentChildren: ComputedRef<SparkNode[]>
  contentBodyClass: ComputedRef<string>
  contentGridStyle: ComputedRef<CSSProperties>
  getContentChildGridStyle: (child: SparkNode, index?: number) => CSSProperties
}

export function useCompositeItemGrid(options: UseCompositeItemGridOptions): CompositeItemGridState {
  const contentChildren = computed<SparkNode[]>(() => {
    const children = options.children?.()
    return getSparkNodeChildren(children)
  })

  const contentBodyClass = computed(() => {
    const bodyClass = options.bodyClass?.()
    return toNonEmptyString(bodyClass)
  })

  const {
    gridStyle: contentGridStyle,
    getChildGridStyle: getContentChildGridStyle,
  } = useContainerGrid({
    children: () => contentChildren.value,
    columns: () => {
      const parsed = toFiniteInteger(options.gridColumns?.())
      if (parsed !== undefined) return parsed
      return DEFAULT_GRID_COLUMNS
    },
    gap: () => {
      const value = options.gridGap?.()
      return typeof value === 'number' || typeof value === 'string' ? value : DEFAULT_NUMERIC_ZERO
    },
    autoRows: () => {
      const value = options.gridAutoRows?.()
      return typeof value === 'string' ? value : ''
    },
  })

  return {
    contentChildren,
    contentBodyClass,
    contentGridStyle,
    getContentChildGridStyle,
  }
}

// ============================================================
// § useContainerModuleContext
// ============================================================

export function useContainerModuleContext(
  capability: ModuleContextCapability | null,
): Ref<IModuleContext | null> {
  const moduleContext = ref<IModuleContext | null>(capability?.getCurrent() ?? null)

  const unsubscribe = capability?.subscribe((next) => {
    moduleContext.value = next
  }) ?? null

  onUnmounted(() => {
    unsubscribe?.()
  })

  return moduleContext
}

// ============================================================
// § useContainerToolbar
// ============================================================

function isToolbarPosition(value: unknown): value is ToolbarPosition {
  return typeof value === 'string' && TOOLBAR_POSITIONS.some(position => position === value)
}

/** 工具栏节点所需的最小属性形状，与 RToolbarProps 结构对齐。 */
interface ToolbarLike {
  children?: Array<SparkNode | string>
  position?: string
  class?: string | string[]
}

interface UseContainerToolbarOptions {
  /** toolbar SparkNode（响应式 getter 或 ref） */
  toolbarNode: MaybeRefOrGetter<ToolbarLike | null | undefined>
  /**
   * class 回退值，当 toolbar.class 未设置时使用。
   * @default 'renderer-toolbar-default'
   */
  defaultClass?: string
  /**
   * position 回退值，当 toolbar.position 未设置或无效时使用。
   * @default 'top'
   */
  defaultPosition?: ToolbarPosition
}

export interface ContainerToolbarState {
  visibleToolbarConfigs: ComputedRef<SparkNode[]>
  toolbarPositionValue: ComputedRef<ToolbarPosition>
  toolbarClassValue: ComputedRef<string>
  showToolbar: ComputedRef<boolean>
}

export function useContainerToolbar(options: UseContainerToolbarOptions): ContainerToolbarState {
  const fallbackClass = options.defaultClass ?? DEFAULT_TOOLBAR_CLASS
  const fallbackPosition = options.defaultPosition ?? DEFAULT_TOOLBAR_POSITION
  const toolbarNodeValue = computed(() => toValue(options.toolbarNode))

  const visibleToolbarConfigs = computed(() =>
    getSparkNodeChildren(toolbarNodeValue.value?.children)
  )

  const toolbarPositionValue = computed<ToolbarPosition>(() => {
    const position = toolbarNodeValue.value?.position
    return isToolbarPosition(position) ? position : fallbackPosition
  })

  const toolbarClassValue = computed(() => {
    const className = toolbarNodeValue.value?.class
    return typeof className === 'string' ? className : fallbackClass
  })

  const showToolbar = computed(() => visibleToolbarConfigs.value.length > 0)

  return {
    visibleToolbarConfigs,
    toolbarPositionValue,
    toolbarClassValue,
    showToolbar,
  }
}

// ============================================================
// § useDataViewEventBridge
// ============================================================

/** DataView 事件名（桥接层内部统一使用）。 */
export type DataViewBridgeEventName =
  | 'currentRowChanged'
  | 'selectedRowsChanged'
  | 'rowsChanged'
  | 'cleared'
  | 'requestStateChanged'
  | 'summaryChanged'
  | 'selectionSummaryChanged'
  | 'mutatingChanged'

type NoArgBridgeEventName = Extract<DataViewBridgeEventName, 'rowsChanged' | 'cleared' | 'summaryChanged' | 'selectionSummaryChanged'>
type OriginatorBridgeEventName = Extract<DataViewBridgeEventName, 'currentRowChanged' | 'selectedRowsChanged'>

/** 桥接层基础上下文：用于统一错误处理、诊断与日志。 */
export interface DataViewBridgeBaseContext {
  view: DataView
  eventName: DataViewBridgeEventName
}

export interface CurrentRowChangedContext {
  row: IDataRow | null
  originatorId?: string
  view: DataView
  eventName: 'currentRowChanged'
}

export interface SelectedRowsChangedContext {
  rows: IDataRow[]
  originatorId?: string
  view: DataView
  eventName: 'selectedRowsChanged'
}

export interface RowsChangedContext {
  view: DataView
  eventName: 'rowsChanged'
}

export interface ClearedContext {
  view: DataView
  eventName: 'cleared'
}

export interface RequestStateChangedContext {
  state: NonNullable<IDataSource['requestState']>
  view: DataView
  eventName: 'requestStateChanged'
}

export interface SummaryChangedContext {
  view: DataView
  eventName: 'summaryChanged'
}

export interface SelectionSummaryChangedContext {
  view: DataView
  eventName: 'selectionSummaryChanged'
}

export interface MutatingChangedContext {
  mutating: boolean
  view: DataView
  eventName: 'mutatingChanged'
}

export interface OriginatorFilterContext {
  originatorId: string | undefined
  view: DataView
  eventName: 'currentRowChanged' | 'selectedRowsChanged'
}

export interface DataViewEventBridgeOptions {
  resolvedView: ValueRef<DataView | null>
  ignoreOriginatorId?: string
  shouldDispatchByOriginatorId?: (context: OriginatorFilterContext) => boolean
  enabled?: boolean
  onDetached?: () => void
  onAttached?: (view: DataView) => void
  onCurrentRowChanged?: (context: CurrentRowChangedContext) => void | Promise<void>
  onSelectedRowsChanged?: (context: SelectedRowsChangedContext) => void | Promise<void>
  onRowsChanged?: (context: RowsChangedContext) => void | Promise<void>
  onCleared?: (context: ClearedContext) => void | Promise<void>
  onRequestStateChanged?: (context: RequestStateChangedContext) => void | Promise<void>
  onSummaryChanged?: (context: SummaryChangedContext) => void | Promise<void>
  onSelectionSummaryChanged?: (context: SelectionSummaryChangedContext) => void | Promise<void>
  onMutatingChanged?: (context: MutatingChangedContext) => void | Promise<void>
  onIgnoredByOriginatorId?: (context: OriginatorFilterContext) => void
  onError?: (error: unknown, context: DataViewBridgeBaseContext) => void
}

type DataViewBridgeEventArgs =
  | [currentRow: IDataRow | null, originatorId?: string]
  | [selectedRows: IDataRow[], originatorId?: string]
  | []
  | [requestState: NonNullable<IDataSource['requestState']>]
  | [mutating: boolean]

type DataViewBridgeEventHandler = (...args: DataViewBridgeEventArgs) => void

type BridgeHandlerFactory = () => unknown

interface BridgeRegistrationFactory {
  enabled: boolean
  eventName: DataViewBridgeEventName
  createHandler: BridgeHandlerFactory
}

function registerDataViewEvents(
  view: DataView,
  registrations: readonly BridgeRegistrationFactory[],
): () => void {
  const cleanupHandlers: Array<() => void> = []

  for (const registration of registrations) {
    if (!registration.enabled) continue
    const handler = registration.createHandler() as DataViewBridgeEventHandler
    view.events.on(registration.eventName, handler)
    cleanupHandlers.push(() => {
      view.events.off(registration.eventName, handler)
    })
  }

  return () => {
    for (const cleanup of cleanupHandlers) cleanup()
  }
}

export function useDataViewEventBridge(options: DataViewEventBridgeOptions) {
  const handleError = (error: unknown, context: DataViewBridgeBaseContext) => {
    if (options.onError) {
      options.onError(error, context)
      return
    }
    throw error
  }

  const runWithErrorBoundary = (
    eventName: DataViewBridgeEventName,
    view: DataView,
    runner: () => void | Promise<void>,
  ) => {
    try {
      const result = runner()
      if (result && typeof result.catch === 'function') {
        void result.catch((error) => {
          handleError(error, { view, eventName })
        })
      }
    } catch (error) {
      handleError(error, { view, eventName })
    }
  }

  const shouldDispatchByOriginator = (
    originatorId: string | undefined,
    view: DataView,
    eventName: OriginatorBridgeEventName,
  ): boolean => {
    if (options.ignoreOriginatorId && originatorId === options.ignoreOriginatorId) {
      options.onIgnoredByOriginatorId?.(createOriginatorContext(originatorId, view, eventName))
      return false
    }

    if (options.shouldDispatchByOriginatorId && !options.shouldDispatchByOriginatorId({ originatorId, view, eventName })) {
      options.onIgnoredByOriginatorId?.(createOriginatorContext(originatorId, view, eventName))
      return false
    }

    return true
  }

  watchEffect((onCleanup) => {
    if (options.enabled === false) {
      options.onDetached?.()
      return
    }

    const view = options.resolvedView.value
    if (!view) {
      options.onDetached?.()
      return
    }

    options.onAttached?.(view)

    const runNoArgEvent = (
      eventName: NoArgBridgeEventName,
      runner: () => void | Promise<void>,
    ) => {
      runWithErrorBoundary(eventName, view, runner)
    }

    const createNoArgBridgeHandler = <T extends NoArgBridgeEventName>(
      eventName: T,
      callback: ((context: { view: DataView; eventName: T }) => void | Promise<void>) | undefined,
    ): (() => void) => {
      return () => {
        runNoArgEvent(eventName, () => callback?.({ view, eventName }))
      }
    }

    const runOriginatorEvent = (
      eventName: OriginatorBridgeEventName,
      originatorId: string | undefined,
      runner: () => void | Promise<void>,
    ) => {
      if (!shouldDispatchByOriginator(originatorId, view, eventName)) return
      runWithErrorBoundary(eventName, view, runner)
    }

    const handleCurrentRowChanged = (row: IDataRow | null, originatorId?: string) => {
      runOriginatorEvent('currentRowChanged', originatorId, () =>
        options.onCurrentRowChanged?.({
          row,
          ...(originatorId !== undefined ? { originatorId } : {}),
          view,
          eventName: 'currentRowChanged',
        })
      )
    }

    const handleSelectedRowsChanged = (rows: IDataRow[], originatorId?: string) => {
      runOriginatorEvent('selectedRowsChanged', originatorId, () =>
        options.onSelectedRowsChanged?.({
          rows,
          ...(originatorId !== undefined ? { originatorId } : {}),
          view,
          eventName: 'selectedRowsChanged',
        })
      )
    }

    const handleRowsChanged = createNoArgBridgeHandler('rowsChanged', options.onRowsChanged)

    const handleCleared = createNoArgBridgeHandler('cleared', options.onCleared)

    const handleRequestStateChanged = (state: NonNullable<IDataSource['requestState']>) => {
      runWithErrorBoundary('requestStateChanged', view, () =>
        options.onRequestStateChanged?.({ state, view, eventName: 'requestStateChanged' })
      )
    }

    const handleSummaryChanged = createNoArgBridgeHandler('summaryChanged', options.onSummaryChanged)

    const handleSelectionSummaryChanged = createNoArgBridgeHandler(
      'selectionSummaryChanged',
      options.onSelectionSummaryChanged,
    )

    const handleMutatingChanged = (mutating: boolean) => {
      runWithErrorBoundary('mutatingChanged', view, () =>
        options.onMutatingChanged?.({ mutating, view, eventName: 'mutatingChanged' })
      )
    }

    const registrations: BridgeRegistrationFactory[] = [
      { enabled: Boolean(options.onCurrentRowChanged), eventName: 'currentRowChanged', createHandler: () => handleCurrentRowChanged },
      { enabled: Boolean(options.onSelectedRowsChanged), eventName: 'selectedRowsChanged', createHandler: () => handleSelectedRowsChanged },
      { enabled: Boolean(options.onRowsChanged), eventName: 'rowsChanged', createHandler: () => handleRowsChanged },
      { enabled: Boolean(options.onCleared), eventName: 'cleared', createHandler: () => handleCleared },
      { enabled: Boolean(options.onRequestStateChanged), eventName: 'requestStateChanged', createHandler: () => handleRequestStateChanged },
      { enabled: Boolean(options.onSummaryChanged), eventName: 'summaryChanged', createHandler: () => handleSummaryChanged },
      { enabled: Boolean(options.onSelectionSummaryChanged), eventName: 'selectionSummaryChanged', createHandler: () => handleSelectionSummaryChanged },
      { enabled: Boolean(options.onMutatingChanged), eventName: 'mutatingChanged', createHandler: () => handleMutatingChanged },
    ]

    onCleanup(registerDataViewEvents(view, registrations))
  })
}

export interface DataViewSyncGuardState {
  runWithViewSync: <T>(action: () => T) => T
  runWithViewSyncAsync: <T>(action: () => Promise<T>) => Promise<T>
  isViewSyncing: () => boolean
  getSyncDepth: () => number
}

export function useDataViewSyncGuard(): DataViewSyncGuardState {
  let syncDepth = 0

  function enterViewSync(): void { syncDepth += 1 }
  function leaveViewSync(): void { syncDepth = Math.max(0, syncDepth - 1) }

  function runWithViewSync<T>(action: () => T): T {
    enterViewSync()
    try { return action() } finally { leaveViewSync() }
  }

  async function runWithViewSyncAsync<T>(action: () => Promise<T>): Promise<T> {
    enterViewSync()
    try { return await action() } finally { leaveViewSync() }
  }

  function isViewSyncing(): boolean { return syncDepth > 0 }
  function getSyncDepth(): number { return syncDepth }

  return { runWithViewSync, runWithViewSyncAsync, isViewSyncing, getSyncDepth }
}

// ============================================================
// § useFilterPanel
// ============================================================

interface UseFilterPanelOptions {
  filterChildren: MaybeRefOrGetter<SparkNode[]>
  dataView: MaybeRefOrGetter<DataView | null>
  logger: ErrorLoggerLike
}

export interface FilterPanelState {
  filterModel: Record<string, unknown>
  filterConfigs: ComputedRef<SparkNode[]>
  hasFilters: ComputedRef<boolean>
  activeFilterCount: ComputedRef<number>
  searchFilters: () => Promise<void>
  resetFilters: () => Promise<void>
}

interface InputFilterDescriptor {
  kind: 'input'
  config: SparkNode
  field: string | undefined
}

interface ResidentFieldRefFilterDescriptor {
  kind: 'field-ref'
  field: string
  op: FilterOperator
  refField: string
}

type FilterDescriptor = InputFilterDescriptor | ResidentFieldRefFilterDescriptor

function isEmptyFilterValue(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  return false
}

function isRangeFilterConfig(config: SparkNode): boolean {
  return nodeInputProp(config, 'filterMode') === 'range'
}

function getNodeField(config: SparkNode): string | undefined {
  const f = nodeInputProp(config, 'field')
  return typeof f === 'string' ? f : undefined
}

function getNodeFilterValueRefField(config: SparkNode): string | undefined {
  const value = nodeInputProp(config, 'filterValueRefField')
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('RendererFilter: filterValueRefField 必须是非空字符串')
  }
  return value.trim()
}

function assertFilterNodesArray(value: unknown): asserts value is SparkNode[] {
  if (Array.isArray(value)) return
  throw new Error('RendererFilter: r-filter children 必须是数组节点配置')
}

function createOriginatorContext(
  originatorId: string | undefined,
  view: DataView,
  eventName: OriginatorBridgeEventName,
): OriginatorFilterContext {
  return { originatorId, view, eventName }
}

function inferFilterOperator(config: SparkNode, value: unknown): FilterOperator {
  const explicit = nodeInputProp(config, 'filterOp') ?? nodeInputProp(config, 'filterOperator')
  if (hasStringValue(explicit)) return explicit as FilterOperator
  if (Array.isArray(value)) {
    if (isRangeFilterConfig(config) || config.type === FILTER_NODE_TYPE_DATE || config.type === FILTER_NODE_TYPE_NUMBER) {
      return FILTER_OPERATOR_BETWEEN
    }
    return FILTER_OPERATOR_IN
  }

  switch (config.type) {
    case FILTER_NODE_TYPE_TEXT:
      return FILTER_OPERATOR_CONTAINS
    default:
      return FILTER_OPERATOR_EQUALS
  }
}

function createResidentFieldRefDescriptor(
  config: SparkNode,
): ResidentFieldRefFilterDescriptor | undefined {
  const refField = getNodeFilterValueRefField(config)
  if (refField === undefined) return undefined

  const field = getNodeField(config)
  if (!field) {
    throw new Error('RendererFilter: 配置 filterValueRefField 的筛选节点必须声明 field')
  }

  return {
    kind: 'field-ref',
    field,
    op: inferFilterOperator(config, undefined),
    refField,
  }
}

function describeFilterNode(config: SparkNode): FilterDescriptor {
  const residentFieldRef = createResidentFieldRefDescriptor(config)
  if (residentFieldRef) return residentFieldRef

  return {
    kind: 'input',
    config,
    field: getNodeField(config),
  }
}

function isInputFilterDescriptor(descriptor: FilterDescriptor): descriptor is InputFilterDescriptor {
  return descriptor.kind === 'input'
}

function isResidentFieldRefDescriptor(
  descriptor: FilterDescriptor,
): descriptor is ResidentFieldRefFilterDescriptor {
  return descriptor.kind === 'field-ref'
}

function splitFilterDescriptors(descriptors: readonly FilterDescriptor[]): {
  input: InputFilterDescriptor[]
  residentFieldRef: ResidentFieldRefFilterDescriptor[]
} {
  const input: InputFilterDescriptor[] = []
  const residentFieldRef: ResidentFieldRefFilterDescriptor[] = []

  for (const descriptor of descriptors) {
    if (isInputFilterDescriptor(descriptor)) {
      input.push(descriptor)
      continue
    }
    if (isResidentFieldRefDescriptor(descriptor)) {
      residentFieldRef.push(descriptor)
    }
  }

  return { input, residentFieldRef }
}

function toResidentFieldRefCondition(descriptor: ResidentFieldRefFilterDescriptor): FilterExpression {
  return {
    field: descriptor.field,
    op: descriptor.op,
    value: {
      kind: FILTER_VALUE_KIND_FIELD,
      field: descriptor.refField,
    } as FilterValueExpression,
  }
}

function buildCondition(config: SparkNode, value: unknown): FilterExpression | undefined {
  const field = getNodeField(config)
  if (!field || isEmptyFilterValue(value)) return undefined

  return {
    field,
    op: inferFilterOperator(config, value),
    value: value as FilterValueExpression,
  }
}

function syncFilterModelKeys(
  filterModel: Record<string, unknown>,
  configs: readonly SparkNode[],
): void {
  const validKeys = new Set<string>()
  for (const config of configs) {
    const field = getNodeField(config)
    if (hasStringValue(field)) validKeys.add(field)
  }
  for (const key of Object.keys(filterModel)) {
    if (!validKeys.has(key)) {
      filterModel[key] = undefined
    }
  }
  for (const key of validKeys) {
    if (!(key in filterModel)) {
      filterModel[key] = undefined
    }
  }
}

function getInputFilterModelValue(
  descriptor: InputFilterDescriptor,
  model: Record<string, unknown>,
): unknown {
  return hasStringValue(descriptor.field) ? model[descriptor.field] : undefined
}

function buildInputFilterConditions(
  descriptors: readonly InputFilterDescriptor[],
  model: Record<string, unknown>,
): FilterExpression[] {
  return descriptors
    .map(descriptor => buildCondition(descriptor.config, getInputFilterModelValue(descriptor, model)))
    .filter((expr): expr is FilterExpression => expr !== undefined)
}

function combineFilterConditions(conditions: FilterExpression[]): FilterExpression | undefined {
  if (conditions.length === 0) return undefined
  if (conditions.length === 1) return conditions[0]
  return { type: 'and', children: conditions }
}

function countActiveInputFilters(
  descriptors: readonly InputFilterDescriptor[],
  model: Record<string, unknown>,
): number {
  let count = 0
  for (const descriptor of descriptors) {
    if (!isEmptyFilterValue(getInputFilterModelValue(descriptor, model))) {
      count += 1
    }
  }
  return count
}

function clearFilterModel(model: Record<string, unknown>): void {
  for (const key of Object.keys(model)) {
    model[key] = undefined
  }
}

function getNormalizedDataKey(rawKey: unknown): string | null {
  if (typeof rawKey !== 'string') return null
  const normalized = rawKey.trim()
  return normalized.length > 0 ? normalized : null
}

type FilterApplyMode = 'set' | 'execute'

async function applyFilterSafely(params: {
  view: DataView | null | undefined
  expr: FilterExpression | undefined
  hasFilters: boolean
  logger: ErrorLoggerLike
  message: string
  mode?: FilterApplyMode
}): Promise<boolean> {
  const { view, expr, hasFilters, logger, message, mode = 'set' } = params
  if (!view || !hasFilters) return false

  try {
    if (mode === 'execute') {
      await view.executeFilter(expr)
    } else {
      await view.setFilter(expr)
      // Remote tables: setFilter updates the expression; an explicit refresh is needed
      // to reload data from the server (setFilter alone may not drive a fetch in all paths).
      // Static-data tables are excluded: they apply filters locally without a server round-trip.
      const dt = (view as unknown as { dataTable?: { api?: { list?: unknown }; resourceType?: string } }).dataTable
      if (dt?.api?.list !== undefined && dt.resourceType !== 'static-data') {
        await view.refresh()
      }
    }
    return true
  } catch (error) {
    logger.error(message, error)
    return false
  }
}

export function useFilterPanel(options: UseFilterPanelOptions): FilterPanelState {
  const filterModel = reactive<Record<string, unknown>>({})

  const allFilterNodes = computed(() => {
    const nodes = toValue(options.filterChildren)
    assertFilterNodesArray(nodes)
    return nodes
  })

  const filterDescriptors = computed(() => allFilterNodes.value.map(config => describeFilterNode(config)))

  const descriptorBuckets = computed(() => splitFilterDescriptors(filterDescriptors.value))

  const inputFilterDescriptors = computed(() =>
    descriptorBuckets.value.input
  )

  const filterConfigs = computed(() => inputFilterDescriptors.value.map(descriptor => descriptor.config))

  const residentFieldRefConditions = computed<FilterExpression[]>(() => {
    return descriptorBuckets.value.residentFieldRef.map(descriptor => toResidentFieldRefCondition(descriptor))
  })

  watch(filterConfigs, (configs) => {
    syncFilterModelKeys(filterModel, configs)
  }, { immediate: true })

  const filterExpression = computed<FilterExpression | undefined>(() => {
    const conditions = [
      ...residentFieldRefConditions.value,
      ...buildInputFilterConditions(inputFilterDescriptors.value, filterModel),
    ]
    return combineFilterConditions(conditions)
  })

  const hasRenderableFilters = computed(() => filterConfigs.value.length > 0)
  const hasAnyFilterNodes = computed(() => allFilterNodes.value.length > 0)

  const resolvedFilterDataView = computed(() => toValue(options.dataView))

  watch(resolvedFilterDataView, async (view) => {
    if (filterExpression.value === undefined) return
    await applyFilterSafely({
      view,
      expr: filterExpression.value,
      hasFilters: hasAnyFilterNodes.value,
      logger: options.logger,
      message: FILTER_SYNC_ERROR_MESSAGE,
    })
  }, { immediate: true })

  watch(filterExpression, async (expr) => {
    await applyFilterSafely({
      view: resolvedFilterDataView.value,
      expr,
      hasFilters: hasAnyFilterNodes.value,
      logger: options.logger,
      message: FILTER_APPLY_ERROR_MESSAGE,
    })
  }, { deep: true })

  const activeFilterCount = computed(() => countActiveInputFilters(inputFilterDescriptors.value, filterModel))

  function resetFilters(): Promise<void> {
    clearFilterModel(filterModel)
    return Promise.resolve()
  }

  async function searchFilters(): Promise<void> {
    await applyFilterSafely({
      view: resolvedFilterDataView.value,
      expr: filterExpression.value,
      hasFilters: hasAnyFilterNodes.value,
      logger: options.logger,
      message: FILTER_APPLY_ERROR_MESSAGE,
      mode: 'execute',
    })
  }

  return {
    filterModel,
    filterConfigs,
    hasFilters: hasRenderableFilters,
    activeFilterCount,
    searchFilters,
    resetFilters,
  }
}

// ============================================================
// § useFormDetailContainer
// ============================================================

/**
 * 表单/详情容器的输入约束。
 */
interface FormDetailContainerProps extends SparkNode {
  dataKey: string | undefined
  dataSource?: DataView
  toolbar?: RToolbarProps
  gridColumns: number | undefined
  gridGap: number | string | undefined
  gridAutoRows: string | undefined
}

/**
 * r-form / r-detail 在消费 useFormDetailContainer 时的最小输入形状。
 *
 * 目的：统一两侧组件的入参组装，避免在消费端重复展开同一批可选字段。
 */
export interface FormDetailContainerConsumerProps {
  type: SparkNode['type']
  id?: SparkNode['id']
  toolbar?: RToolbarProps
  children?: SparkNode['children']
  dataSource?: DataView
  dataKey: string | undefined
  gridColumns: number | undefined
  gridGap: number | string | undefined
  gridAutoRows: string | undefined
}

/**
 * 构建 useFormDetailContainer 规范入参。
 *
 * 仅在字段存在时写入可选属性，保持与历史调用结构一致，避免引入 undefined 噪声字段。
 */
export function buildFormDetailContainerProps(
  props: FormDetailContainerConsumerProps,
): FormDetailContainerProps {
  return {
    type: props.type,
    ...(props.id !== undefined ? { id: props.id } : {}),
    ...(props.toolbar !== undefined ? { toolbar: props.toolbar } : {}),
    ...(props.children !== undefined ? { children: props.children } : {}),
    ...(props.dataSource !== undefined ? { dataSource: props.dataSource } : {}),
    dataKey: props.dataKey,
    gridColumns: props.gridColumns,
    gridGap: props.gridGap,
    gridAutoRows: props.gridAutoRows,
  }
}

export function useFormDetailContainer(
  props: FormDetailContainerProps,
  containerType: 'r-form' | 'r-detail',
) {
  // ==========================================================================
  // 分区 1：布局层（children -> 网格投影）
  // 目标：将容器 children 统一投影为可渲染网格结构，避免模板层重复计算。
  // ==========================================================================

  const contentChildren = computed(() => props.children ?? [])

  const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
    children: computed(() => getSparkNodeChildren(contentChildren.value)),
    columns: computed(() => props.gridColumns ?? DEFAULT_GRID_COLUMNS),
    gap: computed(() => props.gridGap ?? DEFAULT_NUMERIC_ZERO),
    autoRows: computed(() => props.gridAutoRows ?? DEFAULT_AUTO_ROWS),
  })

  // ==========================================================================
  // 分区 2：能力接入层（capability / DataView 解析）
  // 目标：统一获取页面能力、模块上下文，并解析 dataKey 对应的 DataView 与数据行。
  // ==========================================================================

  const logPrefix = containerType === 'r-form' ? FORM_CONTAINER_LOG_PREFIX : DETAIL_CONTAINER_LOG_PREFIX

  const { sparkConsume, sparkProvide, logger, registerApi } = useSparkPageComponent(props)

  const moduleContext = useContainerModuleContext(sparkConsume(MODULE_CONTEXT))

  const dataState = useContainerDataSource({
    externalDataSource: toRef(props, 'dataSource'),
    dataKey: toRef(props, 'dataKey'),
    sparkConsume,
    provideDataSource: (view: DataView) => sparkProvide(DATA_SOURCE, view),
    logger,
    logPrefix,
  })

  // ==========================================================================
  // 分区 3：上下文镜像层（DataView -> contextData）
  // 目标：将 DataView 的“当前行/汇总行”镜像到 contextData，供字段组件与表达式统一消费。
  // 约束：镜像是浅层同步，保持对象引用稳定，减少不必要响应式抖动。
  // ==========================================================================

  const contextData = shallowReactive<IDataRow>({})
  let prevRow: unknown = Symbol('initial')

  /**
   * 解析当前容器应绑定的“上下文行”。
   *
   * 规则优先级：
   * 1) 当 dataKey 指向汇总结果时，直接返回聚合行（aggregateResult / selectionAggregateResult）
   * 2) 否则优先使用 dataKey 已解析到的行（resolvedDataRow）
   * 3) 最后回落到 DataView.currentRow
   */
  function resolveContextRow(): IDataRow | null {
    const normalizedKey = getNormalizedDataKey(props.dataKey)
    if (normalizedKey) {
      const view = dataState.resolvedView.value
      const viewSelectionAggregateResult = view?.selectionAggregateResult
      const viewAggregateResult = view?.aggregateResult
      // 选中行汇总：仅统计 selectedRows 的聚合输出。
      if (normalizedKey.endsWith(DATAKEY_SUFFIX_SELECTION_AGGREGATE_RESULT)) {
        return (viewSelectionAggregateResult ?? dataState.selectionAggregateResult.value) as IDataRow
      }
      // 全量汇总：统计当前视图 rows 的聚合输出。
      if (normalizedKey.endsWith(DATAKEY_SUFFIX_AGGREGATE_RESULT)) {
        return (viewAggregateResult ?? dataState.aggregateResult.value) as IDataRow
      }
    }

    return dataState.resolvedDataRow.value ?? dataState.currentRow.value
  }

  /**
   * 将解析出的行同步到 contextData。
   *
   * `skipSameRef` 用于跳过“同引用重复写入”，避免无意义的浅层同步。
   */
  function syncContextDataFromCurrentRow(row: IDataRow | null, options?: { skipSameRef?: boolean }): void {
    if (options?.skipSameRef === true && row === prevRow) return
    prevRow = row
    syncReactiveRow(contextData, row)
  }

  function syncResolvedContextRow(): void {
    syncContextDataFromCurrentRow(resolveContextRow())
  }

  watch(
    resolveContextRow,
    (resolvedRow) => {
      syncContextDataFromCurrentRow(resolvedRow, { skipSameRef: CONTEXT_SYNC_SKIP_SAME_REF })
    },
    { immediate: true },
  )

  // 事件桥接：兜住 DataView 在运行时的关键变化，保证 contextData 与数据态持续一致。
  useDataViewEventBridge({
    resolvedView: dataState.resolvedView,
    // currentRow 变化时，仍以 resolveContextRow 为准，确保汇总 dataKey 不被 currentRow 覆盖。
    onCurrentRowChanged: ({ row }) => {
      const resolvedRow = resolveContextRow()
      syncContextDataFromCurrentRow(resolvedRow ?? row)
    },
    // rows 变化可能导致 currentRow/聚合行失效，统一重算并同步。
    onRowsChanged: () => {
      syncResolvedContextRow()
    },
    // aggregateResult 重算后立即同步到 contextData。
    onSummaryChanged: () => {
      syncResolvedContextRow()
    },
    // selectionAggregateResult 重算后立即同步到 contextData。
    onSelectionSummaryChanged: () => {
      syncResolvedContextRow()
    },
  })

  // ==========================================================================
  // 分区 4：工具栏投影层
  // 目标：统一解析 toolbar 可见项、位置与样式类，供模板直接消费。
  // ==========================================================================

  const {
    visibleToolbarConfigs,
    toolbarPositionValue,
    toolbarClassValue,
    showToolbar,
  } = useContainerToolbar({
    toolbarNode: () => props.toolbar,
  })

  // ==========================================================================
  // 分区 5：作用域构建层
  // 目标：输出字段渲染所需默认作用域，保持 form/detail 的访问面一致。
  // ==========================================================================

  /** 提取作用域公共基底，避免 scope 构造重复。 */
  function scopeBase() {
    return {
      dataSource: dataState.resolvedView.value,
      modelPermission: dataState.modelPermission.value,
      moduleContext: moduleContext.value,
    }
  }

  /**
   * 默认作用域：row/model 均绑定 contextData。
   * 这样字段组件在 form/detail 中使用同一份上下文来源，不区分 current/summary 场景。
   */
  function getDefaultScope() {
    return createCurrentRowScope({
      ...scopeBase(),
      row: contextData,
      model: contextData,
    })
  }

  // ==========================================================================
  // 分区 6：对外输出层
  // ==========================================================================
  return {
    registerApi,
    sparkProvide,
    logger,
    resolvedView: dataState.resolvedView,
    contextData,
    gridChildren,
    gridStyle,
    getChildGridStyle,
    toolbarPositionValue,
    toolbarClassValue,
    visibleToolbarConfigs,
    showToolbar,
    getDefaultScope,
    aggregateResult: dataState.aggregateResult,
    selectionAggregateResult: dataState.selectionAggregateResult,
  }
}

