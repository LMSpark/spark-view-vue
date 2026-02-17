/**
 * DataKey — 统一数据绑定键解析器
 *
 * 统一格式：`scope@tableName@viewId@field`
 *   - scope: 页面ID 或 数据空间名称（DataSet.dataSetName）
 *   - tableName: 表名
 *   - viewId: 视图名称（省略时默认 'default'）
 *   - field: rows | currentRow | selectedRows
 *
 * 支持简写：
 *   - `scope@tableName@field` → viewId 默认 'default'
 *
 * 非 DataSet 键（如 `settings.siteName`、`formData`）返回 null。
 *
 * @example
 * ```ts
 * import { parseDataKey, resolveDataKey } from '@spark-view/spark-data'
 *
 * const dk = parseDataKey('MyApp@Users@default@rows')
 * // { scope: 'MyApp', tableName: 'Users', viewId: 'default', field: 'rows' }
 *
 * const data = resolveDataKey(dk, dataSet)
 * // → DataView.rows
 * ```
 */

import type { DataSet } from '../dataset'
import type { IDataRow } from '../types'

// ===== 类型定义 =====

/** DataKey 可绑定的字段类型 */
export type DataKeyField = 'rows' | 'currentRow' | 'selectedRows'

/** DataKey 解析后的描述符 */
export interface DataKeyDescriptor {
  /** 数据空间名称或页面ID */
  scope: string
  /** 表名 */
  tableName: string
  /** 视图ID */
  viewId: string
  /** 绑定字段 */
  field: DataKeyField
  /** 原始 dataKey 字符串 */
  raw: string
}

// ===== 常量 =====

/** DataKey 分隔符 */
const SEPARATOR = '@'

/** 合法字段名集合 */
const VALID_FIELDS = new Set<string>(['rows', 'currentRow', 'selectedRows'])


// ===== 解析函数 =====

/**
 * 判断 dataKey 是否为 DataSet 数据键（新格式或旧格式）
 *
 * @param dataKey 原始 dataKey 字符串
 * @returns 是否为 DataSet 绑定键
 */
export function isDataKey(dataKey: string): boolean {
  if (!dataKey) return false
  return dataKey.includes(SEPARATOR)
}

/**
 * 解析 dataKey 字符串为结构化描述符
 *
 * 支持格式：
 *   - `scope@tableName@viewId@field`   → 完整 4 段
 *   - `scope@tableName@field`           → 省略 viewId，默认 'default'
 *
 * @param dataKey 原始 dataKey 字符串
 * @returns 解析后的描述符，非 DataSet 键返回 null
 */
export function parseDataKey(dataKey: string): DataKeyDescriptor | null {
  if (!dataKey) return null

  // ── 新格式：使用 @ 分隔 ──
  // ── 使用 @ 分隔的新格式 ──
  const parts = dataKey.split(SEPARATOR)

  if (parts.length === 4) {
    // scope@tableName@viewId@field
    const [scope, tableName, viewId, field] = parts
    if (!scope || !tableName || !viewId || !field || !VALID_FIELDS.has(field)) return null
    return { scope, tableName, viewId, field: field as DataKeyField, raw: dataKey }
  }

  if (parts.length === 3) {
    // scope@tableName@field → viewId = 'default'
    const [scope, tableName, field] = parts
    if (!scope || !tableName || !field || !VALID_FIELDS.has(field)) return null
    return { scope, tableName, viewId: 'default', field: field as DataKeyField, raw: dataKey }
  }

  // 段数不对或不含 @
  return null
}

/**
 * 从 DataSet 中解析数据键对应的值
 *
 * @param descriptor 已解析的描述符（parseDataKey 返回值）
 * @param dataSet 数据集实例
 * @returns 解析到的数据值
 */
export function resolveDataKey(
  descriptor: DataKeyDescriptor,
  dataSet: DataSet
): IDataRow[] | IDataRow | null | undefined {
  const table = dataSet.getTable(descriptor.tableName)
  if (!table) return undefined

  const view = table.getOrCreateView(descriptor.viewId)
  if (!view) return undefined

  switch (descriptor.field) {
    case 'rows':         return view.rows
    case 'currentRow':   return view.currentRow
    case 'selectedRows': return view.selectedRows
    default:             return undefined
  }
}

/**
 * 构建标准化 DataKey 字符串
 *
 * @param scope 数据空间名称
 * @param tableName 表名
 * @param viewId 视图ID（默认 'default'）
 * @param field 绑定字段
 * @returns 格式化后的 dataKey 字符串
 */
export function buildDataKey(
  scope: string,
  tableName: string,
  field: DataKeyField,
  viewId: string = 'default'
): string {
  return `${scope}${SEPARATOR}${tableName}${SEPARATOR}${viewId}${SEPARATOR}${field}`
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
