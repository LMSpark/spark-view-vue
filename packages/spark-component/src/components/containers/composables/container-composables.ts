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
  IDataRow,
  IModelPermission,
  RequestState,
} from '@spark-view/spark-data'
import type { ValueRef } from '../../shared-types.js'
import { resolveDataCapabilitiesFromDataKey } from '../../../core/data-key-resolver.js'
import { extractModelPermission, type ModelPermissionSource } from '../../../permission/index.js'
import type { SparkCapabilityConsumer } from '../../../core/capability-system.js'
import {
  DATA_SOURCE,
  MODULE_CONTEXT,
  PAGE_DATASET,
  PAGE_SERVICE,
  getSparkNodeChildren,
  nodeInputProp,
  useSparkPageComponent,
  type IModuleContext,
  type ModuleContextCapability,
  type SparkNode,
} from '../../internal.js'
export type ToolbarPosition = 'top' | 'bottom' | 'left' | 'right'

import { useRendererFormDetailViewState } from '../data-components/view-state.js'
import type { RToolbarProps } from '../non-data-components/RendererToolbar.types'
import { createCurrentRowScope } from '../support/scopeFactories'
import { syncReactiveRow } from '../../support/row-mirror-sync'

// ============================================================
// § useContainerGrid
// ============================================================

const DEFAULT_GRID_COLUMNS = 24
const DEFAULT_GRID_GAP = '0px'
const DEFAULT_AUTO_ROWS = 'minmax(32px, auto)'

export function normalizeGridGap(value: unknown): string {
  if (typeof value === 'number') return `${value}px`
  if (typeof value === 'string' && value.trim()) return value
  return DEFAULT_GRID_GAP
}

export function normalizeSpan(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.trunc(value))
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) return Math.max(1, parsed)
  }
  return fallback
}

function getSpanValue(child: SparkNode, keys: string[], fallback: number): number {
  for (const key of keys) {
    const value = nodeInputProp(child, key)
    if (value !== undefined) return normalizeSpan(value, fallback)
  }
  return fallback
}

function hasSpanOverride(child: SparkNode, keys: string[]): boolean {
  return keys.some(key => nodeInputProp(child, key) !== undefined)
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

function normalizeAutoFitSpan(rawSpan: number, totalColumns: number, childCount: number): number {
  const safeColumns = Math.max(1, Math.floor(totalColumns))
  const safeChildCount = Math.max(1, Math.floor(childCount))
  const targetColumns = Math.min(safeChildCount, 4)
  const baseSpan = Math.max(1, Math.floor(safeColumns / targetColumns))

  return Math.max(1, Math.round(rawSpan / baseSpan))
}

function getAutoFitTrackCount(childCount: number): number {
  return Math.max(1, Math.min(Math.floor(childCount), 4))
}

export function useContainerGrid(options: UseContainerGridOptions) {
  const gridStyle = computed<CSSProperties>(() => ({
    display: 'grid',
    gridTemplateColumns: toValue(options.autoFitMinWidth ?? '').trim().length > 0
      ? `repeat(auto-fit, minmax(${toValue(options.autoFitMinWidth ?? '')}, 1fr))`
      : `repeat(${Math.max(toValue(options.columns ?? DEFAULT_GRID_COLUMNS), 1)}, minmax(0, 1fr))`,
    gap: normalizeGridGap(toValue(options.gap ?? DEFAULT_GRID_GAP)),
    gridAutoRows: toValue(options.autoRows ?? DEFAULT_AUTO_ROWS) || DEFAULT_AUTO_ROWS,
    alignItems: 'start',
  }))

  function getChildGridStyle(child: SparkNode, index?: number): CSSProperties {
    const children = toValue(options.children)
    const columns = Math.max(toValue(options.columns ?? DEFAULT_GRID_COLUMNS), 1)
    const autoFitMinWidth = toValue(options.autoFitMinWidth ?? '').trim()
    const hasAutoFit = autoFitMinWidth.length > 0
    const spanKeys = ['colSpan', 'gridColSpan', 'span']
    const defaultColSpanValue = toValue(options.defaultColSpan)
    const defaultColSpan = defaultColSpanValue ?? DEFAULT_GRID_COLUMNS
    const rawColSpan = getSpanValue(child, spanKeys, defaultColSpan)
    const hasExplicitColSpan = hasSpanOverride(child, spanKeys) || defaultColSpanValue !== undefined
    const colSpan = hasAutoFit
      ? normalizeAutoFitSpan(rawColSpan, columns, children.length)
      : rawColSpan
    const rowSpan = getSpanValue(child, ['rowSpan', 'gridRowSpan'], 1)

    let finalColSpan = colSpan

    if (options.autoFillLastRow && index !== undefined) {
      if (hasAutoFit) {
        const trackCount = getAutoFitTrackCount(children.length)
        const baseSpan = hasExplicitColSpan ? Math.max(1, colSpan) : 1
        const itemsPerRow = Math.max(1, Math.floor(trackCount / baseSpan))
        const remainder = children.length % itemsPerRow
        const lastRowItemCount = remainder === 0 ? itemsPerRow : remainder
        const lastRowStartIndex = children.length - lastRowItemCount

        if (index >= lastRowStartIndex) {
          if (lastRowItemCount === 1) {
            finalColSpan = trackCount
          } else if (lastRowItemCount === 2 && trackCount % 2 === 0) {
            finalColSpan = Math.max(baseSpan, trackCount / 2)
          } else if (!hasExplicitColSpan) {
            finalColSpan = 1
          }
        }
      } else {
        const itemsPerRow = Math.max(1, Math.floor(columns / colSpan))
        const lastRowStartIndex = Math.floor(children.length / itemsPerRow) * itemsPerRow

        if (index >= lastRowStartIndex) {
          const lastRowItemCount = children.length - lastRowStartIndex
          if (lastRowItemCount > 0 && lastRowItemCount < itemsPerRow) {
            finalColSpan = Math.ceil(columns / lastRowItemCount)
          }
        }
      }
    }

    const childGridStyle: CSSProperties = {
      gridRow: `span ${rowSpan} / span ${rowSpan}`,
      minWidth: 0,
    }

    if (!hasAutoFit || hasExplicitColSpan || finalColSpan > 1) {
      childGridStyle.gridColumn = `span ${finalColSpan} / span ${finalColSpan}`
    }

    return childGridStyle
  }

  return {
    gridStyle,
    getChildGridStyle,
    gridChildren: computed(() => toValue(options.children)),
  }
}

// ============================================================
// § useCompositeItemGrid
// ============================================================

interface UseCompositeItemGridOptions {
  children?: () => SparkNode['children'] | undefined
  bodyClass?: () => unknown
  gridColumns?: () => unknown
  gridAutoRows?: () => unknown
  gridGap?: () => unknown
}

export function useCompositeItemGrid(options: UseCompositeItemGridOptions) {
  const contentChildren = computed<SparkNode[]>(() => {
    const children = options.children?.()
    return getSparkNodeChildren(children)
  })

  const contentBodyClass = computed(() => {
    const bodyClass = options.bodyClass?.()
    return typeof bodyClass === 'string' ? bodyClass : ''
  })

  const {
    gridStyle: contentGridStyle,
    getChildGridStyle: getContentChildGridStyle,
  } = useContainerGrid({
    children: () => contentChildren.value,
    columns: () => {
      const value = options.gridColumns?.()
      if (typeof value === 'number' && Number.isFinite(value)) return value
      if (typeof value === 'string') {
        const parsed = Number.parseInt(value, 10)
        if (Number.isFinite(parsed)) return parsed
      }
      return 24
    },
    gap: () => {
      const value = options.gridGap?.()
      return typeof value === 'number' || typeof value === 'string' ? value : 0
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
// § useContainerDataSource
// ============================================================

interface ErrorLoggerLike {
  error(message: string, error?: unknown): void
}

interface LoggerLike extends ErrorLoggerLike {
  warn(message: string): void
}

interface UseContainerDataSourceOptions<TSource> {
  dataKey: ValueRef<string | undefined>
  sparkConsume: SparkCapabilityConsumer
  mapView: (view: DataView) => TSource
  externalDataSource?: ValueRef<TSource | undefined>
  inheritedDataSource?: ValueRef<TSource | null | undefined>
  provideDataSource?: (source: TSource) => void
  logger?: LoggerLike
  logPrefix?: string
  /**
   * 设为 true 可跳过 effects（provideDataSource + autoLoad）。
   * 当调用方自行管理数据加载生命周期时使用（如 RendererFilter）。
   * @default false
   */
  skipEffects?: boolean
}

interface UseContainerDataSourceEffectsOptions<TSource> {
  resolvedDataSource: ComputedRef<TSource | null>
  provideDataSource?: (source: TSource) => void
  logger: LoggerLike
  logPrefix: string
}

export function useContainerDataSource<TSource>(options: UseContainerDataSourceOptions<TSource>) {
  const pageDataSet = options.sparkConsume(PAGE_DATASET)

  function pickRowFromSource(source: unknown): IDataRow | null {
    if (source === null || source === undefined || typeof source !== 'object') return null
    const currentRow = (source as { currentRow?: unknown }).currentRow
    if (currentRow === null || currentRow === undefined || typeof currentRow !== 'object' || Array.isArray(currentRow)) return null
    return currentRow as IDataRow
  }

  const resolvedDataRow = computed<IDataRow | null>(() => {
    const provided = options.externalDataSource?.value
    if (provided !== undefined) return pickRowFromSource(provided)

    const capabilities = resolveDataCapabilitiesFromDataKey(options.dataKey.value, pageDataSet)
    if (capabilities.dataRow !== null) return capabilities.dataRow

    const inherited = options.inheritedDataSource?.value
    return pickRowFromSource(inherited)
  })

  const resolvedDataSource = computed<TSource | null>(() => {
    const provided = options.externalDataSource?.value
    if (provided !== undefined) return provided

    const capabilities = resolveDataCapabilitiesFromDataKey(options.dataKey.value, pageDataSet)
    if (capabilities.dataSource) return options.mapView(capabilities.dataSource)

    const inherited = options.inheritedDataSource?.value
    if (inherited !== null && inherited !== undefined) return inherited

    return null
  })

  const modelPermission = computed<IModelPermission | undefined>(() =>
    extractModelPermission(resolvedDataSource.value as ModelPermissionSource | null)
  )

  if (!options.skipEffects) {
    useContainerDataSourceEffects({
      resolvedDataSource,
      ...(options.provideDataSource ? { provideDataSource: options.provideDataSource } : {}),
      logger: options.logger ?? {
        warn: () => {},
        error: () => {},
      },
      logPrefix: options.logPrefix ?? 'useContainerDataSource',
    })
  }

  return {
    resolvedDataSource,
    resolvedDataRow,
    modelPermission,
  }
}

export function useContainerDataSourceEffects<TSource>(options: UseContainerDataSourceEffectsOptions<TSource>) {
  function shouldAutoLoad(view: DataView): boolean {
    if (typeof view.requestData !== 'function') return false

    const autoLoadState = view as { autoLoad?: boolean; autoLoadConfigured?: boolean }
    if (autoLoadState.autoLoadConfigured === true && autoLoadState.autoLoad === false) return false

    const dataTable = view.dataTable
    if (dataTable?.resourceType === 'static-data') return false
    if (!dataTable?.api?.list) return false

    return true
  }

  function tryAutoLoad(source: TSource | null): void {
    if (source === null) return
    const maybeView = source as DataView
    if (!shouldAutoLoad(maybeView)) return

    void maybeView.requestData().catch((error: unknown) => {
      options.logger.error(`${options.logPrefix}: requestData() 失败`, error)
    })
  }

  watch(options.resolvedDataSource, (source) => {
    if (source === null) return
    options.provideDataSource?.(source)
    tryAutoLoad(source)
  }, { immediate: true })
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
  const fallbackClass = options.defaultClass ?? 'renderer-toolbar-default'
  const fallbackPosition = options.defaultPosition ?? 'top'

  const visibleToolbarConfigs = computed(() =>
    getSparkNodeChildren(toValue(options.toolbarNode)?.children)
  )

  const toolbarPositionValue = computed<ToolbarPosition>(() => {
    const position = toValue(options.toolbarNode)?.position
    return position === 'top' || position === 'bottom' || position === 'left' || position === 'right'
      ? position
      : fallbackPosition
  })

  const toolbarClassValue = computed(() => {
    const className = toValue(options.toolbarNode)?.class
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
  state: RequestState
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
  resolvedView: ValueRef<DataView | null | undefined>
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
    eventName: 'currentRowChanged' | 'selectedRowsChanged',
  ): boolean => {
    if (options.ignoreOriginatorId && originatorId === options.ignoreOriginatorId) {
      options.onIgnoredByOriginatorId?.({ originatorId, view, eventName })
      return false
    }

    if (options.shouldDispatchByOriginatorId && !options.shouldDispatchByOriginatorId({ originatorId, view, eventName })) {
      options.onIgnoredByOriginatorId?.({ originatorId, view, eventName })
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

    const handleCurrentRowChanged = (row: IDataRow | null, originatorId?: string) => {
      if (!shouldDispatchByOriginator(originatorId, view, 'currentRowChanged')) return
      runWithErrorBoundary('currentRowChanged', view, () =>
        options.onCurrentRowChanged?.({
          row,
          ...(originatorId !== undefined ? { originatorId } : {}),
          view,
          eventName: 'currentRowChanged',
        })
      )
    }

    const handleSelectedRowsChanged = (rows: IDataRow[], originatorId?: string) => {
      if (!shouldDispatchByOriginator(originatorId, view, 'selectedRowsChanged')) return
      runWithErrorBoundary('selectedRowsChanged', view, () =>
        options.onSelectedRowsChanged?.({
          rows,
          ...(originatorId !== undefined ? { originatorId } : {}),
          view,
          eventName: 'selectedRowsChanged',
        })
      )
    }

    const handleRowsChanged = () => {
      runWithErrorBoundary('rowsChanged', view, () =>
        options.onRowsChanged?.({ view, eventName: 'rowsChanged' })
      )
    }

    const handleCleared = () => {
      runWithErrorBoundary('cleared', view, () =>
        options.onCleared?.({ view, eventName: 'cleared' })
      )
    }

    const handleRequestStateChanged = (state: RequestState) => {
      runWithErrorBoundary('requestStateChanged', view, () =>
        options.onRequestStateChanged?.({ state, view, eventName: 'requestStateChanged' })
      )
    }

    const handleSummaryChanged = () => {
      runWithErrorBoundary('summaryChanged', view, () =>
        options.onSummaryChanged?.({ view, eventName: 'summaryChanged' })
      )
    }

    const handleSelectionSummaryChanged = () => {
      runWithErrorBoundary('selectionSummaryChanged', view, () =>
        options.onSelectionSummaryChanged?.({ view, eventName: 'selectionSummaryChanged' })
      )
    }

    const handleMutatingChanged = (mutating: boolean) => {
      runWithErrorBoundary('mutatingChanged', view, () =>
        options.onMutatingChanged?.({ mutating, view, eventName: 'mutatingChanged' })
      )
    }

    if (options.onCurrentRowChanged) view.events.on('currentRowChanged', handleCurrentRowChanged)
    if (options.onSelectedRowsChanged) view.events.on('selectedRowsChanged', handleSelectedRowsChanged)
    if (options.onRowsChanged) view.events.on('rowsChanged', handleRowsChanged)
    if (options.onCleared) view.events.on('cleared', handleCleared)
    if (options.onRequestStateChanged) view.events.on('requestStateChanged', handleRequestStateChanged)
    if (options.onSummaryChanged) view.events.on('summaryChanged', handleSummaryChanged)
    if (options.onSelectionSummaryChanged) view.events.on('selectionSummaryChanged', handleSelectionSummaryChanged)
    if (options.onMutatingChanged) view.events.on('mutatingChanged', handleMutatingChanged)

    onCleanup(() => {
      if (options.onCurrentRowChanged) view.events.off('currentRowChanged', handleCurrentRowChanged)
      if (options.onSelectedRowsChanged) view.events.off('selectedRowsChanged', handleSelectedRowsChanged)
      if (options.onRowsChanged) view.events.off('rowsChanged', handleRowsChanged)
      if (options.onCleared) view.events.off('cleared', handleCleared)
      if (options.onRequestStateChanged) view.events.off('requestStateChanged', handleRequestStateChanged)
      if (options.onSummaryChanged) view.events.off('summaryChanged', handleSummaryChanged)
      if (options.onSelectionSummaryChanged) view.events.off('selectionSummaryChanged', handleSelectionSummaryChanged)
      if (options.onMutatingChanged) view.events.off('mutatingChanged', handleMutatingChanged)
    })
  })
}

export function useDataViewSyncGuard() {
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
  filterChildren: ValueRef<SparkNode[]>
  dataView: ValueRef<DataView | null>
  logger: ErrorLoggerLike
}

interface FilterCapableView {
  setFilter?: (expr: FilterExpression | undefined) => Promise<void> | void
  refresh?: () => Promise<void> | void
  filterExpression?: FilterExpression
  getColumn?: (name: string) => unknown
  columns?: Array<{ name?: string; field?: string }>
  dataTable?: {
    resourceType?: string
    api?: {
      list?: unknown
    }
  }
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

function shouldRefreshFilterView(view: DataView): boolean {
  const dataTable = (view as unknown as FilterCapableView).dataTable
  if (dataTable?.api?.list === undefined) return false
  if (dataTable.resourceType === 'static-data') return false
  return true
}

function isSameFilterExpression(
  left: FilterExpression | undefined,
  right: FilterExpression | undefined,
): boolean {
  if (left === right) return true
  if (!left || !right) return false
  return JSON.stringify(left) === JSON.stringify(right)
}

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

function inferFilterOperator(config: SparkNode, value: unknown): FilterOperator {
  const explicit = nodeInputProp(config, 'filterOp') ?? nodeInputProp(config, 'filterOperator')
  if (typeof explicit === 'string') return explicit as FilterOperator
  if (Array.isArray(value)) {
    if (isRangeFilterConfig(config) || config.type === 'r-date' || config.type === 'r-number') {
      return 'between'
    }
    return 'in'
  }

  switch (config.type) {
    case 'r-text':
      return 'contains'
    default:
      return '=='
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

function hasKnownColumns(view: FilterCapableView): boolean {
  return typeof view.getColumn === 'function' || Array.isArray(view.columns)
}

function hasColumn(view: FilterCapableView, name: string): boolean {
  if (typeof view.getColumn === 'function') {
    return view.getColumn(name) !== undefined
  }
  return (view.columns ?? []).some(column => column.name === name || column.field === name)
}

function assertResidentFieldRefsExist(
  view: DataView | null,
  descriptors: FilterDescriptor[],
): void {
  if (!view) return

  const candidate = view as unknown as FilterCapableView
  if (!hasKnownColumns(candidate)) return

  for (const descriptor of descriptors) {
    if (!isResidentFieldRefDescriptor(descriptor)) continue
    if (!hasColumn(candidate, descriptor.refField)) {
      throw new Error(`RendererFilter: filterValueRefField 引用了不存在的字段 ${descriptor.refField}`)
    }
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

function buildCondition(config: SparkNode, value: unknown): FilterExpression | undefined {
  const field = getNodeField(config)
  if (!field || isEmptyFilterValue(value)) return undefined

  return {
    field,
    op: inferFilterOperator(config, value),
    value: value as FilterValueExpression,
  }
}

export function useFilterPanel(options: UseFilterPanelOptions) {
  const filterModel = reactive<Record<string, unknown>>({})

  const allFilterNodes = computed(() => {
    const nodes = options.filterChildren.value
    assertFilterNodesArray(nodes)
    return nodes
  })

  const filterDescriptors = computed(() => {
    return allFilterNodes.value.map(config => describeFilterNode(config))
  })

  assertResidentFieldRefsExist(
    options.dataView.value,
    filterDescriptors.value,
  )

  const filterConfigs = computed(() => {
    return filterDescriptors.value
      .filter(isInputFilterDescriptor)
      .map(descriptor => descriptor.config)
  })

  const residentFieldRefConditions = computed<FilterExpression[]>(() => {
    return filterDescriptors.value
      .filter(isResidentFieldRefDescriptor)
      .map(descriptor => ({
        field: descriptor.field,
        op: descriptor.op,
        value: {
          kind: 'field',
          field: descriptor.refField,
        } as FilterValueExpression,
      }))
  })

  watch(filterConfigs, (configs) => {
    const nextKeys = new Set(configs.map(config => getNodeField(config)).filter((name): name is string => typeof name === 'string'))
    for (const key of Object.keys(filterModel)) {
      if (!nextKeys.has(key)) {
        filterModel[key] = undefined
      }
    }
    for (const key of nextKeys) {
      if (!(key in filterModel)) {
        filterModel[key] = undefined
      }
    }
  }, { immediate: true })

  const filterExpression = computed<FilterExpression | undefined>(() => {
    const conditions = [
      ...residentFieldRefConditions.value,
      ...filterDescriptors.value
        .filter(isInputFilterDescriptor)
        .map(descriptor => {
          return buildCondition(
            descriptor.config,
            typeof descriptor.field === 'string' ? filterModel[descriptor.field] : undefined,
          )
        })
        .filter((expr): expr is FilterExpression => expr !== undefined),
    ]

    if (conditions.length === 0) return undefined
    if (conditions.length === 1) return conditions[0]
    return { type: 'and', children: conditions }
  })

  const hasRenderableFilters = computed(() => filterConfigs.value.length > 0)
  const hasAnyFilterNodes = computed(() => allFilterNodes.value.length > 0)

  async function applyFilterToView(
    view: DataView,
    expr: FilterExpression | undefined,
    refreshRemote: boolean,
  ): Promise<void> {
    if (!hasAnyFilterNodes.value) return

    assertResidentFieldRefsExist(
      view,
      filterDescriptors.value,
    )

    const candidate = view as unknown as FilterCapableView
    if (typeof candidate.setFilter !== 'function') return
    if (isSameFilterExpression(candidate.filterExpression, expr)) return

    await candidate.setFilter(expr)

    if (
      refreshRemote
      && shouldRefreshFilterView(view)
      && typeof candidate.refresh === 'function'
    ) {
      await candidate.refresh()
    }
  }

  let initialized = false

  watch(() => options.dataView.value, async (view) => {
    if (!view) return
    try {
      await applyFilterToView(view, filterExpression.value, false)
      initialized = true
    } catch (error) {
      options.logger.error('RendererFilter: 同步过滤表达式失败', error)
    }
  }, { immediate: true })

  watch(filterExpression, async (expr) => {
    const view = options.dataView.value
    if (!view) return
    try {
      await applyFilterToView(view, expr, initialized)
    } catch (error) {
      options.logger.error('RendererFilter: 应用过滤失败', error)
    } finally {
      initialized = true
    }
  }, { deep: true })

  const activeFilterCount = computed(() => {
    let count = 0
    for (const descriptor of filterDescriptors.value) {
      if (!isInputFilterDescriptor(descriptor)) continue
      if (typeof descriptor.field === 'string' && !isEmptyFilterValue(filterModel[descriptor.field])) {
        count++
      }
    }
    return count
  })

  async function resetFilters(): Promise<void> {
    for (const key of Object.keys(filterModel)) {
      filterModel[key] = undefined
    }
    const view = options.dataView.value
    if (!view || !hasAnyFilterNodes.value) return
    try {
      await applyFilterToView(view, filterExpression.value, true)
    } catch (error) {
      options.logger.error('RendererFilter: 重置过滤失败', error)
    }
  }

  async function searchFilters(): Promise<void> {
    const view = options.dataView.value
    if (!view || !hasAnyFilterNodes.value) return
    try {
      await applyFilterToView(view, filterExpression.value, true)
    } catch (error) {
      options.logger.error('RendererFilter: 应用过滤失败', error)
    }
  }

  return {
    filterModel,
    filterConfigs,
    filterExpression,
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

export function useFormDetailContainer(
  props: FormDetailContainerProps,
  containerType: 'r-form' | 'r-detail',
) {
  // ==========================================================================
  // 分区 1：布局输入与内容区网格
  // ==========================================================================

  const contentChildren = computed(() => props.children ?? [])

  const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
    children: computed(() => getSparkNodeChildren(contentChildren.value)),
    columns: computed(() => props.gridColumns ?? 24),
    gap: computed(() => props.gridGap ?? 0),
    autoRows: computed(() => props.gridAutoRows ?? 'minmax(32px, auto)'),
  })

  // ==========================================================================
  // 分区 2：能力接入与 DataView 解析
  // ==========================================================================

  const logPrefix = containerType === 'r-form' ? 'RendererForm' : 'RendererDetail'

  const { sparkConsume, sparkProvide, logger, registerApi } = useSparkPageComponent(props)

  const pageService = sparkConsume(PAGE_SERVICE)

  const moduleContext = useContainerModuleContext(sparkConsume(MODULE_CONTEXT))

  const { resolvedDataSource: resolvedView, modelPermission } = useContainerDataSource<DataView>({
    externalDataSource: toRef(props, 'dataSource'),
    dataKey: toRef(props, 'dataKey'),
    sparkConsume,
    mapView: view => view,
    provideDataSource: (view: DataView) => sparkProvide(DATA_SOURCE, view),
    logger,
    logPrefix,
  })

  const { currentRow } = useRendererFormDetailViewState({ resolvedView })

  // ==========================================================================
  // 分区 3：currentRow -> contextData 同步镜像
  // ==========================================================================

  const contextData = shallowReactive<IDataRow>({})
  let prevRow: unknown = Symbol('initial')

  watch(
    currentRow,
    (row) => {
      if (row === prevRow) return
      prevRow = row
      syncReactiveRow(contextData, row)
    },
    { immediate: true },
  )

  useDataViewEventBridge({
    resolvedView,
    onCurrentRowChanged: ({ row }) => {
      syncReactiveRow(contextData, row)
    },
    onRowsChanged: () => {
      syncReactiveRow(contextData, currentRow.value)
    },
  })

  // ==========================================================================
  // 分区 4：工具栏视图态投影
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
  // 分区 5：作用域构建
  // ==========================================================================

  function scopeBase() {
    return {
      dataSource: resolvedView.value,
      modelPermission: modelPermission.value,
      moduleContext: moduleContext.value,
    }
  }

  function getDefaultScope() {
    return createCurrentRowScope({
      ...scopeBase(),
      row: contextData,
      model: contextData,
    })
  }

  // ==========================================================================
  // 分区 6：对外输出
  // ==========================================================================
  return {
    registerApi,
    sparkProvide,
    logger,
    pageService,
    resolvedView,
    contextData,
    gridChildren,
    gridStyle,
    getChildGridStyle,
    toolbarPositionValue,
    toolbarClassValue,
    visibleToolbarConfigs,
    showToolbar,
    getDefaultScope,
  }
}

