/**
 * Metadata Operations — IDataSetMetadata 的运行时投影包装层
 *
 * 对外仍然接收/返回元数据对象；
 * 对内不再直接操纵 ITableMetadata / IViewMetadata 细节，
 * 而是统一投影到 DataSet/DataTable/DataView，再直接调用 dataset-ops。
 *
 * 这样可以确保：
 * - 元数据路径与运行时路径共用同一套业务规则；
 * - DataView/DataTable 新增能力只需补在运行时对象，不必在 metadata-ops 再复制一份；
 * - 写操作最终仍然回写到调用方持有的 IDataSetMetadata 引用，保留 builder 语义。
 */

import type {
  IDataSetMetadata,
  IViewMetadata,
  DataColumn,
  CrudApi,
  ViewDependency,
  AggregateColumnConfig,
  TreeConfig,
  IDataRow,
} from './types'
import { DataSet } from './dataset'
import {
  DataSetOpError,
  dsCreateDataSet,
  dsDescribeDataSet,
  dsValidateDataSet,
  dsExportDataSet,
  dsAddTable,
  dsDescribeTable,
  dsAddColumns,
  dsUpdateColumn,
  dsRemoveColumn,
  dsSetTableApi,
  dsAddRows,
  dsAddView,
  dsDescribeView,
  dsConfigureView,
  dsSetAggregates,
  dsSetTreeConfig,
  dsAddRelation,
  dsRemoveRelation,
  dsListRelations,
  dsAddDependency,
  dsRemoveDependency,
  dsCheckSchemaLockable,
} from './dataset-ops'

// ── 结果类型 ──────────────────────────────────────────────

export type MetadataOpResult<T = unknown> =
  | { ok: true; data: T; summary: string }
  | { ok: false; code: string; msg: string; fix: string }

type ValidationIssue = { rule: string; pass: boolean; detail?: string }

interface ValidateData extends Record<string, unknown> {
  valid: boolean
  issues: ValidationIssue[]
}

// ── 对外参数类型（保持 metadata-ops API 稳定） ────────────

export interface MetaRelationParams {
  parentTable: string
  childTable: string
  parentField: string
  childField: string
  relationName?: string
}

export interface MetaDependencyParams {
  parentTable: string
  childTable: string
  dependencyType?: ViewDependency['dependencyType']
  autoLoad?: boolean
}

// ── 内部 helper ───────────────────────────────────────────

function toMetadataError(error: unknown): MetadataOpResult {
  if (error instanceof DataSetOpError) {
    return {
      ok: false,
      code: error.code,
      msg: error.message,
      fix: error.fix,
    }
  }

  return {
    ok: false,
    code: 'METADATA_OP_FAILED',
    msg: error instanceof Error ? error.message : 'Metadata operation failed',
    fix: '请检查输入参数与运行时投影结果',
  }
}

function countTotalColumns(ds: DataSet): number {
  return Object.values(ds.tables).reduce(
    (sum, table) => sum + table.columns.filter(c => !c.isComputed).length, 0,
  )
}

function syncMetadataFromRuntime(target: IDataSetMetadata, runtime: DataSet): void {
  const next = runtime.toData()

  target.dataSetName = next.dataSetName
  target.tables = next.tables
  target.version = next.version
  target.pageId = next.pageId

  if (next.schemaVersion !== undefined) target.schemaVersion = next.schemaVersion
  else delete target.schemaVersion

  if (next.tableRelations !== undefined) target.tableRelations = next.tableRelations
  else delete target.tableRelations

  if (next.viewDependencies !== undefined) target.viewDependencies = next.viewDependencies
  else delete target.viewDependencies
}

function projectRead<T>(
  ds: IDataSetMetadata,
  operation: (runtime: DataSet) => T,
): { runtime: DataSet; data: T } | { error: MetadataOpResult } {
  try {
    const runtime = DataSet.fromData(ds)
    // 恢复元数据原始 viewDependencies，绕过 DataSet 构造函数的自动推导
    // 使 ds* 操作基于"元数据实际值"而非"运行时自动推导值"做校验
    runtime.viewDependencies = ds.viewDependencies
    const data = operation(runtime)
    return { runtime, data }
  } catch (error) {
    return { error: toMetadataError(error) }
  }
}

function projectWrite<T>(
  ds: IDataSetMetadata,
  operation: (runtime: DataSet) => T,
): { runtime: DataSet; data: T } | { error: MetadataOpResult } {
  try {
    const runtime = DataSet.fromData(ds)
    // 恢复元数据原始 viewDependencies，绕过 DataSet 构造函数的自动推导
    runtime.viewDependencies = ds.viewDependencies
    const data = operation(runtime)
    syncMetadataFromRuntime(ds, runtime)
    return { runtime, data }
  } catch (error) {
    return { error: toMetadataError(error) }
  }
}

// ═══════════════════════════════════════════════════════════
// Dataset 操作
// ═══════════════════════════════════════════════════════════

/** 创建空 IDataSetMetadata。内部通过 DataSet 运行时对象生成 canonical v2 结构。 */
export function metaCreateDataSet(name: string): IDataSetMetadata {
  const created = dsCreateDataSet(name).toData()
  return {
    dataSetName: created.dataSetName,
    schemaVersion: created.schemaVersion ?? 2,
    tables: created.tables,
    tableRelations: created.tableRelations ?? [],
    viewDependencies: created.viewDependencies ?? [],
    version: created.version,
    pageId: created.pageId,
  }
}

/** 返回 DataSet 结构摘要。 */
export function metaDescribeDataSet(
  ds: IDataSetMetadata,
  opts?: { schemaLocked?: boolean },
): MetadataOpResult {
  const projected = projectRead(ds, (runtime) => dsDescribeDataSet(runtime, opts))
  if ('error' in projected) return projected.error

  return {
    ok: true,
    data: projected.data,
    summary: `DataSet ${projected.runtime.dataSetName}: ${Object.keys(projected.runtime.tables).length} 表, ${countTotalColumns(projected.runtime)} 列, ${projected.runtime.tableRelations?.length ?? 0} 关系`,
  }
}

/** 全量结构校验，返回 issues[]。 */
export function metaValidateDataSet(
  ds: IDataSetMetadata,
  opts?: { schemaLocked?: boolean },
): MetadataOpResult {
  const projected = projectRead(ds, (runtime) => dsValidateDataSet(runtime, opts) as ValidateData)
  if ('error' in projected) return projected.error

  return {
    ok: true,
    data: projected.data,
    summary: `校验${projected.data.valid ? '通过' : '未通过'}：${projected.data.issues.length} 个问题`,
  }
}

/** 导出完整 IDataSetMetadata 快照（通过运行时 toData 深拷贝导出）。 */
export function metaExportDataSet(ds: IDataSetMetadata): MetadataOpResult {
  const projected = projectRead(ds, (runtime) => dsExportDataSet(runtime))
  if ('error' in projected) return projected.error

  return {
    ok: true,
    data: projected.data,
    summary: `导出 DataSet: ${projected.runtime.dataSetName}`,
  }
}

// ═══════════════════════════════════════════════════════════
// DataTable 操作
// ═══════════════════════════════════════════════════════════

/** 添加一张表（含 default 视图）。 */
export function metaAddTable(
  ds: IDataSetMetadata,
  tableName: string,
  columns: DataColumn[],
): MetadataOpResult {
  const projected = projectWrite(ds, (runtime) => dsAddTable(runtime, tableName, columns))
  if ('error' in projected) return projected.error

  return {
    ok: true,
    data: projected.data,
    summary: `建表 ${tableName}（${columns.length} 列）`,
  }
}

/** 返回指定表详情（列清单/关系/API/视图数）。 */
export function metaDescribeTable(ds: IDataSetMetadata, tableName: string): MetadataOpResult {
  const projected = projectRead(ds, (runtime) => dsDescribeTable(runtime, tableName))
  if ('error' in projected) return projected.error

  return {
    ok: true,
    data: projected.data,
    summary: `表 ${tableName} 详情`,
  }
}

/** 向已有表追加列（同名列跳过不覆盖）。 */
export function metaAddColumns(
  ds: IDataSetMetadata,
  tableName: string,
  columns: DataColumn[],
): MetadataOpResult {
  const projected = projectWrite(ds, (runtime) => dsAddColumns(runtime, tableName, columns) as {
    added: string[]
    skipped: string[]
  })
  if ('error' in projected) return projected.error

  return {
    ok: true,
    data: projected.data,
    summary: `追加 ${projected.data.added.length} 列到 ${tableName}${projected.data.skipped.length > 0 ? `（跳过 ${projected.data.skipped.length} 个重名列）` : ''}`,
  }
}

/** 修改单列属性（不允许改 name）。 */
export function metaUpdateColumn(
  ds: IDataSetMetadata,
  tableName: string,
  columnName: string,
  updates: Partial<DataColumn>,
): MetadataOpResult {
  const { name: _ignoredName, ...safeUpdates } = updates
  const projected = projectWrite(ds, (runtime) => dsUpdateColumn(runtime, tableName, columnName, updates))
  if ('error' in projected) return projected.error

  return {
    ok: true,
    data: projected.data,
    summary: `更新 ${tableName}.${columnName}: ${Object.keys(safeUpdates).join(', ')}`,
  }
}

/** 删除列（校验关系引用）。 */
export function metaRemoveColumn(
  ds: IDataSetMetadata,
  tableName: string,
  columnName: string,
): MetadataOpResult {
  const projected = projectWrite(ds, (runtime) => dsRemoveColumn(runtime, tableName, columnName))
  if ('error' in projected) return projected.error

  return {
    ok: true,
    data: projected.data,
    summary: `删除列 ${tableName}.${columnName}`,
  }
}

/** 设置表的 CrudApi 配置。 */
export function metaSetTableApi(
  ds: IDataSetMetadata,
  tableName: string,
  api: CrudApi,
): MetadataOpResult {
  const projected = projectWrite(ds, (runtime) => dsSetTableApi(runtime, tableName, api))
  if ('error' in projected) return projected.error

  const endpoints = Object.keys(api).filter((key) => api[key as keyof CrudApi] !== undefined)
  return {
    ok: true,
    data: projected.data,
    summary: `设置 ${tableName} API: ${endpoints.join(', ')}`,
  }
}

/** 写入内联静态行到 default view。 */
export function metaAddRows(
  ds: IDataSetMetadata,
  tableName: string,
  rows: IDataRow[],
): MetadataOpResult {
  const projected = projectWrite(ds, (runtime) => dsAddRows(runtime, tableName, rows))
  if ('error' in projected) return projected.error

  return {
    ok: true,
    data: projected.data,
    summary: `写入 ${rows.length} 行到 ${tableName}`,
  }
}

// ═══════════════════════════════════════════════════════════
// DataView 操作
// ═══════════════════════════════════════════════════════════

/** 为表添加自定义 DataView。 */
export function metaAddView(
  ds: IDataSetMetadata,
  tableName: string,
  viewId: string,
): MetadataOpResult {
  const projected = projectWrite(ds, (runtime) => dsAddView(runtime, tableName, viewId))
  if ('error' in projected) return projected.error

  return {
    ok: true,
    data: projected.data,
    summary: `创建视图 ${tableName}:${viewId}`,
  }
}

/** 查看视图配置详情。 */
export function metaDescribeView(
  ds: IDataSetMetadata,
  tableName: string,
  viewId?: string,
): MetadataOpResult {
  const projected = projectRead(ds, (runtime) => dsDescribeView(runtime, tableName, viewId))
  if ('error' in projected) return projected.error

  const resolvedViewId = viewId ?? 'default'
  return {
    ok: true,
    data: projected.data,
    summary: `视图 ${tableName}:${resolvedViewId}`,
  }
}

/** 配置视图属性（autoLoad / pageSize / filterExpression 等）。 */
export function metaConfigureView(
  ds: IDataSetMetadata,
  tableName: string,
  viewId: string | undefined,
  config: Partial<IViewMetadata>,
): MetadataOpResult {
  const projected = projectWrite(ds, (runtime) => dsConfigureView(runtime, tableName, viewId, config as Record<string, unknown>))
  if ('error' in projected) return projected.error

  const resolvedViewId = viewId ?? 'default'
  return {
    ok: true,
    data: projected.data,
    summary: `配置视图 ${tableName}:${resolvedViewId}（${Object.keys(config).join(', ')}）`,
  }
}

/** 设置视图级聚合列。 */
export function metaSetAggregates(
  ds: IDataSetMetadata,
  tableName: string,
  viewId: string | undefined,
  aggregates: Record<string, AggregateColumnConfig>,
): MetadataOpResult {
  const projected = projectWrite(ds, (runtime) => dsSetAggregates(runtime, tableName, viewId, aggregates))
  if ('error' in projected) return projected.error

  return {
    ok: true,
    data: projected.data,
    summary: `设置 ${Object.keys(aggregates).length} 个聚合列`,
  }
}

/** 设置视图树配置。 */
export function metaSetTreeConfig(
  ds: IDataSetMetadata,
  tableName: string,
  viewId: string | undefined,
  treeConfig: TreeConfig,
): MetadataOpResult {
  const projected = projectWrite(ds, (runtime) => dsSetTreeConfig(runtime, tableName, viewId, treeConfig))
  if ('error' in projected) return projected.error

  const resolvedViewId = viewId ?? 'default'
  return {
    ok: true,
    data: projected.data,
    summary: `设置树配置 ${tableName}:${resolvedViewId}（mode=${treeConfig.treeMode ?? 'flat'}）`,
  }
}

// ═══════════════════════════════════════════════════════════
// Relation 操作
// ═══════════════════════════════════════════════════════════

/** 添加 TableRelation。 */
export function metaAddRelation(
  ds: IDataSetMetadata,
  params: MetaRelationParams,
): MetadataOpResult {
  const projected = projectWrite(ds, (runtime) => dsAddRelation(runtime, params))
  if ('error' in projected) return projected.error

  return {
    ok: true,
    data: projected.data,
    summary: `添加关系 ${params.parentTable}→${params.childTable}`,
  }
}

/** 删除 TableRelation（校验 viewDependency 引用）。 */
export function metaRemoveRelation(
  ds: IDataSetMetadata,
  parentTable: string,
  childTable: string,
): MetadataOpResult {
  const projected = projectWrite(ds, (runtime) => dsRemoveRelation(runtime, parentTable, childTable))
  if ('error' in projected) return projected.error

  return {
    ok: true,
    data: projected.data,
    summary: `删除关系 ${parentTable}→${childTable}`,
  }
}

/** 列出所有 tableRelations。 */
export function metaListRelations(ds: IDataSetMetadata): MetadataOpResult {
  const projected = projectRead(ds, (runtime) => dsListRelations(runtime))
  if ('error' in projected) return projected.error

  return {
    ok: true,
    data: projected.data,
    summary: `${projected.runtime.tableRelations?.length ?? 0} 条关系`,
  }
}

// ═══════════════════════════════════════════════════════════
// ViewDependency 操作
// ═══════════════════════════════════════════════════════════

/** 添加 ViewDependency。 */
export function metaAddDependency(
  ds: IDataSetMetadata,
  params: MetaDependencyParams,
): MetadataOpResult {
  const projected = projectWrite(ds, (runtime) => dsAddDependency(runtime, params))
  if ('error' in projected) return projected.error

  return {
    ok: true,
    data: projected.data,
    summary: `添加依赖 ${params.parentTable}→${params.childTable}（${params.dependencyType ?? 'currentRow'}）`,
  }
}

/** 删除 ViewDependency。 */
export function metaRemoveDependency(
  ds: IDataSetMetadata,
  parentTable: string,
  childTable: string,
): MetadataOpResult {
  const projected = projectWrite(ds, (runtime) => dsRemoveDependency(runtime, parentTable, childTable))
  if ('error' in projected) return projected.error

  return {
    ok: true,
    data: projected.data,
    summary: `删除依赖 ${parentTable}→${childTable}`,
  }
}

// ═══════════════════════════════════════════════════════════
// Schema 操作（纯校验部分）
// ═══════════════════════════════════════════════════════════

/** 检查 schema 是否可锁定（每表至少一个 PK）。 */
export function metaCheckSchemaLockable(ds: IDataSetMetadata): MetadataOpResult {
  const projected = projectRead(ds, (runtime) => dsCheckSchemaLockable(runtime))
  if ('error' in projected) return projected.error

  return {
    ok: true,
    data: projected.data,
    summary: `可锁定（${Object.keys(projected.runtime.tables).length} 表, ${projected.runtime.tableRelations?.length ?? 0} 关系）`,
  }
}
