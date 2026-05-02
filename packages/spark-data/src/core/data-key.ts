/**
 * DataKey — 统一数据绑定键解析器
 *
 * 统一格式（无 scope，SPA 单 DataSet）：
 *   - `tableName@viewId@field`    — 3 段完整格式
 *   - `tableName@field`           — 2 段简写（viewId 默认 'default'）
 *
 * 跨页面共享数据（`#scope` 前缀）：
 *   - `#scope@tableName@field`           — 显式指定 scope（viewId 默认 'default'）
 *   - `#scope@tableName@viewId@field`    — 显式指定 scope + viewId
 *
 * 字段路径（可选）：
 *   - `tableName@viewId@field.path`  → 如 `stats@default@currentRow.totalUsers`
 *   - `tableName@field.path`         → 如 `stats@currentRow.totalUsers`
 *
 * 非 DataSet 键（如 `settings.siteName`、`formData`）返回 null。
 *
 * @example
 * ```ts
 * import { parseDataKey, resolveDataKey } from '@spark-view/spark-data'
 *
 * // 页面内数据（无 scope）
 * const dk = parseDataKey('Users@default@rows')
 * // { tableName: 'Users', viewId: 'default', field: 'rows' }
 *
 * // 跨页面共享数据（#scope）
 * const dk2 = parseDataKey('#SharedDS@Orders@rows')
 * // { scope: 'SharedDS', tableName: 'Orders', viewId: 'default', field: 'rows' }
 *
 * const data = resolveDataKey(dk, dataSet)
 * // → DataView.rows
 * ```
 */

import type { DataView as SparkDataView } from '../data-view'
import type { AggregateResultRow, IDataRow, IDataSet, IDataSource } from '../types'

// ===== 类型定义 =====

/** DataKey 可绑定的字段类型 */
export type DataKeyField = 'rows' | 'currentRow' | 'selectedRows' | 'aggregateResult' | 'selectionAggregateResult'

/** DataKey 解析后的描述符 */
export interface DataKeyDescriptor {
  /** 数据集 scope（仅跨页面 `#scope` 前缀存在） */
  scope?: string
  /** 表名 */
  tableName: string
  /** 视图ID */
  viewId: string
  /** 绑定字段 */
  field: DataKeyField
  /** 字段路径（用于访问行对象的具体字段，如 currentRow.totalUsers 中的 totalUsers） */
  fieldPath?: string
  /** 原始 dataKey 字符串 */
  raw: string
  /** 是否为跨页面数据引用（`#scope` 前缀） */
  crossPage?: boolean
}

/** DataKey 字段值中的标量类型（用于 fieldPath 提取结果） */
export type DataKeyScalar = string | number | boolean | bigint | symbol | null | undefined

/** DataKey 字段值中的对象类型（用于 fieldPath 提取结果） */
export type DataKeyObject = Record<string, unknown>

/** DataKey 字段值（用于 kind='value' 场景） */
export type DataKeyValue = IDataRow | AggregateResultRow | IDataRow[] | DataKeyObject | unknown[] | DataKeyScalar

/** DataKey 解析结果值（含 rows → DataView 场景） */
export type DataKeyResolvedValue = SparkDataView | DataKeyValue

// ===== 常量 =====

/** DataKey 分隔符 */
const SEPARATOR = '@'

/** 合法字段名集合 */
const VALID_FIELDS = new Set<string>(['rows', 'currentRow', 'selectedRows', 'aggregateResult', 'selectionAggregateResult'])

/** 跨页面数据引用前缀 */
const CROSS_PAGE_PREFIX = '#'


// ===== 内部辅助 =====

/**
 * 解析 fieldPart（可能带字段路径，如 `currentRow.totalUsers`）
 * @returns { field, fieldPath } 合法时返回对象，字段非法返回 null
 */
function parseFieldPart(fieldPart: string): { field: DataKeyField; fieldPath?: string } | null {
  const dotIndex = fieldPart.indexOf('.')
  let field: string
  let fieldPath: string | undefined
  if (dotIndex > 0) {
    field = fieldPart.substring(0, dotIndex)
    fieldPath = fieldPart.substring(dotIndex + 1)
  } else {
    field = fieldPart
  }
  if (!VALID_FIELDS.has(field)) return null
  const result: { field: DataKeyField; fieldPath?: string } = { field: field as DataKeyField }
  if (fieldPath !== undefined) result.fieldPath = fieldPath
  return result
}

/**
 * @internal 解析 #scope@table@[viewId@]field 跨页面数据键
 */
function parseCrossPageKey(dataKey: string): DataKeyDescriptor | null {
  // strip leading '#'
  const stripped = dataKey.substring(1)
  const parts = stripped.split(SEPARATOR)

  if (parts.length === 4) {
    // #scope@table@viewId@field
    const [scope, tableName, viewId, fieldPart] = parts
    if (!scope || !tableName || !viewId || !fieldPart) return null
    const fp = parseFieldPart(fieldPart)
    if (!fp) return null
    const result: DataKeyDescriptor = { scope, tableName, viewId, field: fp.field, raw: dataKey, crossPage: true }
    if (fp.fieldPath !== undefined) result.fieldPath = fp.fieldPath
    return result
  }

  if (parts.length === 3) {
    // #scope@table@field (viewId = 'default')
    const [scope, tableName, fieldPart] = parts
    if (!scope || !tableName || !fieldPart) return null
    const fp = parseFieldPart(fieldPart)
    if (!fp) return null
    const result: DataKeyDescriptor = { scope, tableName, viewId: 'default', field: fp.field, raw: dataKey, crossPage: true }
    if (fp.fieldPath !== undefined) result.fieldPath = fp.fieldPath
    return result
  }

  return null
}

// ===== 解析函数 =====

/**
 * 判断 dataKey 是否为当前合法的 DataSet 数据键
 *
 * @param dataKey 原始 dataKey 字符串
 * @returns 是否为 DataSet 绑定键
 */
export function isDataKey(dataKey: string): boolean {
  return parseDataKey(dataKey) !== null
}

/**
 * 解析 dataKey 字符串为结构化描述符
 *
 * 支持格式：
 *   - `tableName@field`                       → 2 段简写（viewId 默认 'default'）
 *   - `tableName@viewId@field`                → 3 段完整格式（推荐）
 *   - `#scope@tableName@field`                → 跨页面 2 段（viewId 默认 'default'）
 *   - `#scope@tableName@viewId@field`         → 跨页面 3 段
 *   - 以上均支持 `field.path` 字段路径
 *
 * @param dataKey 原始 dataKey 字符串
 * @returns 解析后的描述符，非 DataSet 键返回 null
 */
export function parseDataKey(dataKey: string): DataKeyDescriptor | null {
  if (!dataKey) return null

  // ── 跨页面 #scope 前缀 ──
  if (dataKey.startsWith(CROSS_PAGE_PREFIX)) {
    return parseCrossPageKey(dataKey)
  }

  // ── 标准格式 ──
  const parts = dataKey.split(SEPARATOR)

  if (parts.length === 3) {
    // 新格式：tableName@viewId@field
    const [tableName, viewId, fieldPart] = parts
    if (!tableName || !viewId || !fieldPart) return null
    const fp = parseFieldPart(fieldPart)
    if (!fp) return null
    const result: DataKeyDescriptor = { tableName, viewId, field: fp.field, raw: dataKey }
    if (fp.fieldPath !== undefined) result.fieldPath = fp.fieldPath
    return result
  }

  if (parts.length === 2) {
    // 新格式简写：tableName@field → viewId = 'default'
    const [tableName, fieldPart] = parts
    if (!tableName || !fieldPart) return null
    const fp = parseFieldPart(fieldPart)
    if (!fp) return null
    const result: DataKeyDescriptor = { tableName, viewId: 'default', field: fp.field, raw: dataKey }
    if (fp.fieldPath !== undefined) result.fieldPath = fp.fieldPath
    return result
  }

  // 段数不对或不含 @
  return null
}

// ===== 内部共用解析核心 =====

/**
 * @internal 从行/行对象中提取字段路径的值（如 `currentRow.totalUsers` 中的 `totalUsers`）
 */
function extractFieldPath(value: unknown, fieldPath: string): unknown {
  const pathParts = fieldPath.split('.')
  let current: unknown = value

  for (const part of pathParts) {
    if (current !== null && current !== undefined && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, part)) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }

  return current
}

/**
 * @internal 从 DataSet 中查找视图并按 field 提取值的共用逻辑
 *
 * @param descriptor 解析后的描述符
 * @param dataSet 数据集
 * @param rowsAsView 当 field='rows' 时，true 返回 DataView 实例，false 返回 view.rows 数组
 * @returns 解析到的值（含 fieldPath 提取）
 */
function _resolveCore(
  descriptor: DataKeyDescriptor,
  dataSet: IDataSet,
  rowsAsView: boolean
): DataKeyResolvedValue {
  const table = dataSet.getTable(descriptor.tableName)
  if (!table) return undefined

  const view = table.getView(descriptor.viewId)
  if (!view) return undefined

  let value: SparkDataView | IDataRow[] | IDataRow | AggregateResultRow | null | undefined

  switch (descriptor.field) {
    case 'rows':                value = rowsAsView ? view : view.rows; break
    case 'currentRow':          value = view.currentRow; break
    case 'selectedRows':        value = view.selectedRows; break
    case 'aggregateResult':          value = view.aggregateResult as AggregateResultRow; break
    case 'selectionAggregateResult': value = view.selectionAggregateResult as AggregateResultRow; break
    default:                    return undefined
  }

  // 如果有字段路径（如 currentRow.totalUsers），从行对象中提取字段值
  // field='rows' + rowsAsView=true → value 是 DataView 实例，不应作为行对象取字段路径
  if (descriptor.fieldPath && value && typeof value === 'object' && !Array.isArray(value) && !('viewId' in value)) {
    return extractFieldPath(value, descriptor.fieldPath) as DataKeyValue
  }

  return value
}

// ===== 公共解析函数 =====

/**
 * 从 DataSet 中解析数据键对应的值
 *
 * @param descriptor 已解析的描述符（parseDataKey 返回值）
 * @param dataSet 数据集实例
 * @returns 解析到的数据值
 */
export function resolveDataKey(
  descriptor: DataKeyDescriptor,
  dataSet: IDataSet
): DataKeyResolvedValue {
  return _resolveCore(descriptor, dataSet, false)
}

/**
 * 解析 DataKey → 绑定友好的值（rows → DataView 实例，其他字段 → 原始值）
 *
 * 与 `resolveDataKey` 的区别：`rows` 字段返回 **DataView 实例**（实现了 `IDataSource`），
 * 而非 `view.rows` 数组，更适合绑定到需要完整 DataSource 接口的数据容器组件。
 *
 * @internal 内部实现——外部调用方请使用 resolveRawKey 或 resolveDataKeyBinding
 */
function resolveDataKeyAsSource(
  descriptor: DataKeyDescriptor,
  dataSet: IDataSet
): DataKeyResolvedValue {
  return _resolveCore(descriptor, dataSet, true)
}

// ===== 字符串入口（raw string → 数据）=====
// 调用方无需手动组合 isDataKey + parseDataKey + resolveXxx 三步

/**
 * 从原始字符串一步解析到绑定值（rows → DataView，其他 → 原始行数据）
 *
 * - 格式无效或解析失败 → `undefined`（不打日志，由调用方决定是否 warn）
 * - 等价于 `resolveDataKeyAsSource(parseDataKey(rawKey)!, dataSet)`
 */
export function resolveRawKey(
  rawKey: string,
  dataSet: IDataSet
): SparkDataView | IDataRow | IDataRow[] | null | undefined {
  if (!isDataKey(rawKey)) return undefined
  const dk = parseDataKey(rawKey)
  if (!dk) return undefined
  return resolveDataKeyAsSource(dk, dataSet) as SparkDataView | IDataRow | IDataRow[] | null | undefined
}

/**
 * 从原始字符串获取对应的 DataView（不依赖 field 字段）
 *
 * 合并了 isDataKey + parseDataKey + dataSet.getView 三步。
 * 用于需要注入 DataView 引用但不关心具体 field 的场景。
 */
export function getViewFromRawKey(
  rawKey: string,
  dataSet: IDataSet
): SparkDataView | undefined {
  if (!isDataKey(rawKey)) return undefined
  const dk = parseDataKey(rawKey)
  if (!dk) return undefined
  return dataSet.getView(dk.tableName, dk.viewId)
}

/**
 * DataKey 渲染绑定结果（判别联合）
 *
 * 供渲染层消费，避免渲染层直接依赖 `DataView` 具体类。
 *
 * - `kind: 'view'`  — field='rows'，返回实现了 IDataSource 的视图对象
 * - `kind: 'value'` — field='currentRow'|'selectedRows'，返回标量 / 行数组
 */
export type DataKeyBinding =
  | { kind: 'view'; source: IDataSource }
  | { kind: 'value'; value: DataKeyValue }

/**
 * 解析 DataKey 为渲染绑定描述符（渲染层入口）
 *
 * 封装了 isDataKey → parseDataKey → getView 全链路；
 * 返回判别联合，渲染层无需 `instanceof DataView` 判断。
 *
 * @returns 绑定描述符，键无效或未找到返回 `null`
 */
export function resolveDataKeyBinding(
  rawKey: string,
  dataSet: IDataSet
): DataKeyBinding | null {
  if (!isDataKey(rawKey)) return null
  const dk = parseDataKey(rawKey)
  if (!dk) return null
  const table = dataSet.getTable(dk.tableName)
  if (!table) return null
  const view = table.getView(dk.viewId)
  if (!view) return null

  // rows → 返回 DataView（IDataSource），不支持 fieldPath
  if (dk.field === 'rows') return { kind: 'view', source: view }

  // 其他字段 → 取原始值后按需提取 fieldPath
  let value: IDataRow | AggregateResultRow | IDataRow[] | null | undefined
  switch (dk.field) {
    case 'currentRow':          value = view.currentRow; break
    case 'selectedRows':        value = view.selectedRows; break
    case 'aggregateResult':          value = view.aggregateResult; break
    case 'selectionAggregateResult': value = view.selectionAggregateResult; break
    default:                    return null
  }

  // 如果有字段路径（如 currentRow.totalUsers），从行对象中提取字段值
  const fieldPathCandidate: unknown = value
  if (
    dk.fieldPath !== undefined
    && fieldPathCandidate !== null
    && fieldPathCandidate !== undefined
    && typeof fieldPathCandidate === 'object'
    && !Array.isArray(fieldPathCandidate)
  ) {
    const fieldPathValue = extractFieldPath(fieldPathCandidate, dk.fieldPath) as DataKeyValue
    return { kind: 'value', value: fieldPathValue }
  }

  return { kind: 'value', value: value as DataKeyValue }
}

/**
 * 构建标准化 DataKey 字符串
 *
 * @param tableName 表名
 * @param field 绑定字段
 * @param viewId 视图ID（默认 'default'，省略时输出 2 段简写）
 * @param scope 跨页面 scope（传入时输出 `#scope@table@...` 格式）
 * @returns 格式化后的 dataKey 字符串
 *
 * @example
 * ```ts
 * buildDataKey('Orders', 'rows')                    // → 'Orders@rows'
 * buildDataKey('Orders', 'rows', 'grid')             // → 'Orders@grid@rows'
 * buildDataKey('Orders', 'rows', 'default', 'Shared') // → '#Shared@Orders@rows'
 * buildDataKey('Orders', 'rows', 'grid', 'Shared')   // → '#Shared@Orders@grid@rows'
 * ```
 */
export function buildDataKey(
  tableName: string,
  field: DataKeyField,
  viewId = 'default',
  scope?: string
): string {
  const prefix = scope ? `${CROSS_PAGE_PREFIX}${scope}${SEPARATOR}` : ''
  if (viewId === 'default') {
    return `${prefix}${tableName}${SEPARATOR}${field}`
  }
  return `${prefix}${tableName}${SEPARATOR}${viewId}${SEPARATOR}${field}`
}

/**
 * 从 DataKey 描述符提取视图唯一键（用于订阅去重）
 *
 * @param descriptor 描述符
 * @returns `tableName.viewId` 格式字符串
 */
export function getViewKey(descriptor: DataKeyDescriptor): string {
  return `${descriptor.tableName}.${descriptor.viewId}`
}

// ===== 跨框架能力解析（framework-agnostic capability resolution）=====

/**
 * DataKey 能力解析结果。
 *
 * 设计约束：此类型及以下函数不依赖任何 UI 框架，可在 Node.js、测试、非 Vue 环境中使用。
 */
export interface ResolvedDataCapabilities {
  /** 解析到的 DataView（来自 rows/currentRow/… 字段所属视图）；无匹配时为 null */
  dataSource: SparkDataView | null
  /**
   * 解析到的上下文行：
   * - view-binding（field='rows'）→ view.currentRow
   * - field-binding（field='currentRow' / 其他行字段）→ 绑定行本身
   * 无匹配时为 null
   */
  dataRow: IDataRow | null
}

function isRowLike(value: unknown): value is IDataRow {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 统一 DataKey 能力解析入口（框架无关）。
 *
 * - dataSource：定位到绑定键所属的 DataView
 * - dataRow：view-binding 返回 view.currentRow；field-binding 返回绑定行
 */
export function resolveDataCapabilitiesFromDataKey(
  rawKey: string | undefined,
  dataSet: IDataSet | null | undefined,
): ResolvedDataCapabilities {
  const empty: ResolvedDataCapabilities = { dataSource: null, dataRow: null }
  if (!rawKey || !dataSet) return empty

  const binding = resolveDataKeyBinding(rawKey, dataSet)
  if (!binding) return empty

  if (binding.kind === 'view') {
    const dataSource = binding.source as SparkDataView
    const currentRow = dataSource.currentRow
    return {
      dataSource,
      dataRow: isRowLike(currentRow) ? currentRow : null,
    }
  }

  const dataSource = getViewFromRawKey(rawKey, dataSet) ?? null
  return {
    dataSource,
    dataRow: isRowLike(binding.value) ? binding.value : null,
  }
}

/**
 * 统一 DataKey → DataView 入口（框架无关）。
 *
 * - 空 key / 缺少 DataSet → null
 * - 非法 key / 视图不存在 → null
 */
export function resolveViewFromDataKey(
  rawKey: string | undefined,
  dataSet: IDataSet | null | undefined,
): SparkDataView | null {
  return resolveDataCapabilitiesFromDataKey(rawKey, dataSet).dataSource
}

/**
 * 从任意合法 DataKey 派生"同 scope + 同 table + 同 viewId"的目标字段 DataKey。
 *
 * @example
 * deriveSiblingFieldDataKey('Orders@grid@rows', 'currentRow') // → 'Orders@grid@currentRow'
 * deriveSiblingFieldDataKey('#Shared@Orders@rows', 'selectedRows') // → '#Shared@Orders@selectedRows'
 */
export function deriveSiblingFieldDataKey(
  rawKey: string | undefined,
  targetField: DataKeyField,
): string | undefined {
  if (typeof rawKey !== 'string') return undefined
  const normalized = rawKey.trim()
  if (normalized.length === 0) return undefined

  const descriptor = parseDataKey(normalized)
  if (!descriptor) return undefined

  const scopePrefix = descriptor.scope ? `#${descriptor.scope}@` : ''
  if (descriptor.viewId === 'default') {
    return `${scopePrefix}${descriptor.tableName}@${targetField}`
  }
  return `${scopePrefix}${descriptor.tableName}@${descriptor.viewId}@${targetField}`
}
