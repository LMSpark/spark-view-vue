/**
 * Metadata Operations — IDataSetMetadata 的纯函数操作集
 *
 * 所有函数只依赖 IDataSetMetadata 参数，不感知会话/AI/框架。
 * 返回统一的 MetadataOpResult：ok 分支（data + summary）/ fail 分支（code + msg + fix）。
 *
 * 设计原则：
 * - 纯函数：输入 → 输出，可预测、可测试
 * - 就地修改（mutate）IDataSetMetadata——调用方持有引用，符合 builder 模式
 * - 业务规则校验内置（表/列/关系存在性、引用完整性）
 */

import type {
  IDataSetMetadata,
  ITableMetadata,
  IViewMetadata,
  DataColumn,
  CrudApi,
  TableRelation,
  ViewDependency,
  AggregateColumnConfig,
  TreeConfig,
  IDataRow,
} from './types'

// ── 结果类型 ──────────────────────────────────────────────

export type MetadataOpResult<T = unknown> =
  | { ok: true; data: T; summary: string }
  | { ok: false; code: string; msg: string; fix: string }

// ── 内部 helper ───────────────────────────────────────────

function resolveTable(
  ds: IDataSetMetadata,
  tableName: string,
): { table: ITableMetadata } | { error: MetadataOpResult } {
  const table = ds.tables[tableName]
  if (!table) {
    return {
      error: {
        ok: false,
        code: 'TABLE_NOT_FOUND',
        msg: `表 ${tableName} 不存在`,
        fix: '请先 datatable.create 建表',
      },
    }
  }
  return { table }
}

function resolveView(
  ds: IDataSetMetadata,
  tableName: string,
  viewId?: string,
): { table: ITableMetadata; view: IViewMetadata; vid: string } | { error: MetadataOpResult } {
  const tr = resolveTable(ds, tableName)
  if ('error' in tr) return tr

  const vid = viewId ?? 'default'
  const view = tr.table.views[vid]
  if (!view) {
    return {
      error: {
        ok: false,
        code: 'VIEW_NOT_FOUND',
        msg: `视图 ${vid} 不存在`,
        fix: vid === 'default' ? '请先 datatable.create 建表' : '请先 dataview.create 创建视图',
      },
    }
  }
  return { table: tr.table, view, vid }
}

// ═══════════════════════════════════════════════════════════
// Dataset 操作
// ═══════════════════════════════════════════════════════════

/** 创建空 IDataSetMetadata */
export function metaCreateDataSet(name: string): IDataSetMetadata {
  return {
    dataSetName: name,
    schemaVersion: 1,
    tables: {},
    tableRelations: [],
    viewDependencies: [],
    version: undefined,
    pageId: undefined,
  }
}

/** 返回 DataSet 结构摘要 */
export function metaDescribeDataSet(
  ds: IDataSetMetadata,
  opts?: { schemaLocked?: boolean },
): MetadataOpResult {
  const tableNames = Object.keys(ds.tables)
  const totalColumns = Object.values(ds.tables).reduce((sum, t) => sum + t.columns.length, 0)
  const computedColumns = Object.values(ds.tables).reduce(
    (sum, t) => sum + t.columns.filter((c) => c.computeExpression !== undefined).length,
    0,
  )

  return {
    ok: true,
    data: {
      dataSetName: ds.dataSetName,
      tables: tableNames,
      tableCount: tableNames.length,
      totalColumns,
      computedColumns,
      relations: ds.tableRelations?.length ?? 0,
      viewDependencies: ds.viewDependencies?.length ?? 0,
      schemaLocked: opts?.schemaLocked ?? false,
    },
    summary: `DataSet ${ds.dataSetName}: ${tableNames.length} 表, ${totalColumns} 列, ${ds.tableRelations?.length ?? 0} 关系`,
  }
}

/** 全量结构校验，返回 issues[] */
export function metaValidateDataSet(
  ds: IDataSetMetadata,
  opts?: { schemaLocked?: boolean },
): MetadataOpResult {
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
    const parentExists = rel.parentTable in ds.tables
    const childExists = rel.childTable in ds.tables
    const pass = parentExists && childExists
    issues.push({
      rule: `关系 ${rel.parentTable}→${rel.childTable} 引用表存在`,
      pass,
      ...(!pass ? { detail: `${!parentExists ? rel.parentTable : rel.childTable} 不存在` } : {}),
    })

    if (pass && rel.parentField) {
      const parentHasField = ds.tables[rel.parentTable]?.columns.some((c) => c.name === rel.parentField) ?? false
      const childHasField = rel.childField
        ? (ds.tables[rel.childTable]?.columns.some((c) => c.name === rel.childField) ?? false)
        : true
      const fieldPass = parentHasField && childHasField
      issues.push({
        rule: `关系 ${rel.parentTable}→${rel.childTable} 引用字段存在`,
        pass: fieldPass,
        ...(!fieldPass ? { detail: '关联字段在对应表中未找到' } : {}),
      })
    }
  }

  // 检查 3: 计算列（简单启发式）
  for (const [name, table] of Object.entries(ds.tables)) {
    for (const col of table.columns) {
      if (col.computeExpression) {
        issues.push({
          rule: `表 ${name} 计算列 ${col.name} 表达式有效`,
          pass: true,
        })
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
    ok: true,
    data: {
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
    },
    summary: `校验${valid ? '通过' : '未通过'}：${issues.filter((i) => !i.pass).length} 个问题`,
  }
}

/** 导出完整 IDataSetMetadata 快照（深拷贝） */
export function metaExportDataSet(ds: IDataSetMetadata): MetadataOpResult {
  const snapshot: IDataSetMetadata = JSON.parse(JSON.stringify(ds)) as IDataSetMetadata
  return {
    ok: true,
    data: { status: 'ok', snapshot },
    summary: `导出 DataSet: ${ds.dataSetName}`,
  }
}

// ═══════════════════════════════════════════════════════════
// DataTable 操作
// ═══════════════════════════════════════════════════════════

/** 添加一张表（含 default 视图） */
export function metaAddTable(
  ds: IDataSetMetadata,
  tableName: string,
  columns: DataColumn[],
): MetadataOpResult {
  if (tableName in ds.tables) {
    return {
      ok: false,
      code: 'TABLE_EXISTS',
      msg: `表 ${tableName} 已存在`,
      fix: '使用 datatable.addColumns 向已有表追加列',
    }
  }

  const defaultView: IViewMetadata = { tableName, viewId: 'default' }

  const table: ITableMetadata = {
    tableName,
    columns,
    views: { default: defaultView },
  }

  ds.tables[tableName] = table

  const computedCols = columns.filter((c) => c.computeExpression !== undefined)

  return {
    ok: true,
    data: {
      status: 'ok',
      tableName,
      columnCount: columns.length,
      columns: columns.map((c) => c.name),
      ...(computedCols.length > 0 ? { computedColumns: computedCols.map((c) => c.name) } : {}),
    },
    summary: `建表 ${tableName}（${columns.length} 列）`,
  }
}

/** 返回指定表详情（列清单/关系/API/视图数） */
export function metaDescribeTable(ds: IDataSetMetadata, tableName: string): MetadataOpResult {
  const tr = resolveTable(ds, tableName)
  if ('error' in tr) return tr.error
  const { table } = tr

  const relations = (ds.tableRelations ?? []).filter(
    (r) => r.parentTable === tableName || r.childTable === tableName,
  )

  return {
    ok: true,
    data: {
      tableName: table.tableName,
      columns: table.columns.map((c) => ({
        name: c.name,
        type: c.type,
        isPrimaryKey: c.isPrimaryKey ?? false,
        label: c.label,
        computeExpression: c.computeExpression,
      })),
      columnCount: table.columns.length,
      api: table.api ?? null,
      viewCount: Object.keys(table.views).length,
      views: Object.keys(table.views),
      relations: relations.map((r) => `${r.parentTable}→${r.childTable}`),
    },
    summary: `表 ${tableName} 详情`,
  }
}

/** 向已有表追加列（同名列跳过不覆盖） */
export function metaAddColumns(
  ds: IDataSetMetadata,
  tableName: string,
  columns: DataColumn[],
): MetadataOpResult {
  const tr = resolveTable(ds, tableName)
  if ('error' in tr) return tr.error
  const { table } = tr

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
    ok: true,
    data: {
      status: 'ok',
      tableName,
      added,
      skipped,
      totalColumns: table.columns.length,
    },
    summary: `追加 ${added.length} 列到 ${tableName}${skipped.length > 0 ? `（跳过 ${skipped.length} 个重名列）` : ''}`,
  }
}

/** 修改单列属性（不允许改 name） */
export function metaUpdateColumn(
  ds: IDataSetMetadata,
  tableName: string,
  columnName: string,
  updates: Partial<DataColumn>,
): MetadataOpResult {
  const tr = resolveTable(ds, tableName)
  if ('error' in tr) return tr.error
  const { table } = tr

  const col = table.columns.find((c) => c.name === columnName)
  if (!col) {
    return { ok: false, code: 'COLUMN_NOT_FOUND', msg: `列 ${columnName} 不存在`, fix: '请查 datatable.describe' }
  }

  const { name: _name, ...safeUpdates } = updates
  Object.assign(col, safeUpdates)

  return {
    ok: true,
    data: {
      status: 'ok',
      tableName,
      columnName,
      updatedFields: Object.keys(safeUpdates),
    },
    summary: `更新 ${tableName}.${columnName}: ${Object.keys(safeUpdates).join(', ')}`,
  }
}

/** 删除列（校验关系引用） */
export function metaRemoveColumn(
  ds: IDataSetMetadata,
  tableName: string,
  columnName: string,
): MetadataOpResult {
  const tr = resolveTable(ds, tableName)
  if ('error' in tr) return tr.error
  const { table } = tr

  const idx = table.columns.findIndex((c) => c.name === columnName)
  if (idx < 0) {
    return { ok: false, code: 'COLUMN_NOT_FOUND', msg: `列 ${columnName} 不存在`, fix: '请查 datatable.describe' }
  }

  const relImpact = (ds.tableRelations ?? []).filter(
    (r) =>
      (r.parentTable === tableName && r.parentField === columnName) ||
      (r.childTable === tableName && r.childField === columnName),
  )

  if (relImpact.length > 0) {
    return {
      ok: false,
      code: 'COLUMN_IN_USE',
      msg: `列 ${columnName} 被 ${relImpact.length} 条关系引用`,
      fix: '请先 relation.remove 相关关系后再删除此列',
    }
  }

  table.columns.splice(idx, 1)

  return {
    ok: true,
    data: {
      status: 'ok',
      tableName,
      columnName,
      remainingColumns: table.columns.length,
    },
    summary: `删除列 ${tableName}.${columnName}`,
  }
}

/** 设置表的 CrudApi 配置 */
export function metaSetTableApi(
  ds: IDataSetMetadata,
  tableName: string,
  api: CrudApi,
): MetadataOpResult {
  const tr = resolveTable(ds, tableName)
  if ('error' in tr) return tr.error

  tr.table.api = api

  const endpoints = Object.keys(api).filter(
    (k) => api[k as keyof CrudApi] !== undefined,
  )

  return {
    ok: true,
    data: { status: 'ok', tableName, endpoints },
    summary: `设置 ${tableName} API: ${endpoints.join(', ')}`,
  }
}

/** 写入内联静态行到 default view */
export function metaAddRows(
  ds: IDataSetMetadata,
  tableName: string,
  rows: IDataRow[],
): MetadataOpResult {
  const vr = resolveView(ds, tableName, 'default')
  if ('error' in vr) return vr.error

  vr.view.rows ??= []
  vr.view.rows.push(...rows)

  return {
    ok: true,
    data: {
      status: 'ok',
      tableName,
      addedRows: rows.length,
      totalRows: vr.view.rows.length,
    },
    summary: `写入 ${rows.length} 行到 ${tableName}`,
  }
}

// ═══════════════════════════════════════════════════════════
// DataView 操作
// ═══════════════════════════════════════════════════════════

/** 为表添加自定义 DataView */
export function metaAddView(
  ds: IDataSetMetadata,
  tableName: string,
  viewId: string,
): MetadataOpResult {
  const tr = resolveTable(ds, tableName)
  if ('error' in tr) return tr.error
  const { table } = tr

  if (viewId in table.views) {
    return { ok: false, code: 'VIEW_EXISTS', msg: `视图 ${viewId} 已存在`, fix: '请用 dataview.configure 配置' }
  }

  table.views[viewId] = {}

  return {
    ok: true,
    data: { tableName, viewId, viewCount: Object.keys(table.views).length },
    summary: `创建视图 ${tableName}:${viewId}`,
  }
}

/** 查看视图配置详情 */
export function metaDescribeView(
  ds: IDataSetMetadata,
  tableName: string,
  viewId?: string,
): MetadataOpResult {
  const tr = resolveTable(ds, tableName)
  if ('error' in tr) return tr.error

  const vid = viewId ?? 'default'
  const view = tr.table.views[vid]
  if (!view) {
    return { ok: false, code: 'VIEW_NOT_FOUND', msg: `视图 ${vid} 不存在`, fix: '请用 dataview.create 创建' }
  }

  return {
    ok: true,
    data: {
      tableName,
      viewId: vid,
      config: view,
      viewIds: Object.keys(tr.table.views),
    },
    summary: `视图 ${tableName}:${vid}`,
  }
}

/** 配置视图属性（autoLoad / pageSize / filterExpression 等） */
export function metaConfigureView(
  ds: IDataSetMetadata,
  tableName: string,
  viewId: string | undefined,
  config: Partial<IViewMetadata>,
): MetadataOpResult {
  const vr = resolveView(ds, tableName, viewId)
  if ('error' in vr) return vr.error

  Object.assign(vr.view, config)

  return {
    ok: true,
    data: { tableName, viewId: vr.vid, config: vr.view },
    summary: `配置视图 ${tableName}:${vr.vid}（${Object.keys(config).join(', ')}）`,
  }
}

/** 设置视图级聚合列 */
export function metaSetAggregates(
  ds: IDataSetMetadata,
  tableName: string,
  viewId: string | undefined,
  aggregates: Record<string, AggregateColumnConfig>,
): MetadataOpResult {
  const vr = resolveView(ds, tableName, viewId)
  if ('error' in vr) return vr.error

  // 校验聚合引用的字段存在
  const colNames = new Set(vr.table.columns.map((c) => c.name))
  const missingFields = Object.entries(aggregates)
    .map(([key, cfg]) => cfg.field ?? key)
    .filter((f) => !colNames.has(f))

  if (missingFields.length > 0) {
    return {
      ok: false,
      code: 'COLUMN_NOT_FOUND',
      msg: `聚合引用的字段不存在: ${missingFields.join(', ')}`,
      fix: '请先添加相关列',
    }
  }

  vr.view.aggregates = aggregates

  return {
    ok: true,
    data: {
      tableName,
      viewId: vr.vid,
      aggregates,
      aggregateCount: Object.keys(aggregates).length,
    },
    summary: `设置 ${Object.keys(aggregates).length} 个聚合列`,
  }
}

/** 设置视图树配置 */
export function metaSetTreeConfig(
  ds: IDataSetMetadata,
  tableName: string,
  viewId: string | undefined,
  treeConfig: TreeConfig,
): MetadataOpResult {
  const vr = resolveView(ds, tableName, viewId)
  if ('error' in vr) return vr.error

  // 检查树配置引用的字段存在
  const colNames = new Set(vr.table.columns.map((c) => c.name))
  const { idField, parentIdField } = treeConfig
  if (idField === undefined || !colNames.has(idField)) {
    return { ok: false, code: 'COLUMN_NOT_FOUND', msg: `idField "${idField ?? ''}" 不存在`, fix: '请检查列名' }
  }
  if (parentIdField === undefined || !colNames.has(parentIdField)) {
    return { ok: false, code: 'COLUMN_NOT_FOUND', msg: `parentIdField "${parentIdField ?? ''}" 不存在`, fix: '请检查列名' }
  }

  vr.view.treeConfig = treeConfig

  return {
    ok: true,
    data: { tableName, viewId: vr.vid, treeConfig },
    summary: `设置树配置 ${tableName}:${vr.vid}（mode=${treeConfig.treeMode ?? 'flat'}）`,
  }
}

// ═══════════════════════════════════════════════════════════
// Relation 操作
// ═══════════════════════════════════════════════════════════

export interface MetaRelationParams {
  parentTable: string
  childTable: string
  parentField: string
  childField: string
  relationName?: string
}

/** 添加 TableRelation */
export function metaAddRelation(
  ds: IDataSetMetadata,
  params: MetaRelationParams,
): MetadataOpResult {
  ds.tableRelations ??= []

  // 检查表是否存在
  const parentTable = ds.tables[params.parentTable]
  const childTable = ds.tables[params.childTable]
  if (!parentTable) {
    return { ok: false, code: 'TABLE_NOT_FOUND', msg: `父表 ${params.parentTable} 不存在`, fix: '请先 datatable.create' }
  }
  if (!childTable) {
    return { ok: false, code: 'TABLE_NOT_FOUND', msg: `子表 ${params.childTable} 不存在`, fix: '请先 datatable.create' }
  }

  // 检查字段是否存在
  const parentHasField = parentTable.columns.some((c) => c.name === params.parentField)
  if (!parentHasField) {
    return { ok: false, code: 'COLUMN_NOT_FOUND', msg: `父表字段 ${params.parentField} 不存在`, fix: '请查 datatable.describe' }
  }
  const childHasField = childTable.columns.some((c) => c.name === params.childField)
  if (!childHasField) {
    return { ok: false, code: 'COLUMN_NOT_FOUND', msg: `子表字段 ${params.childField} 不存在`, fix: '请查 datatable.describe' }
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
    return { ok: false, code: 'RELATION_EXISTS', msg: '相同关系已存在', fix: '跳过此步骤' }
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
    ok: true,
    data: {
      status: 'ok',
      parentTable: params.parentTable,
      childTable: params.childTable,
      parentField: params.parentField,
      childField: params.childField,
      relationCount: ds.tableRelations.length,
    },
    summary: `添加关系 ${params.parentTable}→${params.childTable}`,
  }
}

/** 删除 TableRelation（校验 viewDependency 引用） */
export function metaRemoveRelation(
  ds: IDataSetMetadata,
  parentTable: string,
  childTable: string,
): MetadataOpResult {
  ds.tableRelations ??= []

  const idx = ds.tableRelations.findIndex(
    (r) => r.parentTable === parentTable && r.childTable === childTable,
  )
  if (idx < 0) {
    return { ok: false, code: 'RELATION_NOT_FOUND', msg: '关系不存在', fix: '请查 relation.list' }
  }

  const depImpact = (ds.viewDependencies ?? []).filter(
    (d) => d.parentTable === parentTable && d.childTable === childTable,
  )
  if (depImpact.length > 0) {
    return {
      ok: false,
      code: 'RELATION_IN_USE',
      msg: `关系被 ${depImpact.length} 条 viewDependency 引用`,
      fix: '请先 dependency.remove 相关依赖后再删除此关系',
    }
  }

  ds.tableRelations.splice(idx, 1)

  return {
    ok: true,
    data: { status: 'ok', parentTable, childTable, relationCount: ds.tableRelations.length },
    summary: `删除关系 ${parentTable}→${childTable}`,
  }
}

/** 列出所有 tableRelations */
export function metaListRelations(ds: IDataSetMetadata): MetadataOpResult {
  const rels = ds.tableRelations ?? []
  return {
    ok: true,
    data: {
      relations: rels.map((r) => ({
        parentTable: r.parentTable,
        childTable: r.childTable,
        parentField: r.parentField,
        childField: r.childField,
        relationName: r.relationName,
      })),
      count: rels.length,
    },
    summary: `${rels.length} 条关系`,
  }
}

// ═══════════════════════════════════════════════════════════
// ViewDependency 操作
// ═══════════════════════════════════════════════════════════

export interface MetaDependencyParams {
  parentTable: string
  childTable: string
  dependencyType?: ViewDependency['dependencyType']
  autoLoad?: boolean
}

/** 添加 ViewDependency */
export function metaAddDependency(
  ds: IDataSetMetadata,
  params: MetaDependencyParams,
): MetadataOpResult {
  // 检查表存在
  if (!(params.parentTable in ds.tables)) {
    return { ok: false, code: 'TABLE_NOT_FOUND', msg: `父表 ${params.parentTable} 不存在`, fix: '请确认表名' }
  }
  if (!(params.childTable in ds.tables)) {
    return { ok: false, code: 'TABLE_NOT_FOUND', msg: `子表 ${params.childTable} 不存在`, fix: '请确认表名' }
  }

  // 检查底层 relation 是否存在
  const hasRelation = (ds.tableRelations ?? []).some(
    (r) => r.parentTable === params.parentTable && r.childTable === params.childTable,
  )
  if (!hasRelation) {
    return {
      ok: false,
      code: 'NO_RELATION',
      msg: `${params.parentTable}→${params.childTable} 没有 tableRelation`,
      fix: '请先 relation.add',
    }
  }

  ds.viewDependencies ??= []

  // 检查重复
  const dup = ds.viewDependencies.some(
    (d) => d.parentTable === params.parentTable && d.childTable === params.childTable,
  )
  if (dup) {
    return { ok: false, code: 'DEPENDENCY_EXISTS', msg: '相同依赖已存在', fix: '跳过此步骤' }
  }

  const dep: ViewDependency = {
    parentTable: params.parentTable,
    childTable: params.childTable,
    dependencyType: params.dependencyType ?? 'currentRow',
    ...(params.autoLoad !== undefined ? { autoLoad: params.autoLoad } : {}),
  }

  ds.viewDependencies.push(dep)

  return {
    ok: true,
    data: {
      status: 'ok',
      parentTable: params.parentTable,
      childTable: params.childTable,
      dependencyType: dep.dependencyType,
      dependencyCount: ds.viewDependencies.length,
    },
    summary: `添加依赖 ${params.parentTable}→${params.childTable}（${dep.dependencyType}）`,
  }
}

/** 删除 ViewDependency */
export function metaRemoveDependency(
  ds: IDataSetMetadata,
  parentTable: string,
  childTable: string,
): MetadataOpResult {
  ds.viewDependencies ??= []

  const idx = ds.viewDependencies.findIndex(
    (d) => d.parentTable === parentTable && d.childTable === childTable,
  )
  if (idx < 0) {
    return { ok: false, code: 'DEPENDENCY_NOT_FOUND', msg: '依赖不存在', fix: '请确认参数' }
  }

  ds.viewDependencies.splice(idx, 1)

  return {
    ok: true,
    data: {
      status: 'ok',
      parentTable,
      childTable,
      dependencyCount: ds.viewDependencies.length,
    },
    summary: `删除依赖 ${parentTable}→${childTable}`,
  }
}

// ═══════════════════════════════════════════════════════════
// Schema 操作（纯元数据校验部分）
// ═══════════════════════════════════════════════════════════

/** 检查 schema 是否可锁定（每表至少一个 PK） */
export function metaCheckSchemaLockable(ds: IDataSetMetadata): MetadataOpResult {
  const tables = Object.keys(ds.tables)
  if (tables.length === 0) {
    return { ok: false, code: 'EMPTY_SCHEMA', msg: '没有任何表，无法锁定', fix: '请先 datatable.create' }
  }

  const noPk = tables.filter((t) => !(ds.tables[t]?.columns.some((c) => c.isPrimaryKey) ?? false))
  if (noPk.length > 0) {
    return {
      ok: false,
      code: 'MISSING_PK',
      msg: `以下表缺少主键列: ${noPk.join(', ')}`,
      fix: '请 datatable.addColumns 添加 isPrimaryKey=true 的列',
    }
  }

  return {
    ok: true,
    data: {
      tableCount: tables.length,
      relationCount: (ds.tableRelations ?? []).length,
    },
    summary: `可锁定（${tables.length} 表, ${(ds.tableRelations ?? []).length} 关系）`,
  }
}
