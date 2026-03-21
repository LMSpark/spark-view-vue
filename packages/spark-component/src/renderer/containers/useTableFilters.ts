import { computed, reactive, watch } from 'vue'
import type { ComputedRef } from 'vue'
import type { SparkNode } from '../_pkg'
import type { DataView, FilterExpression, FilterOperator, IDataRow } from '@spark-view/spark-data'

// ── 类型定义 ──────────────────────────────────────────────────────────────────

interface LoggerLike {
  error(message: string, error?: unknown): void
}

interface UseTableFiltersOptions {
  config: ComputedRef<SparkNode | undefined>
  children: ComputedRef<SparkNode[]>
  dataView: ComputedRef<DataView | null>
  filterColumns: ComputedRef<string[] | undefined>
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
    api?: {
      list?: unknown
    }
  }
}

function isSameFilterExpression(
  left: FilterExpression | undefined,
  right: FilterExpression | undefined,
): boolean {
  if (left === right) return true
  if (!left || !right) return false
  return JSON.stringify(left) === JSON.stringify(right)
}

// ── 规范化辅助函数 ───────────────────────────────────────────────────────────

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

function isRangeFilterConfig(config: SparkNode): boolean {
  const filterMode = config.props?.['filterMode'] ?? config.props?.['filterVariant']
  return filterMode === 'range' || config.props?.['filterRange'] === true
}

// ── 过滤表达式构建 ───────────────────────────────────────────────────────────

function inferFilterOperator(config: SparkNode, value: unknown): FilterOperator {
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

function buildCondition(config: SparkNode, value: unknown): FilterExpression | undefined {
  const field = typeof config.field === 'string' ? config.field : undefined
  if (!field || isEmptyFilterValue(value)) return undefined

  return {
    field,
    op: inferFilterOperator(config, value),
    value,
  }
}

// ── 本地匹配辅助函数 ─────────────────────────────────────────────────────────

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

// ── 组合式函数 ───────────────────────────────────────────────────────────────

export function useTableFilters(options: UseTableFiltersOptions) {
  // 过滤表单的可变输入模型，供动态生成的过滤控件双向绑定。
  const filterModel = reactive<Record<string, unknown>>({})

  // 过滤区布局参数：显式传入优先，其次回退到容器配置。
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

  // 将过滤字段名解析回对应的字段组件配置。
  const filterConfigs = computed(() => {
    if (filterColumnsValue.value.length === 0) return []
    const configMap = new Map<string, SparkNode>()
    for (const child of options.children.value) {
      if (typeof child.field === 'string' && child.field.trim().length > 0) {
        configMap.set(child.field, child)
      }
    }
    return filterColumnsValue.value
      .map(name => configMap.get(name))
      .filter((config): config is SparkNode => config !== undefined)
  })

  // 保持 filterModel 的键集合与当前启用的过滤字段一致。
  watch(filterConfigs, (configs) => {
    const nextKeys = new Set(configs.map(config => config.field).filter((name): name is string => typeof name === 'string'))
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

  // 将当前所有过滤输入聚合成一个 DataView 可识别的表达式。
  const filterExpression = computed<FilterExpression | undefined>(() => {
    const conditions = filterConfigs.value
      .map(config => buildCondition(config, typeof config.field === 'string' ? filterModel[config.field] : undefined))
      .filter((expr): expr is FilterExpression => expr !== undefined)

    if (conditions.length === 0) return undefined
    if (conditions.length === 1) return conditions[0]
    return { type: 'and', children: conditions }
  })

  async function applyFilterToView(
    view: DataView,
    expr: FilterExpression | undefined,
    refreshRemote: boolean,
  ): Promise<void> {
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

  // 首次同步时只设置过滤表达式，避免额外触发 refresh()。
  let initialized = false

  // DataView 切换时，把最新过滤表达式同步过去。
  watch(() => options.dataView.value, async (view) => {
    if (!view) return
    try {
      await applyFilterToView(view, filterExpression.value, false)
      initialized = true
    } catch (error) {
      options.logger.error('RendererTable: 同步过滤表达式失败', error)
    }
  }, { immediate: true })

  // 远程表在后续过滤变更时主动 refresh；本地表则在下方做内存过滤。
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

  // 纯本地数据直接基于当前 rows 计算过滤结果，不发请求。
  const filteredRows = computed(() => {
    const rows = options.dataView.value?.rows ?? []
    if (options.dataView.value?.dataTable?.api?.list) return rows
    const expr = filterExpression.value
    return expr ? rows.filter(row => matchesExpression(row, expr)) : rows
  })

  // 当前有值的过滤字段数量。
  const activeFilterCount = computed(() => {
    let count = 0
    for (const config of filterConfigs.value) {
      if (typeof config.field === 'string' && !isEmptyFilterValue(filterModel[config.field])) {
        count++
      }
    }
    return count
  })

  // 重置所有过滤输入。
  async function resetFilters(): Promise<void> {
    for (const key of Object.keys(filterModel)) {
      filterModel[key] = undefined
    }
    const view = options.dataView.value
    if (!view) return
    try {
      await applyFilterToView(view, undefined, true)
    } catch (error) {
      options.logger.error('RendererTable: 重置过滤失败', error)
    }
  }

  // 提供给 RendererTable 使用的公开返回值。
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