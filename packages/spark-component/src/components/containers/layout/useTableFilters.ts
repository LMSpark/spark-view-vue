import { computed, reactive, watch } from 'vue'
import type { ComputedRef } from 'vue'
import type { SparkNode } from '../../internal'
import { nodeInputProp } from '../../internal'
import type { DataView, FilterExpression, FilterOperator, IDataRow } from '@spark-view/spark-data'

interface LoggerLike {
  error(message: string, error?: unknown): void
}

interface UseTableFiltersOptions {
  filterChildren: ComputedRef<SparkNode[]>
  dataView: ComputedRef<DataView | null>
  filterClass: ComputedRef<string | undefined>
  filterGridColumns: ComputedRef<number | undefined>
  filterGridGap: ComputedRef<number | string | undefined>
  filterGridAutoRows: ComputedRef<string | undefined>
  logger: LoggerLike
}

interface FilterCapableView {
  setFilter?: (expr: FilterExpression | undefined) => Promise<void> | void
  refresh?: () => Promise<void> | void
  filterExpression?: FilterExpression
  dataTable?: {
    resourceType?: string
    api?: {
      list?: unknown
    }
  }
}

function shouldSyncFilterToView(view: DataView): boolean {
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

function buildCondition(config: SparkNode, value: unknown): FilterExpression | undefined {
  const field = getNodeField(config)
  if (!field || isEmptyFilterValue(value)) return undefined

  return {
    field,
    op: inferFilterOperator(config, value),
    value,
  }
}

function compareScalar(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left ?? '').localeCompare(String(right ?? ''))
}

function includesValue(container: unknown, needle: unknown): boolean {
  if (Array.isArray(container)) return container.includes(needle)
  return String(container ?? '').includes(String(needle ?? ''))
}

function startsWithValue(container: unknown, needle: unknown): boolean {
  return String(container ?? '').startsWith(String(needle ?? ''))
}

function endsWithValue(container: unknown, needle: unknown): boolean {
  return String(container ?? '').endsWith(String(needle ?? ''))
}

function getArrayFilterValue(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null
}

function matchesCondition(row: IDataRow, expr: Extract<FilterExpression, { field: string; op: FilterOperator }>): boolean {
  const rowValue = row[expr.field]
  const arrayValue = getArrayFilterValue(expr.value)
  switch (expr.op) {
    case '==': return rowValue === expr.value
    case '!=': return rowValue !== expr.value
    case '>': return compareScalar(rowValue, expr.value) > 0
    case '>=': return compareScalar(rowValue, expr.value) >= 0
    case '<': return compareScalar(rowValue, expr.value) < 0
    case '<=': return compareScalar(rowValue, expr.value) <= 0
    case 'in':
      return arrayValue !== null
        ? (Array.isArray(rowValue)
          ? rowValue.some(item => arrayValue.includes(item))
          : arrayValue.includes(rowValue))
        : false
    case 'not in':
      return arrayValue !== null
        ? (Array.isArray(rowValue)
          ? rowValue.every(item => !arrayValue.includes(item))
          : !arrayValue.includes(rowValue))
        : true
    case 'like':
    case 'contains':
      return includesValue(rowValue, expr.value)
    case 'not like':
      return !includesValue(rowValue, expr.value)
    case 'startsWith':
      return startsWithValue(rowValue, expr.value)
    case 'endsWith':
      return endsWithValue(rowValue, expr.value)
    case 'is null':
      return rowValue === null || rowValue === undefined || rowValue === ''
    case 'is not null':
      return rowValue !== null && rowValue !== undefined && rowValue !== ''
    case 'between':
      return arrayValue !== null
        && arrayValue.length >= 2
        && compareScalar(rowValue, arrayValue[0]) >= 0
        && compareScalar(rowValue, arrayValue[1]) <= 0
    case 'not between':
      return arrayValue !== null
        && arrayValue.length >= 2
        && (compareScalar(rowValue, arrayValue[0]) < 0 || compareScalar(rowValue, arrayValue[1]) > 0)
    default:
      return true
  }
}

function matchesExpression(row: IDataRow, expr: FilterExpression): boolean {
  if ('field' in expr && 'op' in expr) {
    return matchesCondition(row, expr)
  }
  if ('type' in expr) {
    switch (expr.type) {
      case 'and':
        return expr.children.every(child => matchesExpression(row, child))
      case 'or':
        return expr.children.some(child => matchesExpression(row, child))
      case '!and':
        return !expr.children.every(child => matchesExpression(row, child))
      case '!or':
        return !expr.children.some(child => matchesExpression(row, child))
      default:
        return true
    }
  }
  return true
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

  const filterConfigs = computed(() => {
    const nodes = options.filterChildren.value
    assertFilterNodesArray(nodes)
    return nodes
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
    const conditions = filterConfigs.value
      .map(config => {
        const field = getNodeField(config)
        return buildCondition(config, typeof field === 'string' ? filterModel[field] : undefined)
      })
      .filter((expr): expr is FilterExpression => expr !== undefined)

    if (conditions.length === 0) return undefined
    if (conditions.length === 1) return conditions[0]
    return { type: 'and', children: conditions }
  })

  const hasFilterConfigs = computed(() => filterConfigs.value.length > 0)

  async function applyFilterToView(
    view: DataView,
    expr: FilterExpression | undefined,
    refreshRemote: boolean,
  ): Promise<void> {
    if (!hasFilterConfigs.value) return
    if (!shouldSyncFilterToView(view)) return

    const candidate = view as unknown as FilterCapableView
    if (typeof candidate.setFilter !== 'function') return
    if (isSameFilterExpression(candidate.filterExpression, expr)) return

    await candidate.setFilter(expr)

    if (
      refreshRemote
      && candidate.dataTable?.api?.list !== undefined
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

  const filteredRows = computed(() => {
    const rows = options.dataView.value?.rows ?? []
    if (!hasFilterConfigs.value) return rows
    if (options.dataView.value && shouldSyncFilterToView(options.dataView.value)) return rows
    const expr = filterExpression.value
    return expr ? rows.filter(row => matchesExpression(row, expr)) : rows
  })

  const activeFilterCount = computed(() => {
    let count = 0
    for (const config of filterConfigs.value) {
      const field = getNodeField(config)
      if (typeof field === 'string' && !isEmptyFilterValue(filterModel[field])) {
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
    if (!view || !hasFilterConfigs.value) return
    try {
      await applyFilterToView(view, undefined, true)
    } catch (error) {
      options.logger.error('RendererTable: 重置过滤失败', error)
    }
  }

  return {
    filterModel,
    filterConfigs,
    filterClassValue,
    filterGridColumnsValue,
    filterGridGapValue,
    filterGridAutoRowsValue,
    filterExpression,
    filteredRows,
    hasFilters: computed(() => filterConfigs.value.length > 0),
    activeFilterCount,
    resetFilters,
  }
}