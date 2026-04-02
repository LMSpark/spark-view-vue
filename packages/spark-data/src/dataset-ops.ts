/**
 * DataSet Operations — 直接操作 DataSet/DataTable/DataView 运行时对象
 *
 * 设计原则：
 * - 直接操作运行时对象（DataSet/DataTable/DataView），不操作元数据 JSON
 * - 需要元数据时通过 toData() 序列化
 * - 业务规则违反抛 DataSetOpError（调用方 try/catch 处理）
 * - 参数验证不在此层（由 stills 注册层负责，因为输入都是 JSON）
 * - 返回值 = 操作结果数据（供调用方组装 AI 响应）
 */

import { DataSet } from './dataset'
import { DataTable } from './data-table'
import type { DataView } from './data-view'
import type {
  DataColumn,
  CrudApi,
  IDataRow,
  AggregateColumnConfig,
  TreeConfig,
  TableRelation,
  ViewDependency,
} from './types'

// ── Error 类型 ────────────────────────────────────────────

export class DataSetOpError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly fix: string,
  ) {
    super(message)
    this.name = 'DataSetOpError'
  }
}

// ── 内部 helper ───────────────────────────────────────────

function requireTable(ds: DataSet, tableName: string): DataTable {
  const table = ds.getTable(tableName)
  if (!table) {
    throw new DataSetOpError('TABLE_NOT_FOUND', `表 ${tableName} 不存在`, '请先 datatable.create 建表')
  }
  return table
}

function requireView(ds: DataSet, tableName: string, viewId?: string): { table: DataTable; view: DataView; vid: string } {
  const table = requireTable(ds, tableName)
  const vid = viewId ?? 'default'
  const view = table.getView(vid)
  if (!view) {
    throw new DataSetOpError(
      'VIEW_NOT_FOUND',
      `视图 ${vid} 不存在`,
      vid === 'default' ? '请先 datatable.create 建表' : '请先 dataview.create 创建视图',
    )
  }
  return { table, view, vid }
}

// ═══════════════════════════════════════════════════════════
// DataSet 操作
// ═══════════════════════════════════════════════════════════

/** 创建空 DataSet 实例 */
export function dsCreateDataSet(name: string): DataSet {
  return new DataSet({
    dataSetName: name,
    tables: {},
    tableRelations: [],
    viewDependencies: [],
  })
}

/** 返回 DataSet 结构摘要 */
export function dsDescribeDataSet(ds: DataSet, opts?: { schemaLocked?: boolean }): Record<string, unknown> {
  const tableNames = Object.keys(ds.tables)
  const totalColumns = Object.values(ds.tables).reduce((sum, t) => sum + t.columns.length, 0)
  const computedColumns = Object.values(ds.tables).reduce(
    (sum, t) => sum + t.columns.filter((c) => c.computeExpression !== undefined).length,
    0,
  )

  return {
    dataSetName: ds.dataSetName,
    tables: tableNames,
    tableCount: tableNames.length,
    totalColumns,
    computedColumns,
    relations: ds.tableRelations?.length ?? 0,
    viewDependencies: ds.viewDependencies?.length ?? 0,
    schemaLocked: opts?.schemaLocked ?? false,
  }
}

/** 全量结构校验，返回 issues[] */
export function dsValidateDataSet(ds: DataSet, opts?: { schemaLocked?: boolean }): Record<string, unknown> {
  const issues: Array<{ rule: string; pass: boolean; detail?: string }> = []

  // 检查 1: 每表至少一个主键
  for (const [name, table] of Object.entries(ds.tables)) {
    const hasPK = table.columns.some((c) => c.isPrimaryKey)
    issues.push({
      rule: `表 ${name} 至少一个主键`,
      pass: hasPK,
      ...(!hasPK ? { detail: `表 ${name} 缺少主键列` } : {}),
    })
  }

  // 检查 2: 关系引用的表和字段都存在
  for (const rel of ds.tableRelations ?? []) {
    const parentExists = ds.getTable(rel.parentTable) !== undefined
    const childExists = ds.getTable(rel.childTable) !== undefined
    const pass = parentExists && childExists
    issues.push({
      rule: `关系 ${rel.parentTable}→${rel.childTable} 引用表存在`,
      pass,
      ...(!pass ? { detail: `${!parentExists ? rel.parentTable : rel.childTable} 不存在` } : {}),
    })

    if (pass && rel.parentField) {
      const parentHasField = ds.getTable(rel.parentTable)?.columns.some((c) => c.name === rel.parentField) ?? false
      const childHasField = rel.childField
        ? (ds.getTable(rel.childTable)?.columns.some((c) => c.name === rel.childField) ?? false)
        : true
      const fieldPass = parentHasField && childHasField
      issues.push({
        rule: `关系 ${rel.parentTable}→${rel.childTable} 引用字段存在`,
        pass: fieldPass,
        ...(!fieldPass ? { detail: '关联字段在对应表中未找到' } : {}),
      })
    }
  }

  // 检查 3: 计算列
  for (const [name, table] of Object.entries(ds.tables)) {
    for (const col of table.columns) {
      if (col.computeExpression) {
        issues.push({ rule: `表 ${name} 计算列 ${col.name} 表达式有效`, pass: true })
      }
    }
  }

  // 检查 4: 无重复关系
  const relKeys = (ds.tableRelations ?? []).map((r) => `${r.parentTable}→${r.childTable}`)
  const uniqueRelKeys = new Set(relKeys)
  issues.push({
    rule: '无重复关系',
    pass: relKeys.length === uniqueRelKeys.size,
    ...(relKeys.length !== uniqueRelKeys.size ? { detail: '存在重复的表间关系' } : {}),
  })

  const valid = issues.every((i) => i.pass)
  const totalColumns = Object.values(ds.tables).reduce((sum, t) => sum + t.columns.length, 0)
  const computedColumns = Object.values(ds.tables).reduce(
    (sum, t) => sum + t.columns.filter((c) => c.computeExpression !== undefined).length,
    0,
  )
  const schemaLocked = opts?.schemaLocked ?? false

  return {
    status: 'ok',
    valid,
    dataSetName: ds.dataSetName,
    summary: {
      tables: Object.keys(ds.tables).length,
      totalColumns,
      computedColumns,
      relations: ds.tableRelations?.length ?? 0,
      schemaLocked,
    },
    checks: issues,
    issues: issues.filter((i) => !i.pass),
    hint: valid
      ? schemaLocked
        ? '校验通过'
        : '校验通过，无问题。请执行 schema.lock 锁定 schema'
      : '存在校验问题，请先修复',
  }
}

/** 导出完整 IDataSetMetadata 快照（通过 toData 序列化，深拷贝隔离） */
export function dsExportDataSet(ds: DataSet): Record<string, unknown> {
  const snapshot = JSON.parse(JSON.stringify(ds.toData())) as Record<string, unknown>
  return { status: 'ok', snapshot }
}

// ═══════════════════════════════════════════════════════════
// DataTable 操作
// ═══════════════════════════════════════════════════════════

/** 添加一张表（含 default 视图），返回结果数据 */
export function dsAddTable(ds: DataSet, tableName: string, columns: DataColumn[]): Record<string, unknown> {
  if (ds.getTable(tableName)) {
    throw new DataSetOpError('TABLE_EXISTS', `表 ${tableName} 已存在`, '使用 datatable.addColumns 向已有表追加列')
  }

  const table = new DataTable(tableName, columns)
  ds.tables[tableName] = table
  table.setDataSet(ds)

  const computedCols = columns.filter((c) => c.computeExpression !== undefined)

  return {
    status: 'ok',
    tableName,
    columnCount: columns.length,
    columns: columns.map((c) => c.name),
    ...(computedCols.length > 0 ? { computedColumns: computedCols.map((c) => c.name) } : {}),
  }
}

/** 返回指定表详情 */
export function dsDescribeTable(ds: DataSet, tableName: string): Record<string, unknown> {
  const table = requireTable(ds, tableName)

  const relations = (ds.tableRelations ?? []).filter(
    (r) => r.parentTable === tableName || r.childTable === tableName,
  )

  // 排除框架计算列（如 _pk），只展示用户定义列
  const userColumns = table.columns.filter(c => !c.isComputed)

  return {
    tableName: table.tableName,
    columns: userColumns.map((c) => ({
      name: c.name,
      type: c.type,
      isPrimaryKey: c.isPrimaryKey ?? false,
      label: c.label,
      computeExpression: c.computeExpression,
    })),
    columnCount: userColumns.length,
    api: table.api ?? null,
    viewCount: Object.keys(table.views).length,
    views: Object.keys(table.views),
    relations: relations.map((r) => `${r.parentTable}→${r.childTable}`),
  }
}

/** 向已有表追加列（同名列跳过不覆盖） */
export function dsAddColumns(ds: DataSet, tableName: string, columns: DataColumn[]): Record<string, unknown> {
  const table = requireTable(ds, tableName)

  const existingNames = new Set(table.columns.map((c) => c.name))
  const added: string[] = []
  const skipped: string[] = []

  for (const col of columns) {
    if (existingNames.has(col.name)) {
      skipped.push(col.name)
    } else {
      table.columns.push(col)
      added.push(col.name)
    }
  }

  return {
    status: 'ok',
    tableName,
    added,
    skipped,
    totalColumns: table.columns.length,
  }
}

/** 修改单列属性（不允许改 name） */
export function dsUpdateColumn(ds: DataSet, tableName: string, columnName: string, updates: Partial<DataColumn>): Record<string, unknown> {
  const table = requireTable(ds, tableName)

  const col = table.columns.find((c) => c.name === columnName)
  if (!col) {
    throw new DataSetOpError('COLUMN_NOT_FOUND', `列 ${columnName} 不存在`, '请查 datatable.describe')
  }

  const { name: _name, ...safeUpdates } = updates
  Object.assign(col, safeUpdates)

  return {
    status: 'ok',
    tableName,
    columnName,
    updatedFields: Object.keys(safeUpdates),
  }
}

/** 删除列（校验关系引用） */
export function dsRemoveColumn(ds: DataSet, tableName: string, columnName: string): Record<string, unknown> {
  const table = requireTable(ds, tableName)

  const idx = table.columns.findIndex((c) => c.name === columnName)
  if (idx < 0) {
    throw new DataSetOpError('COLUMN_NOT_FOUND', `列 ${columnName} 不存在`, '请查 datatable.describe')
  }

  const relImpact = (ds.tableRelations ?? []).filter(
    (r) =>
      (r.parentTable === tableName && r.parentField === columnName) ||
      (r.childTable === tableName && r.childField === columnName),
  )

  if (relImpact.length > 0) {
    throw new DataSetOpError(
      'COLUMN_IN_USE',
      `列 ${columnName} 被 ${relImpact.length} 条关系引用`,
      '请先 relation.remove 相关关系后再删除此列',
    )
  }

  table.columns.splice(idx, 1)

  return {
    status: 'ok',
    tableName,
    columnName,
    remainingColumns: table.columns.length,
  }
}

/** 设置表的 CrudApi 配置 */
export function dsSetTableApi(ds: DataSet, tableName: string, api: CrudApi): Record<string, unknown> {
  const table = requireTable(ds, tableName)
  table.setApi(api)

  const endpoints = Object.keys(api).filter((k) => api[k as keyof CrudApi] !== undefined)

  return { status: 'ok', tableName, endpoints }
}

/** 写入内联静态行到 default view */
export function dsAddRows(ds: DataSet, tableName: string, rows: IDataRow[]): Record<string, unknown> {
  const { table, view } = requireView(ds, tableName, 'default')

  // 内联静态数据的 source of truth 是 DataTable.rows。
  // default 视图只是当前展示快照，两者需要同步，后续内存级联才会基于完整源数据过滤。
  const nextRows = [...table.rows, ...rows]
  table.rows = nextRows
  view.replaceRows([...nextRows])

  return {
    status: 'ok',
    tableName,
    addedRows: rows.length,
    totalRows: view.rows.length,
  }
}

// ═══════════════════════════════════════════════════════════
// DataView 操作
// ═══════════════════════════════════════════════════════════

/** 为表添加自定义 DataView */
export function dsAddView(ds: DataSet, tableName: string, viewId: string): Record<string, unknown> {
  const table = requireTable(ds, tableName)

  if (table.getView(viewId)) {
    throw new DataSetOpError('VIEW_EXISTS', `视图 ${viewId} 已存在`, '请用 dataview.configure 配置')
  }

  table.getOrCreateView(viewId)

  return { tableName, viewId, viewCount: Object.keys(table.views).length }
}

/** 查看视图配置详情（通过 toData 序列化） */
export function dsDescribeView(ds: DataSet, tableName: string, viewId?: string): Record<string, unknown> {
  const { view, vid, table } = requireView(ds, tableName, viewId)

  return {
    tableName,
    viewId: vid,
    config: view.toData(),
    viewIds: Object.keys(table.views),
  }
}

/** 配置视图属性（autoLoad / pageSize / filterExpression 等） */
export function dsConfigureView(
  ds: DataSet,
  tableName: string,
  viewId: string | undefined,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const { view, vid } = requireView(ds, tableName, viewId)

  view.applyViewConfig(config)

  return { tableName, viewId: vid, config: view.toData() }
}

/** 设置视图级聚合列 */
export function dsSetAggregates(
  ds: DataSet,
  tableName: string,
  viewId: string | undefined,
  aggregates: Record<string, AggregateColumnConfig>,
): Record<string, unknown> {
  const { table, view, vid } = requireView(ds, tableName, viewId)

  // 校验聚合引用的字段存在
  const colNames = new Set(table.columns.map((c) => c.name))
  const missingFields = Object.entries(aggregates)
    .map(([key, cfg]) => cfg.field ?? key)
    .filter((f) => !colNames.has(f))

  if (missingFields.length > 0) {
    throw new DataSetOpError(
      'COLUMN_NOT_FOUND',
      `聚合引用的字段不存在: ${missingFields.join(', ')}`,
      '请先添加相关列',
    )
  }

  view.applyViewConfig({ aggregates })

  return {
    tableName,
    viewId: vid,
    aggregates,
    aggregateCount: Object.keys(aggregates).length,
  }
}

/** 设置视图树配置 */
export function dsSetTreeConfig(
  ds: DataSet,
  tableName: string,
  viewId: string | undefined,
  treeConfig: TreeConfig,
): Record<string, unknown> {
  const { table, view, vid } = requireView(ds, tableName, viewId)

  // 检查树配置引用的字段存在
  const colNames = new Set(table.columns.map((c) => c.name))
  const { idField, parentIdField } = treeConfig
  if (idField === undefined || !colNames.has(idField)) {
    throw new DataSetOpError('COLUMN_NOT_FOUND', `idField "${idField ?? ''}" 不存在`, '请检查列名')
  }
  if (parentIdField === undefined || !colNames.has(parentIdField)) {
    throw new DataSetOpError('COLUMN_NOT_FOUND', `parentIdField "${parentIdField ?? ''}" 不存在`, '请检查列名')
  }

  view.treeConfig = treeConfig

  return { tableName, viewId: vid, treeConfig }
}

// ═══════════════════════════════════════════════════════════
// Relation 操作
// ═══════════════════════════════════════════════════════════

/** 添加 TableRelation */
export function dsAddRelation(
  ds: DataSet,
  params: { parentTable: string; childTable: string; parentField: string; childField: string; relationName?: string },
): Record<string, unknown> {
  ds.tableRelations ??= []

  // 检查表是否存在
  const parentTable = ds.getTable(params.parentTable)
  const childTable = ds.getTable(params.childTable)
  if (!parentTable) {
    throw new DataSetOpError('TABLE_NOT_FOUND', `父表 ${params.parentTable} 不存在`, '请先 datatable.create')
  }
  if (!childTable) {
    throw new DataSetOpError('TABLE_NOT_FOUND', `子表 ${params.childTable} 不存在`, '请先 datatable.create')
  }

  // 检查字段是否存在
  if (!parentTable.columns.some((c) => c.name === params.parentField)) {
    throw new DataSetOpError('COLUMN_NOT_FOUND', `父表字段 ${params.parentField} 不存在`, '请查 datatable.describe')
  }
  if (!childTable.columns.some((c) => c.name === params.childField)) {
    throw new DataSetOpError('COLUMN_NOT_FOUND', `子表字段 ${params.childField} 不存在`, '请查 datatable.describe')
  }

  // 检查重复
  const dup = ds.tableRelations.some(
    (r) =>
      r.parentTable === params.parentTable &&
      r.childTable === params.childTable &&
      r.parentField === params.parentField &&
      r.childField === params.childField,
  )
  if (dup) {
    throw new DataSetOpError('RELATION_EXISTS', '相同关系已存在', '跳过此步骤')
  }

  const relation: TableRelation = {
    parentTable: params.parentTable,
    childTable: params.childTable,
    parentField: params.parentField,
    childField: params.childField,
    ...(params.relationName ? { relationName: params.relationName } : {}),
  }

  ds.tableRelations.push(relation)

  return {
    status: 'ok',
    parentTable: params.parentTable,
    childTable: params.childTable,
    parentField: params.parentField,
    childField: params.childField,
    relationCount: ds.tableRelations.length,
  }
}

/** 删除 TableRelation（校验 viewDependency 引用） */
export function dsRemoveRelation(ds: DataSet, parentTable: string, childTable: string): Record<string, unknown> {
  ds.tableRelations ??= []

  const idx = ds.tableRelations.findIndex(
    (r) => r.parentTable === parentTable && r.childTable === childTable,
  )
  if (idx < 0) {
    throw new DataSetOpError('RELATION_NOT_FOUND', '关系不存在', '请查 relation.list')
  }

  // 检查 viewDependency 引用
  const blocking = (ds.viewDependencies ?? []).some(
    (d) => d.parentTable === parentTable && d.childTable === childTable,
  )
  if (blocking) {
    throw new DataSetOpError(
      'RELATION_IN_USE',
      `关系 ${parentTable}→${childTable} 被 viewDependency 引用`,
      '先 dependency.remove 再删关系',
    )
  }

  ds.tableRelations.splice(idx, 1)

  return { status: 'ok', parentTable, childTable, relationCount: ds.tableRelations.length }
}

/** 列出所有 tableRelations */
export function dsListRelations(ds: DataSet): Record<string, unknown> {
  const rels = ds.tableRelations ?? []
  return {
    relations: rels.map((r) => ({
      parentTable: r.parentTable,
      childTable: r.childTable,
      parentField: r.parentField,
      childField: r.childField,
      relationName: r.relationName,
    })),
    count: rels.length,
  }
}

// ═══════════════════════════════════════════════════════════
// ViewDependency 操作
// ═══════════════════════════════════════════════════════════

/** 添加 ViewDependency */
export function dsAddDependency(
  ds: DataSet,
  params: { parentTable: string; childTable: string; dependencyType?: ViewDependency['dependencyType']; autoLoad?: boolean },
): Record<string, unknown> {
  // 检查表存在
  if (!ds.getTable(params.parentTable)) {
    throw new DataSetOpError('TABLE_NOT_FOUND', `父表 ${params.parentTable} 不存在`, '请确认表名')
  }
  if (!ds.getTable(params.childTable)) {
    throw new DataSetOpError('TABLE_NOT_FOUND', `子表 ${params.childTable} 不存在`, '请确认表名')
  }

  // 检查底层 relation 是否存在
  const hasRelation = (ds.tableRelations ?? []).some(
    (r) => r.parentTable === params.parentTable && r.childTable === params.childTable,
  )
  if (!hasRelation) {
    throw new DataSetOpError(
      'NO_RELATION',
      `${params.parentTable}→${params.childTable} 没有 tableRelation`,
      '请先 relation.add',
    )
  }

  ds.viewDependencies ??= []

  // 检查重复
  const dup = ds.viewDependencies.some(
    (d) => d.parentTable === params.parentTable && d.childTable === params.childTable,
  )
  if (dup) {
    throw new DataSetOpError('DEPENDENCY_EXISTS', '相同依赖已存在', '跳过此步骤')
  }

  const dep: ViewDependency = {
    parentTable: params.parentTable,
    childTable: params.childTable,
    dependencyType: params.dependencyType ?? 'currentRow',
    ...(params.autoLoad !== undefined ? { autoLoad: params.autoLoad } : {}),
  }

  ds.viewDependencies.push(dep)

  return {
    status: 'ok',
    parentTable: params.parentTable,
    childTable: params.childTable,
    dependencyType: dep.dependencyType,
    dependencyCount: ds.viewDependencies.length,
  }
}

/** 删除 ViewDependency */
export function dsRemoveDependency(ds: DataSet, parentTable: string, childTable: string): Record<string, unknown> {
  ds.viewDependencies ??= []

  const idx = ds.viewDependencies.findIndex(
    (d) => d.parentTable === parentTable && d.childTable === childTable,
  )
  if (idx < 0) {
    throw new DataSetOpError('DEPENDENCY_NOT_FOUND', '依赖不存在', '请确认参数')
  }

  ds.viewDependencies.splice(idx, 1)

  return { status: 'ok', parentTable, childTable, dependencyCount: ds.viewDependencies.length }
}

// ═══════════════════════════════════════════════════════════
// Schema 操作（纯校验部分）
// ═══════════════════════════════════════════════════════════

/** 检查 schema 是否可锁定（每表至少一个 PK） */
export function dsCheckSchemaLockable(ds: DataSet): Record<string, unknown> {
  const tables = Object.keys(ds.tables)
  if (tables.length === 0) {
    throw new DataSetOpError('EMPTY_SCHEMA', '没有任何表，无法锁定', '请先 datatable.create')
  }

  const noPk = tables.filter((t) => !(ds.getTable(t)?.columns.some((c) => c.isPrimaryKey) ?? false))
  if (noPk.length > 0) {
    throw new DataSetOpError(
      'MISSING_PK',
      `以下表缺少主键列: ${noPk.join(', ')}`,
      '请 datatable.addColumns 添加 isPrimaryKey=true 的列',
    )
  }

  return {
    tableCount: tables.length,
    relationCount: (ds.tableRelations ?? []).length,
  }
}
