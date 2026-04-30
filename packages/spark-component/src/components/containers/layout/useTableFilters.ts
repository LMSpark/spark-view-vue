import { computed, reactive, watch } from 'vue'
import type { SparkNode } from '../../internal'
import { nodeInputProp } from '../../internal'
import type { DataView, FilterExpression, FilterOperator, FilterValueExpression } from '@spark-view/spark-data'
import type { IDataRow } from '@spark-view/spark-data'
import type { ValueRef } from '../../shared-types.js'
import type { RendererFilterProps } from '../RendererFilter.types'

interface LoggerLike {
  error(message: string, error?: unknown): void
}

interface UseTableFiltersOptions {
  filterChildren: ValueRef<SparkNode[]>
  dataView: ValueRef<DataView | null>
  filterClass: ValueRef<string | undefined>
  filterGridColumns: ValueRef<number | undefined>
  filterGridGap: ValueRef<number | string | undefined>
  filterGridAutoRows: ValueRef<string | undefined>
  filterCollapsible?: ValueRef<boolean | undefined>
  filterCollapsed?: ValueRef<boolean | undefined>
  filterAutoFitMinWidth?: ValueRef<string | undefined>
  filterItemSpan?: ValueRef<number | undefined>
  filterActionSpan?: ValueRef<number | undefined>
  toggleCollapsedAction?: () => void
  logger: LoggerLike
}

interface TableFilterZeroCodeBridge {
  filterModel: Record<string, unknown>
  activeFilterCount: number
  resetFilters: () => Promise<void>
  searchFilters: () => Promise<void>
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
    throw new Error('RendererTable: filterValueRefField 必须是非空字符串')
  }
  return value.trim()
}

function assertFilterNodesArray(value: unknown): asserts value is SparkNode[] {
  if (Array.isArray(value)) return
  throw new Error('RendererTable: r-filter children 必须是数组节点配置')
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
    throw new Error('RendererTable: 配置 filterValueRefField 的筛选节点必须声明 field')
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
      throw new Error(`RendererTable: filterValueRefField 引用了不存在的字段 ${descriptor.refField}`)
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

export function useTableFilters(options: UseTableFiltersOptions) {
  const filterModel = reactive<Record<string, unknown>>({})

  const filterClassValue = computed(() =>
    options.filterClass.value ?? ''
  )
  const filterGridColumnsValue = computed(() =>
    options.filterGridColumns.value ?? 24
  )
  const filterGridGapValue = computed(() =>
    options.filterGridGap.value ?? 12
  )
  const filterGridAutoRowsValue = computed(() =>
    options.filterGridAutoRows.value ?? 'minmax(32px, auto)'
  )

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
      options.logger.error('RendererTable: 同步过滤表达式失败', error)
    }
  }, { immediate: true })

  watch(filterExpression, async (expr) => {
    const view = options.dataView.value
    if (!view) return
    try {
      await applyFilterToView(view, expr, initialized)
    } catch (error) {
      options.logger.error('RendererTable: 应用过滤失败', error)
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
      options.logger.error('RendererTable: 重置过滤失败', error)
    }
  }

  async function searchFilters(): Promise<void> {
    const view = options.dataView.value
    if (!view || !hasAnyFilterNodes.value) return
    try {
      await applyFilterToView(view, filterExpression.value, true)
    } catch (error) {
      options.logger.error('RendererTable: 应用过滤失败', error)
    }
  }

  const filterRendererProps = computed<RendererFilterProps>(() => {
    const collapsible = options.filterCollapsible?.value
    const collapsed = options.filterCollapsed?.value
    const autoFitMinWidth = options.filterAutoFitMinWidth?.value
    const itemSpan = options.filterItemSpan?.value
    const actionSpan = options.filterActionSpan?.value
    const toggleCollapsedAction = options.toggleCollapsedAction

    return {
      class: filterClassValue.value,
      model: filterModel as IDataRow,
      children: filterConfigs.value,
      activeCount: activeFilterCount.value,
      gridColumns: filterGridColumnsValue.value,
      gridGap: filterGridGapValue.value,
      gridAutoRows: filterGridAutoRowsValue.value,
      searchAction: searchFilters,
      resetAction: resetFilters,
      ...(collapsible !== undefined ? { collapsible } : {}),
      ...(collapsed !== undefined ? { collapsed } : {}),
      ...(autoFitMinWidth !== undefined ? { autoFitMinWidth } : {}),
      ...(itemSpan !== undefined ? { itemSpan } : {}),
      ...(actionSpan !== undefined ? { actionSpan } : {}),
      ...(toggleCollapsedAction !== undefined ? { toggleCollapsedAction } : {}),
    }
  })

  const zeroCodeBridge = computed<TableFilterZeroCodeBridge>(() => ({
    filterModel,
    activeFilterCount: activeFilterCount.value,
    resetFilters,
    searchFilters,
  }))

  return {
    filterModel,
    filterConfigs,
    filterRendererProps,
    filterClassValue,
    filterGridColumnsValue,
    filterGridGapValue,
    filterGridAutoRowsValue,
    filterExpression,
    hasFilters: hasRenderableFilters,
    activeFilterCount,
    searchFilters,
    resetFilters,
    zeroCodeBridge,
  }
}
