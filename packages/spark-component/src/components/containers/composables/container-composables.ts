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
  IModelPermission,
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

type OptionalString = string | null | undefined
type OptionalStringOrNumber = string | number | null | undefined

const DEFAULT_LOGGER: LoggerLike = {
  warn: () => {},
  error: () => {},
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
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

export function normalizeGridGap(value: unknown): string {
  if (typeof value === 'number') return `${value}px`
  if (typeof value === 'string' && value.trim()) return value
  return DEFAULT_GRID_GAP
}

export function normalizeSpan(value: unknown, fallback: number): number {
  const parsed = toFiniteInteger(value)
  if (parsed !== undefined) return Math.max(1, parsed)
  return fallback
}

function getSpanValue(child: SparkNode, keys: readonly string[], fallback: number): number {
  for (const key of keys) {
    const value = nodeInputProp(child, key)
    if (value !== undefined) return normalizeSpan(value, fallback)
  }
  return fallback
}

function hasSpanOverride(child: SparkNode, keys: readonly string[]): boolean {
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

export interface ContainerGridState {
  gridStyle: ComputedRef<CSSProperties>
  getChildGridStyle: (child: SparkNode, index?: number) => CSSProperties
  gridChildren: ComputedRef<SparkNode[]>
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

export function useContainerGrid(options: UseContainerGridOptions): ContainerGridState {
  function resolveColumns(): number {
    return Math.max(toValue(options.columns ?? DEFAULT_GRID_COLUMNS), 1)
  }

  function resolveAutoFitMinWidth(): string {
    return toNonEmptyString(toValue(options.autoFitMinWidth ?? ''))
  }

  function resolveGridTemplateColumns(): string {
    const autoFitMinWidth = resolveAutoFitMinWidth()
    if (autoFitMinWidth.length > 0) {
      return `repeat(auto-fit, minmax(${autoFitMinWidth}, 1fr))`
    }
    return `repeat(${resolveColumns()}, minmax(0, 1fr))`
  }

  const gridStyle = computed<CSSProperties>(() => ({
    display: 'grid',
    gridTemplateColumns: resolveGridTemplateColumns(),
    gap: normalizeGridGap(toValue(options.gap ?? DEFAULT_GRID_GAP)),
    gridAutoRows: toValue(options.autoRows ?? DEFAULT_AUTO_ROWS) || DEFAULT_AUTO_ROWS,
    alignItems: 'start',
  }))

  function getChildGridStyle(child: SparkNode, index?: number): CSSProperties {
    const children = toValue(options.children)
    const columns = resolveColumns()
    const autoFitMinWidth = resolveAutoFitMinWidth()
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
  dataKey: MaybeRefOrGetter<string | undefined>
  sparkConsume: SparkCapabilityConsumer
  mapView: (view: DataView) => TSource
  externalDataSource?: MaybeRefOrGetter<TSource | undefined>
  inheritedDataSource?: MaybeRefOrGetter<TSource | null | undefined>
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

export interface ContainerDataSourceState<TSource> {
  resolvedDataSource: ComputedRef<TSource | null>
  resolvedDataRow: ComputedRef<IDataRow | null>
  modelPermission: ComputedRef<IModelPermission | undefined>
}

export function useContainerDataSource<TSource>(options: UseContainerDataSourceOptions<TSource>): ContainerDataSourceState<TSource> {
  const pageDataSet = options.sparkConsume(PAGE_DATASET)
  const capabilities = computed(() => resolveDataCapabilitiesFromDataKey(toValue(options.dataKey), pageDataSet))

  function resolveProvidedSource(): TSource | undefined {
    const provided = options.externalDataSource !== undefined
      ? toValue(options.externalDataSource)
      : undefined
    return provided
  }

  function pickRowFromSource(source: unknown): IDataRow | null {
    if (source === null || source === undefined || typeof source !== 'object') return null
    const currentRow = (source as { currentRow?: unknown }).currentRow
    if (currentRow === null || currentRow === undefined || typeof currentRow !== 'object' || Array.isArray(currentRow)) return null
    return currentRow as IDataRow
  }

  const resolvedDataRow = computed<IDataRow | null>(() => {
    const provided = resolveProvidedSource()
    if (provided !== undefined) return pickRowFromSource(provided)

    if (capabilities.value.dataRow !== null) return capabilities.value.dataRow

    const inherited = options.inheritedDataSource !== undefined
      ? toValue(options.inheritedDataSource)
      : undefined
    return pickRowFromSource(inherited)
  })

  const resolvedDataSource = computed<TSource | null>(() => {
    const provided = resolveProvidedSource()
    if (provided !== undefined) return provided

    if (capabilities.value.dataSource) return options.mapView(capabilities.value.dataSource)

    const inherited = options.inheritedDataSource !== undefined
      ? toValue(options.inheritedDataSource)
      : undefined
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
      logger: options.logger ?? DEFAULT_LOGGER,
      logPrefix: options.logPrefix ?? 'useContainerDataSource',
    })
  }

  return {
    resolvedDataSource,
    resolvedDataRow,
    modelPermission,
  }
}

export function useContainerDataSourceEffects<TSource>(options: UseContainerDataSourceEffectsOptions<TSource>): void {
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

  function runSourceEffects(source: TSource | null): void {
    if (source === null) return
    options.provideDataSource?.(source)
    tryAutoLoad(source)
  }

  watch(options.resolvedDataSource, (source) => {
    runSourceEffects(source)
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
  const toolbarNodeValue = computed(() => toValue(options.toolbarNode))

  const visibleToolbarConfigs = computed(() =>
    getSparkNodeChildren(toolbarNodeValue.value?.children)
  )

  const toolbarPositionValue = computed<ToolbarPosition>(() => {
    const position = toolbarNodeValue.value?.position
    return position === 'top' || position === 'bottom' || position === 'left' || position === 'right'
      ? position
      : fallbackPosition
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

type DataViewBridgeEventArgs =
  | [currentRow: IDataRow | null, originatorId?: string]
  | [selectedRows: IDataRow[], originatorId?: string]
  | []
  | [requestState: NonNullable<IDataSource['requestState']>]
  | [mutating: boolean]

type DataViewBridgeEventHandler = (...args: DataViewBridgeEventArgs) => void

interface DataViewBridgeRegistration {
  enabled: boolean
  eventName: DataViewBridgeEventName
  handler: unknown
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

    const runNoArgEvent = (
      eventName: Extract<DataViewBridgeEventName, 'rowsChanged' | 'cleared' | 'summaryChanged' | 'selectionSummaryChanged'>,
      runner: () => void | Promise<void>,
    ) => {
      runWithErrorBoundary(eventName, view, runner)
    }

    const runOriginatorEvent = (
      eventName: Extract<DataViewBridgeEventName, 'currentRowChanged' | 'selectedRowsChanged'>,
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

    const handleRowsChanged = () => {
      runNoArgEvent('rowsChanged', () =>
        options.onRowsChanged?.({ view, eventName: 'rowsChanged' })
      )
    }

    const handleCleared = () => {
      runNoArgEvent('cleared', () =>
        options.onCleared?.({ view, eventName: 'cleared' })
      )
    }

    const handleRequestStateChanged = (state: NonNullable<IDataSource['requestState']>) => {
      runWithErrorBoundary('requestStateChanged', view, () =>
        options.onRequestStateChanged?.({ state, view, eventName: 'requestStateChanged' })
      )
    }

    const handleSummaryChanged = () => {
      runNoArgEvent('summaryChanged', () =>
        options.onSummaryChanged?.({ view, eventName: 'summaryChanged' })
      )
    }

    const handleSelectionSummaryChanged = () => {
      runNoArgEvent('selectionSummaryChanged', () =>
        options.onSelectionSummaryChanged?.({ view, eventName: 'selectionSummaryChanged' })
      )
    }

    const handleMutatingChanged = (mutating: boolean) => {
      runWithErrorBoundary('mutatingChanged', view, () =>
        options.onMutatingChanged?.({ mutating, view, eventName: 'mutatingChanged' })
      )
    }

    const cleanupHandlers: Array<() => void> = []

    const registerBridgeEvent = (
      enabled: boolean,
      eventName: DataViewBridgeEventName,
      handler: unknown,
    ): void => {
      if (!enabled) return
      const subscribedHandler = handler as DataViewBridgeEventHandler
      view.events.on(eventName, subscribedHandler)
      cleanupHandlers.push(() => {
        view.events.off(eventName, subscribedHandler)
      })
    }

    const registrations: readonly DataViewBridgeRegistration[] = [
      { enabled: Boolean(options.onCurrentRowChanged), eventName: 'currentRowChanged', handler: handleCurrentRowChanged },
      { enabled: Boolean(options.onSelectedRowsChanged), eventName: 'selectedRowsChanged', handler: handleSelectedRowsChanged },
      { enabled: Boolean(options.onRowsChanged), eventName: 'rowsChanged', handler: handleRowsChanged },
      { enabled: Boolean(options.onCleared), eventName: 'cleared', handler: handleCleared },
      { enabled: Boolean(options.onRequestStateChanged), eventName: 'requestStateChanged', handler: handleRequestStateChanged },
      { enabled: Boolean(options.onSummaryChanged), eventName: 'summaryChanged', handler: handleSummaryChanged },
      { enabled: Boolean(options.onSelectionSummaryChanged), eventName: 'selectionSummaryChanged', handler: handleSelectionSummaryChanged },
      { enabled: Boolean(options.onMutatingChanged), eventName: 'mutatingChanged', handler: handleMutatingChanged },
    ]

    for (const registration of registrations) {
      registerBridgeEvent(registration.enabled, registration.eventName, registration.handler)
    }

    onCleanup(() => {
      for (const cleanup of cleanupHandlers) cleanup()
    })
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

function syncFilterModelKeys(
  filterModel: Record<string, unknown>,
  configs: readonly SparkNode[],
): void {
  const validKeys = new Set<string>()
  for (const config of configs) {
    const field = getNodeField(config)
    if (typeof field === 'string') validKeys.add(field)
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
  return typeof descriptor.field === 'string' ? model[descriptor.field] : undefined
}

export function useFilterPanel(options: UseFilterPanelOptions): FilterPanelState {
  const filterModel = reactive<Record<string, unknown>>({})

  const allFilterNodes = computed(() => {
    const nodes = toValue(options.filterChildren)
    assertFilterNodesArray(nodes)
    return nodes
  })

  const filterDescriptors = computed(() => {
    return allFilterNodes.value.map(config => describeFilterNode(config))
  })

  const inputFilterDescriptors = computed(() =>
    filterDescriptors.value.filter(isInputFilterDescriptor)
  )

  const filterConfigs = computed(() => inputFilterDescriptors.value.map(descriptor => descriptor.config))

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
    syncFilterModelKeys(filterModel, configs)
  }, { immediate: true })

  const filterExpression = computed<FilterExpression | undefined>(() => {
    const conditions = [
      ...residentFieldRefConditions.value,
      ...inputFilterDescriptors.value
        .map(descriptor => {
          return buildCondition(descriptor.config, getInputFilterModelValue(descriptor, filterModel))
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
    forceExecute = false,
  ): Promise<void> {
    if (!hasAnyFilterNodes.value) return
    if (forceExecute) {
      await view.executeFilter(expr)
      return
    }
    await view.setFilter(expr)
  }

  async function applyWithHandledError(
    view: DataView,
    expr: FilterExpression | undefined,
    errorMessage: string,
    forceExecute = false,
  ): Promise<boolean> {
    try {
      await applyFilterToView(view, expr, forceExecute)
      return true
    } catch (error) {
      options.logger.error(errorMessage, error)
      return false
    }
  }

  async function withActiveFilterView(action: (view: DataView) => Promise<void>): Promise<void> {
    const view = toValue(options.dataView)
    if (!view || !hasAnyFilterNodes.value) return
    await action(view)
  }

  watch(() => toValue(options.dataView), async (view) => {
    if (!view) return
    await applyWithHandledError(view, filterExpression.value, 'RendererFilter: 同步过滤表达式失败')
  }, { immediate: true })

  watch(filterExpression, async (expr) => {
    const view = toValue(options.dataView)
    if (!view) return
    await applyWithHandledError(view, expr, 'RendererFilter: 应用过滤失败')
  }, { deep: true })

  const activeFilterCount = computed(() => {
    let count = 0
    for (const descriptor of inputFilterDescriptors.value) {
      if (!isEmptyFilterValue(getInputFilterModelValue(descriptor, filterModel))) {
        count++
      }
    }
    return count
  })

  function resetFilters(): Promise<void> {
    for (const key of Object.keys(filterModel)) {
      filterModel[key] = undefined
    }
    return Promise.resolve()
  }

  async function searchFilters(): Promise<void> {
    await withActiveFilterView(async (view) => {
      await applyWithHandledError(view, filterExpression.value, 'RendererFilter: 应用过滤失败', true)
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

  const { resolvedDataSource: resolvedView, resolvedDataRow, modelPermission } = useContainerDataSource<DataView>({
    externalDataSource: toRef(props, 'dataSource'),
    dataKey: toRef(props, 'dataKey'),
    sparkConsume,
    mapView: view => view,
    provideDataSource: (view: DataView) => sparkProvide(DATA_SOURCE, view),
    logger,
    logPrefix,
  })

  const { currentRow, aggregateResult, selectionAggregateResult } = useRendererFormDetailViewState({ resolvedView })

  // ==========================================================================
  // 分区 3：currentRow -> contextData 同步镜像
  // ==========================================================================

  const contextData = shallowReactive<IDataRow>({})
  let prevRow: unknown = Symbol('initial')

  function resolveContextRow(): IDataRow | null {
    const rawKey = props.dataKey
    if (typeof rawKey === 'string') {
      const normalizedKey = rawKey.trim()
      const view = resolvedView.value
      if (normalizedKey.endsWith('@selectionAggregateResult')) {
        return (view?.selectionAggregateResult ?? selectionAggregateResult.value) as IDataRow
      }
      if (normalizedKey.endsWith('@aggregateResult')) {
        return (view?.aggregateResult ?? aggregateResult.value) as IDataRow
      }
    }

    return resolvedDataRow.value ?? currentRow.value
  }

  function syncContextDataFromCurrentRow(row: IDataRow | null, options?: { skipSameRef?: boolean }): void {
    if (options?.skipSameRef === true && row === prevRow) return
    prevRow = row
    syncReactiveRow(contextData, row)
  }

  watch(
    () => resolveContextRow(),
    (resolvedRow) => {
      syncContextDataFromCurrentRow(resolvedRow, { skipSameRef: true })
    },
    { immediate: true },
  )

  useDataViewEventBridge({
    resolvedView,
    onCurrentRowChanged: ({ row }) => {
      const resolvedRow = resolveContextRow()
      syncContextDataFromCurrentRow(resolvedRow ?? row)
    },
    onRowsChanged: () => {
      syncContextDataFromCurrentRow(resolveContextRow())
    },
    onSummaryChanged: () => {
      syncContextDataFromCurrentRow(resolveContextRow())
    },
    onSelectionSummaryChanged: () => {
      syncContextDataFromCurrentRow(resolveContextRow())
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
    aggregateResult,
    selectionAggregateResult,
  }
}

