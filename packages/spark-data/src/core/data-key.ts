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
import { DataView } from '../data-view'
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
  /** 字段路径（用于访问行对象的具体字段，如 currentRow.totalUsers 中的 totalUsers） */
  fieldPath?: string
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
 *   - `scope@tableName@viewId@field`        → 完整 4 段
 *   - `scope@tableName@field`               → 省略 viewId，默认 'default'
 *   - `scope@tableName@viewId@field.path`   → 带字段路径（如 currentRow.totalUsers）
 *   - `scope@tableName@field.path`          → 简写 + 字段路径
 *
 * @param dataKey 原始 dataKey 字符串
 * @returns 解析后的描述符，非 DataSet 键返回 null
 */
export function parseDataKey(dataKey: string): DataKeyDescriptor | null {
  if (!dataKey) return null

  // 使用 @ 分隔符解析
  const parts = dataKey.split(SEPARATOR)

  if (parts.length === 4) {
    // scope@tableName@viewId@field 或 scope@tableName@viewId@field.path
    const [scope, tableName, viewId, fieldPart] = parts
    if (!scope || !tableName || !viewId || !fieldPart) return null
    
    // 检查是否有字段路径（如 currentRow.totalUsers）
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
    const result: DataKeyDescriptor = { scope, tableName, viewId, field: field as DataKeyField, raw: dataKey }
    if (fieldPath !== undefined) result.fieldPath = fieldPath
    return result
  }

  if (parts.length === 3) {
    // scope@tableName@field 或 scope@tableName@field.path → viewId = 'default'
    const [scope, tableName, fieldPart] = parts
    if (!scope || !tableName || !fieldPart) return null
    
    // 检查是否有字段路径
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
    const result: DataKeyDescriptor = { scope, tableName, viewId: 'default', field: field as DataKeyField, raw: dataKey }
    if (fieldPath !== undefined) result.fieldPath = fieldPath
    return result
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
): IDataRow[] | IDataRow | null | undefined | unknown {
  const table = dataSet.getTable(descriptor.tableName)
  if (!table) return undefined

  const view = table.getOrCreateView(descriptor.viewId)
  if (!view) return undefined

  let value: IDataRow[] | IDataRow | null | undefined
  
  switch (descriptor.field) {
    case 'rows':         value = view.rows; break
    case 'currentRow':   value = view.currentRow; break
    case 'selectedRows': value = view.selectedRows; break
    default:             return undefined
  }
  
  // 如果有字段路径（如 currentRow.totalUsers），从行对象中提取字段值
  if (descriptor.fieldPath && value && typeof value === 'object' && !Array.isArray(value)) {
    const pathParts = descriptor.fieldPath.split('.')
    let current: unknown = value
    
    for (const part of pathParts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part]
      } else {
        return undefined
      }
    }
    
    return current
  }
  
  return value
}

/**
 * 解析 DataKey → 绑定友好的值（rows → DataView 实例，其他字段 → 原始值）
 *
 * 与 `resolveDataKey` 的区别：`rows` 字段返回 **DataView 实例**（实现了 `IDataSource`），
 * 而非 `view.rows` 数组，更适合绑定到需要完整 DataSource 接口的组件
 * （如 `el-table`、`r-table` 等）。
 */
export function resolveDataKeyAsSource(
  descriptor: DataKeyDescriptor,
  dataSet: DataSet
): DataView | IDataRow | IDataRow[] | null | undefined | unknown {
  const table = dataSet.getTable(descriptor.tableName)
  if (!table) return undefined

  const view = table.getOrCreateView(descriptor.viewId)
  if (!view) return undefined

  let value: DataView | IDataRow | IDataRow[] | null | undefined
  
  switch (descriptor.field) {
    case 'rows':         value = view; break             // DataView 实现 IDataSource，适合整表绑定
    case 'currentRow':   value = view.currentRow; break
    case 'selectedRows': value = view.selectedRows; break
    default:             return undefined
  }
  
  // 如果有字段路径且值是行对象，提取字段值
  if (descriptor.fieldPath && value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof DataView)) {
    const pathParts = descriptor.fieldPath.split('.')
    let current: unknown = value
    
    for (const part of pathParts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part]
      } else {
        return undefined
      }
    }
    
    return current
  }
  
  return value
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
  dataSet: DataSet
): DataView | IDataRow | IDataRow[] | null | undefined {
  if (!isDataKey(rawKey)) return undefined
  const dk = parseDataKey(rawKey)
  if (!dk) return undefined
  return resolveDataKeyAsSource(dk, dataSet) as DataView | IDataRow | IDataRow[] | null | undefined
}

/**
 * 从原始字符串获取对应的 DataView（不依赖 field 字段）
 *
 * 合并了 isDataKey + parseDataKey + dataSet.getView 三步。
 * 用于需要注入 DataView 引用但不关心具体 field 的场景。
 */
export function getViewFromRawKey(
  rawKey: string,
  dataSet: DataSet
): DataView | undefined {
  if (!isDataKey(rawKey)) return undefined
  const dk = parseDataKey(rawKey)
  if (!dk) return undefined
  return dataSet.getView(dk.tableName, dk.viewId)
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
