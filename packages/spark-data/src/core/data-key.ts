/**
 * DataKey / ViewKey — DataView 定位与输出读取键解析器
 *
 * ViewKey 定位 DataView，供表级容器使用：
 *   - `tableName@viewId`
 *   - `#scope@tableName@viewId`
 *
 * DataKey 读取 DataView 的具体输出字段，供展示、动作等需要消费 DataView 输出的组件使用：
 *   - `tableName@viewId@field`
 *   - `#scope@tableName@viewId@field`
 *
 * 字段路径（可选）：
 *   - `tableName@viewId@currentRow.customerName`
 *   - `tableName@viewId@aggregateResult.totalAmount`
 *
 * 不再支持旧的 `tableName@field` 简写。
 */

import type { DataView as SparkDataView } from '../data-view'
import type {
  AggregateResultRow,
  DataColumn,
  IDataRow,
  IDataSet,
  IDataSource,
} from '../types'

// ===== 类型定义 =====

/** DataKey 可绑定的字段类型。 */
export type DataKeyField =
  | 'rows'
  | 'columns'
  | 'currentRow'
  | 'selectedRows'
  | 'aggregateResult'
  | 'selectionAggregateResult'
  | 'total'
  | 'page'
  | 'pageSize'
  | 'requestState'
  | 'mutating'
  | 'loadingError'
  | 'mutatingError'

/** ViewKey 解析后的描述符。 */
export interface ViewKeyDescriptor {
  /** 数据集 scope（仅跨页面 `#scope` 前缀存在）。 */
  scope?: string
  /** 表名。 */
  tableName: string
  /** 视图 ID。 */
  viewId: string
  /** 原始 viewKey 字符串。 */
  raw: string
  /** 是否为跨页面数据引用（`#scope` 前缀）。 */
  crossPage?: boolean
}

/** DataKey 解析后的描述符。 */
export interface DataKeyDescriptor extends ViewKeyDescriptor {
  /** 绑定字段。 */
  field: DataKeyField
  /** 字段路径（用于访问对象字段，如 currentRow.customerName）。 */
  fieldPath?: string
}

/** DataKey 字段值中的标量类型。 */
export type DataKeyScalar = string | number | boolean | bigint | symbol | null | undefined

/** DataKey 字段值中的对象类型。 */
export type DataKeyObject = Record<string, unknown>

/** DataKey 字段值。 */
export type DataKeyValue =
  | IDataRow
  | AggregateResultRow
  | readonly IDataRow[]
  | readonly DataColumn[]
  | DataKeyObject
  | readonly unknown[]
  | DataKeyScalar
  | Error

/** DataKey 解析结果值。 */
export type DataKeyResolvedValue = DataKeyValue

// ===== 常量 =====

/** DataKey / ViewKey 分隔符。 */
const SEPARATOR = '@'

/** 合法字段名集合。 */
const VALID_FIELDS = new Set<string>([
  'rows',
  'columns',
  'currentRow',
  'selectedRows',
  'aggregateResult',
  'selectionAggregateResult',
  'total',
  'page',
  'pageSize',
  'requestState',
  'mutating',
  'loadingError',
  'mutatingError',
])

/** 跨页面数据引用前缀。 */
const CROSS_PAGE_PREFIX = '#'

// ===== 内部辅助 =====

function parseFieldPart(fieldPart: string): { field: DataKeyField; fieldPath?: string } | null {
  const dotIndex = fieldPart.indexOf('.')
  let field: string
  let fieldPath: string | undefined

  if (dotIndex >= 0) {
    field = fieldPart.substring(0, dotIndex)
    fieldPath = fieldPart.substring(dotIndex + 1)
    if (!field || !fieldPath) return null
  } else {
    field = fieldPart
  }

  if (!VALID_FIELDS.has(field)) return null
  const result: { field: DataKeyField; fieldPath?: string } = { field: field as DataKeyField }
  if (fieldPath !== undefined) result.fieldPath = fieldPath
  return result
}

function parseScopedParts(rawKey: string): string[] | null {
  if (!rawKey.startsWith(CROSS_PAGE_PREFIX)) return null
  const stripped = rawKey.substring(1)
  return stripped.split(SEPARATOR)
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)
}

function isRowLike(value: unknown): value is IDataRow {
  return isObjectRecord(value)
}

function extractFieldPath(value: unknown, fieldPath: string): unknown {
  const pathParts = fieldPath.split('.')
  let current: unknown = value

  for (const part of pathParts) {
    if (isObjectRecord(current) && Object.prototype.hasOwnProperty.call(current, part)) {
      current = current[part]
    } else {
      return undefined
    }
  }

  return current
}

function getDataKeyValue(view: SparkDataView, field: DataKeyField): DataKeyValue {
  switch (field) {
    case 'rows': return view.rows
    case 'columns': return view.columns
    case 'currentRow': return view.currentRow
    case 'selectedRows': return view.selectedRows
    case 'aggregateResult': return view.aggregateResult
    case 'selectionAggregateResult': return view.selectionAggregateResult
    case 'total': return view.total
    case 'page': return view.page
    case 'pageSize': return view.pageSize
    case 'requestState': return view.requestState
    case 'mutating': return view.mutating
    case 'loadingError': return view.loadingError
    case 'mutatingError': return view.mutatingError
  }
}

function resolveValueWithPath(
  value: DataKeyValue,
  fieldPath: string | undefined,
): DataKeyResolvedValue {
  if (fieldPath === undefined) return value
  if (!isObjectRecord(value)) return undefined
  return extractFieldPath(value, fieldPath) as DataKeyValue
}

// ===== ViewKey 解析 =====

/**
 * 判断字符串是否为合法 ViewKey。
 */
export function isViewKey(viewKey: string): boolean {
  return parseViewKey(viewKey) !== null
}

/**
 * 解析 ViewKey：`table@viewId` 或 `#scope@table@viewId`。
 */
export function parseViewKey(viewKey: string): ViewKeyDescriptor | null {
  if (!viewKey) return null

  const scopedParts = parseScopedParts(viewKey)
  if (scopedParts) {
    if (scopedParts.length !== 3) return null
    const [scope, tableName, viewId] = scopedParts
    if (!scope || !tableName || !viewId) return null
    return { scope, tableName, viewId, raw: viewKey, crossPage: true }
  }

  const parts = viewKey.split(SEPARATOR)
  if (parts.length !== 2) return null
  const [tableName, viewId] = parts
  if (!tableName || !viewId) return null
  return { tableName, viewId, raw: viewKey }
}

/**
 * 从 DataSet 中解析 ViewKey 对应的 DataView。
 */
export function resolveViewKey(
  viewKey: string | undefined,
  dataSet: IDataSet | null | undefined,
): SparkDataView | undefined {
  if (!viewKey || !dataSet) return undefined
  const descriptor = parseViewKey(viewKey)
  if (!descriptor) return undefined
  return dataSet.getView(descriptor.tableName, descriptor.viewId)
}

// ===== DataKey 解析 =====

/**
 * 判断 dataKey 是否为当前合法的 DataView 输出读取键。
 */
export function isDataKey(dataKey: string): boolean {
  return parseDataKey(dataKey) !== null
}

/**
 * 解析 DataKey：`table@viewId@field` 或 `#scope@table@viewId@field`。
 */
export function parseDataKey(dataKey: string): DataKeyDescriptor | null {
  if (!dataKey) return null

  const scopedParts = parseScopedParts(dataKey)
  if (scopedParts) {
    if (scopedParts.length !== 4) return null
    const [scope, tableName, viewId, fieldPart] = scopedParts
    if (!scope || !tableName || !viewId || !fieldPart) return null
    const fp = parseFieldPart(fieldPart)
    if (!fp) return null
    const result: DataKeyDescriptor = {
      scope,
      tableName,
      viewId,
      field: fp.field,
      raw: dataKey,
      crossPage: true,
    }
    if (fp.fieldPath !== undefined) result.fieldPath = fp.fieldPath
    return result
  }

  const parts = dataKey.split(SEPARATOR)
  if (parts.length !== 3) return null
  const [tableName, viewId, fieldPart] = parts
  if (!tableName || !viewId || !fieldPart) return null
  const fp = parseFieldPart(fieldPart)
  if (!fp) return null
  const result: DataKeyDescriptor = { tableName, viewId, field: fp.field, raw: dataKey }
  if (fp.fieldPath !== undefined) result.fieldPath = fp.fieldPath
  return result
}

/**
 * 从 DataSet 中解析数据键对应的值。
 */
export function resolveDataKey(
  descriptor: DataKeyDescriptor,
  dataSet: IDataSet,
): DataKeyResolvedValue {
  const view = dataSet.getView(descriptor.tableName, descriptor.viewId)
  if (!view) return undefined
  return resolveValueWithPath(getDataKeyValue(view, descriptor.field), descriptor.fieldPath)
}

/**
 * 从原始字符串一步解析到 DataView 输出读取结果。
 */
export function resolveRawKey(
  rawKey: string,
  dataSet: IDataSet,
): DataKeyResolvedValue {
  const descriptor = parseDataKey(rawKey)
  if (!descriptor) return undefined
  return resolveDataKey(descriptor, dataSet)
}

/**
 * 从原始 DataKey 获取所属 DataView。
 *
 * @deprecated 表级容器应使用 resolveViewKey(viewKey, dataSet)。
 */
export function getViewFromRawKey(
  rawKey: string,
  dataSet: IDataSet,
): SparkDataView | undefined {
  const descriptor = parseDataKey(rawKey)
  if (!descriptor) return undefined
  return dataSet.getView(descriptor.tableName, descriptor.viewId)
}

/**
 * DataKey 渲染绑定结果。
 */
export type DataKeyBinding = {
  kind: 'value'
  value: DataKeyValue
  source: IDataSource
  descriptor: DataKeyDescriptor
}

export type ViewKeyDiagnosticStatus =
  | 'ok'
  | 'invalid-key'
  | 'missing-dataset'
  | 'missing-table'
  | 'missing-view'

export interface ViewKeyDiagnostic {
  ok: boolean
  status: ViewKeyDiagnosticStatus
  rawKey: string
  descriptor: ViewKeyDescriptor | null
  message: string
}

export type DataKeyDiagnosticStatus =
  | 'ok'
  | 'invalid-key'
  | 'missing-dataset'
  | 'missing-table'
  | 'missing-view'
  | 'empty-current-row'
  | 'empty-selection'
  | 'missing-field'
  | 'unsupported-field-path'

export interface DataKeyDiagnostic {
  ok: boolean
  status: DataKeyDiagnosticStatus
  rawKey: string
  descriptor: DataKeyDescriptor | null
  message: string
}

function viewKeyDiagnostic(
  status: ViewKeyDiagnosticStatus,
  rawKey: string,
  descriptor: ViewKeyDescriptor | null,
  message: string,
): ViewKeyDiagnostic {
  return {
    ok: status === 'ok',
    status,
    rawKey,
    descriptor,
    message,
  }
}

function dataKeyDiagnostic(
  status: DataKeyDiagnosticStatus,
  rawKey: string,
  descriptor: DataKeyDescriptor | null,
  message: string,
): DataKeyDiagnostic {
  return {
    ok: status === 'ok',
    status,
    rawKey,
    descriptor,
    message,
  }
}

/**
 * 诊断 ViewKey 绑定链路。
 */
export function diagnoseViewKey(
  rawKey: string,
  dataSet: IDataSet | null | undefined,
): ViewKeyDiagnostic {
  const normalizedKey = typeof rawKey === 'string' ? rawKey.trim() : ''
  const descriptor = normalizedKey ? parseViewKey(normalizedKey) : null
  if (!descriptor) {
    return viewKeyDiagnostic('invalid-key', rawKey, null, `无效 ViewKey: ${rawKey}`)
  }
  if (!dataSet) {
    return viewKeyDiagnostic('missing-dataset', rawKey, descriptor, `DataSet 未就绪: ${rawKey}`)
  }
  const table = dataSet.getTable(descriptor.tableName)
  if (!table) {
    return viewKeyDiagnostic('missing-table', rawKey, descriptor, `ViewKey 表不存在: ${descriptor.tableName}`)
  }
  const view = table.getView(descriptor.viewId)
  if (!view) {
    return viewKeyDiagnostic('missing-view', rawKey, descriptor, `ViewKey 视图不存在: ${descriptor.tableName}@${descriptor.viewId}`)
  }
  return viewKeyDiagnostic('ok', rawKey, descriptor, `ViewKey 可解析: ${rawKey}`)
}

/**
 * 诊断 DataKey 绑定链路。
 */
export function diagnoseDataKey(
  rawKey: string,
  dataSet: IDataSet | null | undefined,
): DataKeyDiagnostic {
  const normalizedKey = typeof rawKey === 'string' ? rawKey.trim() : ''
  const descriptor = normalizedKey ? parseDataKey(normalizedKey) : null
  if (!descriptor) {
    return dataKeyDiagnostic('invalid-key', rawKey, null, `无效 DataKey: ${rawKey}`)
  }
  if (!dataSet) {
    return dataKeyDiagnostic('missing-dataset', rawKey, descriptor, `DataSet 未就绪: ${rawKey}`)
  }

  const table = dataSet.getTable(descriptor.tableName)
  if (!table) {
    return dataKeyDiagnostic('missing-table', rawKey, descriptor, `DataKey 表不存在: ${descriptor.tableName}`)
  }

  const view = table.getView(descriptor.viewId)
  if (!view) {
    return dataKeyDiagnostic('missing-view', rawKey, descriptor, `DataKey 视图不存在: ${descriptor.tableName}@${descriptor.viewId}`)
  }

  const value = getDataKeyValue(view, descriptor.field)
  if (descriptor.field === 'currentRow' && value === null) {
    return dataKeyDiagnostic('empty-current-row', rawKey, descriptor, `DataKey 当前行为空: ${rawKey}`)
  }
  if (descriptor.field === 'selectedRows' && Array.isArray(value) && value.length === 0) {
    return dataKeyDiagnostic('empty-selection', rawKey, descriptor, `DataKey 选中行为空: ${rawKey}`)
  }

  if (descriptor.fieldPath !== undefined) {
    if (!isObjectRecord(value)) {
      return dataKeyDiagnostic('unsupported-field-path', rawKey, descriptor, `DataKey 字段路径不适用于当前值: ${rawKey}`)
    }
    if (extractFieldPath(value, descriptor.fieldPath) === undefined) {
      return dataKeyDiagnostic('missing-field', rawKey, descriptor, `DataKey 字段不存在: ${descriptor.fieldPath}`)
    }
  }

  return dataKeyDiagnostic('ok', rawKey, descriptor, `DataKey 可解析: ${rawKey}`)
}

/**
 * 解析 DataKey 为渲染绑定描述符。
 */
export function resolveDataKeyBinding(
  rawKey: string,
  dataSet: IDataSet,
): DataKeyBinding | null {
  const descriptor = parseDataKey(rawKey)
  if (!descriptor) return null
  const view = dataSet.getView(descriptor.tableName, descriptor.viewId)
  if (!view) return null
  const value = resolveValueWithPath(getDataKeyValue(view, descriptor.field), descriptor.fieldPath)
  return {
    kind: 'value',
    value,
    source: view,
    descriptor,
  }
}

/**
 * 构建标准化 ViewKey 字符串。
 */
export function buildViewKey(
  tableName: string,
  viewId = 'default',
  scope?: string,
): string {
  const prefix = scope ? `${CROSS_PAGE_PREFIX}${scope}${SEPARATOR}` : ''
  return `${prefix}${tableName}${SEPARATOR}${viewId}`
}

/**
 * 构建标准化 DataKey 字符串。
 */
export function buildDataKey(
  tableName: string,
  field: DataKeyField,
  viewId = 'default',
  scope?: string,
): string {
  const prefix = scope ? `${CROSS_PAGE_PREFIX}${scope}${SEPARATOR}` : ''
  return `${prefix}${tableName}${SEPARATOR}${viewId}${SEPARATOR}${field}`
}

/**
 * 从 DataKey 描述符提取视图唯一键（用于订阅去重）。
 */
export function getViewKey(descriptor: DataKeyDescriptor | ViewKeyDescriptor): string {
  return `${descriptor.tableName}.${descriptor.viewId}`
}

// ===== 跨框架能力解析 =====

/**
 * DataKey 能力解析结果。
 */
export interface ResolvedDataCapabilities {
  /** 解析到的 DataView；无匹配时为 null。 */
  dataSource: SparkDataView | null
  /** 解析到的上下文行；无匹配时为 null。 */
  dataRow: IDataRow | null
}

/**
 * 统一 DataKey 能力解析入口。
 */
export function resolveDataCapabilitiesFromDataKey(
  rawKey: string | undefined,
  dataSet: IDataSet | null | undefined,
): ResolvedDataCapabilities {
  const empty: ResolvedDataCapabilities = { dataSource: null, dataRow: null }
  if (!rawKey || !dataSet) return empty

  const binding = resolveDataKeyBinding(rawKey, dataSet)
  if (!binding) return empty

  return {
    dataSource: binding.source as SparkDataView,
    dataRow: isRowLike(binding.value) ? binding.value : null,
  }
}

/**
 * 统一 DataKey → DataView 入口。
 *
 * @deprecated 表级容器应使用 resolveViewKey(viewKey, dataSet)。
 */
export function resolveViewFromDataKey(
  rawKey: string | undefined,
  dataSet: IDataSet | null | undefined,
): SparkDataView | null {
  return resolveDataCapabilitiesFromDataKey(rawKey, dataSet).dataSource
}

/**
 * 从合法 ViewKey 派生同视图的目标字段 DataKey。
 */
export function deriveDataKeyFromViewKey(
  viewKey: string | undefined,
  targetField: DataKeyField,
): string | undefined {
  if (typeof viewKey !== 'string') return undefined
  const descriptor = parseViewKey(viewKey.trim())
  if (!descriptor) return undefined
  return buildDataKey(descriptor.tableName, targetField, descriptor.viewId, descriptor.scope)
}

/**
 * 从任意合法 DataKey 派生同 scope + 同 table + 同 viewId 的目标字段 DataKey。
 */
export function deriveSiblingFieldDataKey(
  rawKey: string | undefined,
  targetField: DataKeyField,
): string | undefined {
  if (typeof rawKey !== 'string') return undefined
  const descriptor = parseDataKey(rawKey.trim())
  if (!descriptor) return undefined
  return buildDataKey(descriptor.tableName, targetField, descriptor.viewId, descriptor.scope)
}
