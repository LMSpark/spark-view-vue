import { computed, reactive, watch } from 'vue'
import type { ComputedRef } from 'vue'
import type { ComponentConfig } from '@spark-view/spark-component'
import type { DataView, FilterExpression, FilterOperator, IDataRow } from '@spark-view/spark-data'

interface LoggerLike {
  error(message: string, error?: unknown): void
}

interface UseTableFiltersOptions {
  config: ComputedRef<ComponentConfig | undefined>
  children: ComputedRef<ComponentConfig[]>
  dataView: ComputedRef<DataView | null>
  filterColumns: ComputedRef<string[] | undefined>
  filterClass: ComputedRef<string | undefined>
  filterGridColumns: ComputedRef<number | undefined>
  filterGridGap: ComputedRef<number | string | undefined>
  filterGridAutoRows: ComputedRef<string | undefined>
  logger: LoggerLike
}

function normalizeFilterColumns(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function isEmptyFilterValue(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  return false
}

function isRangeFilterConfig(config: ComponentConfig): boolean {
  const filterMode = config.props?.['filterMode'] ?? config.props?.['filterVariant']
  return filterMode === 'range' || config.props?.['filterRange'] === true
}

function inferFilterOperator(config: ComponentConfig, value: unknown): FilterOperator {
  const explicit = config.props?.['filterOp'] ?? config.props?.['filterOperator']
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

function buildCondition(config: ComponentConfig, value: unknown): FilterExpression | undefined {
  const field = typeof config.name === 'string' ? config.name : undefined
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

  const filterColumnsValue = computed(() =>
    normalizeFilterColumns(options.filterColumns.value ?? options.config.value?.props?.['filterColumns'])
  )
  const filterClassValue = computed(() =>
    (options.config.value?.props?.['filterClass'] as string | undefined) ?? options.filterClass.value ?? ''
  )
  const filterGridColumnsValue = computed(() =>
    (options.config.value?.props?.['filterGridColumns'] as number | undefined) ?? options.filterGridColumns.value ?? 24
  )
  const filterGridGapValue = computed(() =>
    (options.config.value?.props?.['filterGridGap'] as number | string | undefined) ?? options.filterGridGap.value ?? 12
  )
  const filterGridAutoRowsValue = computed(() =>
    (options.config.value?.props?.['filterGridAutoRows'] as string | undefined) ?? options.filterGridAutoRows.value ?? 'minmax(32px, auto)'
  )

  const filterConfigs = computed(() => {
    if (filterColumnsValue.value.length === 0) return []
    const configMap = new Map<string, ComponentConfig>()
    for (const child of options.children.value) {
      if (typeof child.name === 'string' && child.name.trim().length > 0) {
        configMap.set(child.name, child)
      }
    }
    return filterColumnsValue.value
      .map(name => configMap.get(name))
      .filter((config): config is ComponentConfig => config !== undefined)
  })

  watch(filterConfigs, (configs) => {
    const nextKeys = new Set(configs.map(config => config.name).filter((name): name is string => typeof name === 'string'))
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
      .map(config => buildCondition(config, typeof config.name === 'string' ? filterModel[config.name] : undefined))
      .filter((expr): expr is FilterExpression => expr !== undefined)

    if (conditions.length === 0) return undefined
    if (conditions.length === 1) return conditions[0]
    return { type: 'and', children: conditions }
  })

  watch(() => options.dataView.value, async (view) => {
    if (!view) return
    try {
      await view.setFilter(filterExpression.value)
      initialized = true
    } catch (error) {
      options.logger.error('RendererTable: 同步过滤表达式失败', error)
    }
  }, { immediate: true })

  let initialized = false
  watch(filterExpression, async (expr) => {
    const view = options.dataView.value
    if (!view) return
    try {
      await view.setFilter(expr)
      if (initialized && view.dataTable?.api?.list) {
        await view.refresh()
      }
    } catch (error) {
      options.logger.error('RendererTable: 应用过滤失败', error)
    } finally {
      initialized = true
    }
  }, { deep: true })

  const filteredRows = computed(() => {
    const rows = options.dataView.value?.rows ?? []
    if (options.dataView.value?.dataTable?.api?.list) return rows
    const expr = filterExpression.value
    return expr ? rows.filter(row => matchesExpression(row, expr)) : rows
  })

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
  }
}