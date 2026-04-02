/**
 * DataSet Domain — 24 个数据建模 action 的域注册
 *
 * 域 slot: DataSetSlot { dataset, schemaLocked, currentStep }
 * Guard 工厂: dsGuard() — 按需组合 dataset/blueprint/schema 检查
 * 底层操作: 委托给 spark-data/metadata-ops 的 meta* 纯函数
 */

import type {
  IStillSession,
  StillGuard,
  StillResult,
  StillDefinition,
  DomainProvider,
  IDataSetMetadata,
  ViewDependency,
} from './types'
import type { DataColumn, CrudApi, IDataRow, AggregateColumnConfig, TreeConfig, IViewMetadata } from '@spark-view/spark-data'
import {
  metaCreateDataSet,
  metaDescribeDataSet,
  metaValidateDataSet,
  metaExportDataSet,
  metaAddTable,
  metaDescribeTable,
  metaAddColumns,
  metaUpdateColumn,
  metaRemoveColumn,
  metaSetTableApi,
  metaAddRows,
  metaAddView,
  metaDescribeView,
  metaConfigureView,
  metaSetAggregates,
  metaSetTreeConfig,
  metaAddRelation,
  metaRemoveRelation,
  metaListRelations,
  metaAddDependency,
  metaRemoveDependency,
} from '@spark-view/spark-data'

// ═══════════════════════════════════════════════════════════
// DataSetSlot — 域 session 数据
// ═══════════════════════════════════════════════════════════

/** 6 步工作流步骤标识 */
export type DesignStep = '①' | '②' | '③' | '④' | '⑤' | '⑥'

/** DataSet 域在 session.domains['dataset'] 中的 slot */
export interface DataSetSlot {
  dataset: IDataSetMetadata | null
  schemaLocked: boolean
  currentStep: DesignStep
}

/** 类型安全的域 slot 访问器 */
export function getDataSetSlot(session: IStillSession): DataSetSlot {
  return session.domains['dataset'] as DataSetSlot
}

// ═══════════════════════════════════════════════════════════
// Guard 工厂
// ═══════════════════════════════════════════════════════════

interface DsGuardOptions {
  /** 是否需要 dataset 已初始化，默认 true */
  requireDataset?: boolean
  /** 是否需要 blueprint 已创建 */
  requireBlueprint?: boolean
  /** 是否需要 schema 未锁定 */
  requireSchemaUnlocked?: boolean
  /** 是否需要 schema 已锁定 */
  requireSchemaLocked?: boolean
}

/** 创建 DataSet 域的 Guard 函数 */
function dsGuard(checks: DsGuardOptions = {}): StillGuard {
  return (session: IStillSession): { code: string; msg: string } | null => {
    if (checks.requireBlueprint === true && session.blueprint === null) {
      return { code: 'NO_BLUEPRINT', msg: 'Blueprint 尚未创建，请先执行 blueprint.create' }
    }
    const slot = getDataSetSlot(session)
    if (checks.requireDataset !== false && slot.dataset === null) {
      return { code: 'NO_DATASET', msg: 'Dataset 尚未初始化，请先执行 dataset.init' }
    }
    if (checks.requireSchemaUnlocked === true && slot.schemaLocked) {
      return { code: 'SCHEMA_LOCKED', msg: 'Schema 已锁定，不允许此操作。如需修改请先 schema.unlock' }
    }
    if (checks.requireSchemaLocked === true && !slot.schemaLocked) {
      return { code: 'SCHEMA_NOT_LOCKED', msg: 'Schema 尚未锁定。视图/API/依赖配置需在 schema.lock 之后执行' }
    }
    return null
  }
}

/** 无 dataset 要求的 guard（仅 blueprint） */
const guardBlueprintOnly = dsGuard({ requireDataset: false, requireBlueprint: true })

/** 标准 guard：需 blueprint + dataset + schema 未锁定 */
const guardSchemaUnlocked = dsGuard({ requireBlueprint: true, requireSchemaUnlocked: true })

/** 需 blueprint + dataset + schema 已锁定 */
const guardSchemaLocked = dsGuard({ requireBlueprint: true, requireSchemaLocked: true })

/** 需 blueprint + dataset */
const guardBlueprintAndDataset = dsGuard({ requireBlueprint: true })

/** 仅需 dataset（默认行为） */
const guardDatasetOnly = dsGuard({})

/** 无任何要求（用于 describe 类 action） */
const guardNone = dsGuard({ requireDataset: false })

// ═══════════════════════════════════════════════════════════
// helper: 从 session 提取 dataset 或返回错误
// ═══════════════════════════════════════════════════════════

function requireDataset(session: IStillSession): { ds: IDataSetMetadata } | { error: StillResult } {
  const slot = getDataSetSlot(session)
  if (slot.dataset === null) {
    return { error: { ok: false, code: 'NO_DATASET', msg: 'Dataset 未初始化', fix: '请先执行 dataset.init' } }
  }
  return { ds: slot.dataset }
}

// ═══════════════════════════════════════════════════════════
// dataset.* (5)
// ═══════════════════════════════════════════════════════════

// ─── dataset.init ──────────────────────────────────────────

interface DatasetInitParams { dataSetName: string }

const datasetInit: StillDefinition<DatasetInitParams, unknown> = {
  action: 'dataset.init',
  type: 'request',
  description: '创建空 IDataSetMetadata（设 dataSetName）',
  guard: guardBlueprintOnly,
  paramsSchema: { dataSetName: 'string — DataSet 名称' },
  example: { dataSetName: 'OrderSystem' },
  validate: (params) => {
    if (!params.dataSetName || typeof params.dataSetName !== 'string') return '缺少 dataSetName'
    return null
  },
  execute: (session, params): StillResult => {
    const slot = getDataSetSlot(session)
    if (slot.dataset !== null) {
      return { ok: false, code: 'DATASET_EXISTS', msg: 'Dataset 已存在', fix: '如需重建请先 dataset.reset' }
    }
    slot.dataset = metaCreateDataSet(params.dataSetName)
    slot.currentStep = '④'
    return {
      ok: true,
      data: { status: 'ok', dataSetName: params.dataSetName, schemaVersion: 1, tables: {}, tableRelations: [], viewDependencies: [] },
      summary: `创建 DataSet: ${params.dataSetName}`,
    }
  },
}

// ─── dataset.describe ──────────────────────────────────────

const datasetDescribe: StillDefinition<Record<string, never>, unknown> = {
  action: 'dataset.describe',
  type: 'describe',
  description: '返回当前 dataset 结构摘要',
  guard: guardDatasetOnly,
  paramsSchema: {},
  example: {},
  validate: () => null,
  execute: (session): StillResult => {
    const r = requireDataset(session)
    if ('error' in r) return r.error
    const slot = getDataSetSlot(session)
    return metaDescribeDataSet(r.ds, { schemaLocked: slot.schemaLocked })
  },
}

// ─── dataset.validate ──────────────────────────────────────

const datasetValidate: StillDefinition<Record<string, never>, unknown> = {
  action: 'dataset.validate',
  type: 'request',
  description: '全量结构校验，返回 issues[]',
  guard: guardDatasetOnly,
  paramsSchema: {},
  example: {},
  validate: () => null,
  execute: (session): StillResult => {
    const r = requireDataset(session)
    if ('error' in r) return r.error
    const slot = getDataSetSlot(session)
    return metaValidateDataSet(r.ds, { schemaLocked: slot.schemaLocked })
  },
}

// ─── dataset.export ────────────────────────────────────────

const datasetExport: StillDefinition<Record<string, never>, unknown> = {
  action: 'dataset.export',
  type: 'request',
  description: '导出完整 IDataSetMetadata 快照',
  guard: guardBlueprintAndDataset,
  paramsSchema: {},
  example: {},
  validate: () => null,
  execute: (session): StillResult => {
    const r = requireDataset(session)
    if ('error' in r) return r.error
    return metaExportDataSet(r.ds)
  },
}

// ─── dataset.reset ─────────────────────────────────────────

const datasetReset: StillDefinition<Record<string, never>, unknown> = {
  action: 'dataset.reset',
  type: 'request',
  description: '清空重来（需前端二次确认）',
  guard: guardNone,
  paramsSchema: {},
  example: {},
  validate: () => null,
  execute: (session): StillResult => {
    const slot = getDataSetSlot(session)
    slot.dataset = null
    slot.schemaLocked = false
    slot.currentStep = '①'
    session.blueprint = null
    session.patchLog = []
    return {
      ok: true,
      data: { status: 'ok', hint: '已重置，回到初始状态' },
      summary: '会话已重置',
    }
  },
}

// ═══════════════════════════════════════════════════════════
// datatable.* (7)
// ═══════════════════════════════════════════════════════════

// ─── datatable.create ──────────────────────────────────────

interface DatatableCreateParams { tableName: string; columns: DataColumn[] }

const datatableCreate: StillDefinition<DatatableCreateParams, unknown> = {
  action: 'datatable.create',
  type: 'request',
  description: '添加一张表（tableName + columns）',
  guard: guardSchemaUnlocked,
  paramsSchema: { tableName: 'string — 表名', columns: 'DataColumn[] — 列定义（name/type/isPrimaryKey/label 等）' },
  example: {
    tableName: 'Orders',
    columns: [
      { name: 'id', type: 'number', isPrimaryKey: true, label: '订单ID' },
      { name: 'customerId', type: 'string', label: '客户ID' },
    ],
  },
  validate: (params) => {
    if (!params.tableName || typeof params.tableName !== 'string') return '缺少 tableName'
    if (!Array.isArray(params.columns) || params.columns.length === 0) return '缺少 columns'
    for (const col of params.columns) {
      if (!col.name || typeof col.name !== 'string') return `列缺少 name`
      if (col.type.length === 0) return `列 ${col.name} 缺少 type`
    }
    return null
  },
  execute: (session, params): StillResult => {
    const r = requireDataset(session)
    if ('error' in r) return r.error
    return metaAddTable(r.ds, params.tableName, params.columns)
  },
}

// ─── datatable.describe ────────────────────────────────────

interface DatatableDescribeParams { tableName: string }

const datatableDescribe: StillDefinition<DatatableDescribeParams, unknown> = {
  action: 'datatable.describe',
  type: 'describe',
  description: '返回指定表详情（列清单/关系/API/视图数）',
  guard: guardDatasetOnly,
  paramsSchema: { tableName: 'string — 表名' },
  example: { tableName: 'Orders' },
  validate: (params) => {
    if (!params.tableName || typeof params.tableName !== 'string') return '缺少 tableName'
    return null
  },
  execute: (session, params): StillResult => {
    const r = requireDataset(session)
    if ('error' in r) return r.error
    return metaDescribeTable(r.ds, params.tableName)
  },
}

// ─── datatable.addColumns ──────────────────────────────────

interface AddColumnsParams { tableName: string; columns: DataColumn[] }

const datatableAddColumns: StillDefinition<AddColumnsParams, unknown> = {
  action: 'datatable.addColumns',
  type: 'request',
  description: '向已有表追加列（同名列不覆盖）',
  guard: guardSchemaUnlocked,
  paramsSchema: { tableName: 'string', columns: 'DataColumn[] — 新增的列定义' },
  example: { tableName: 'Users', columns: [{ name: 'email', type: 'string', label: '邮箱' }] },
  validate: (params) => {
    if (!params.tableName) return '缺少 tableName'
    if (!Array.isArray(params.columns) || params.columns.length === 0) return '缺少 columns'
    return null
  },
  execute: (session, params): StillResult => {
    const r = requireDataset(session)
    if ('error' in r) return r.error
    return metaAddColumns(r.ds, params.tableName, params.columns)
  },
}

// ─── datatable.updateColumn ────────────────────────────────

interface UpdateColumnParams { tableName: string; columnName: string; updates: Partial<DataColumn> }

const datatableUpdateColumn: StillDefinition<UpdateColumnParams, unknown> = {
  action: 'datatable.updateColumn',
  type: 'request',
  description: '修改单列属性（type/label/computeExpression 等）',
  guard: guardSchemaUnlocked,
  paramsSchema: {
    tableName: 'string',
    columnName: 'string — 要修改的列名',
    updates: 'Partial<DataColumn> — 要修改的字段',
  },
  example: { tableName: 'Orders', columnName: 'status', updates: { label: '订单状态', type: 'string' } },
  validate: (params) => {
    if (!params.tableName) return '缺少 tableName'
    if (!params.columnName) return '缺少 columnName'
    if (Object.keys(params.updates).length === 0) return '缺少 updates'
    return null
  },
  execute: (session, params): StillResult => {
    const r = requireDataset(session)
    if ('error' in r) return r.error
    return metaUpdateColumn(r.ds, params.tableName, params.columnName, params.updates)
  },
}

// ─── datatable.removeColumn ────────────────────────────────

interface RemoveColumnParams { tableName: string; columnName: string }

const datatableRemoveColumn: StillDefinition<RemoveColumnParams, unknown> = {
  action: 'datatable.removeColumn',
  type: 'request',
  description: '删除列（校验关系/视图引用，返回 impact）',
  guard: guardSchemaUnlocked,
  paramsSchema: { tableName: 'string', columnName: 'string — 要删除的列名' },
  example: { tableName: 'Users', columnName: 'tempField' },
  validate: (params) => {
    if (!params.tableName) return '缺少 tableName'
    if (!params.columnName) return '缺少 columnName'
    return null
  },
  execute: (session, params): StillResult => {
    const r = requireDataset(session)
    if ('error' in r) return r.error
    return metaRemoveColumn(r.ds, params.tableName, params.columnName)
  },
}

// ─── datatable.setApi ──────────────────────────────────────

interface SetApiParams { tableName: string; api: CrudApi }

const datatableSetApi: StillDefinition<SetApiParams, unknown> = {
  action: 'datatable.setApi',
  type: 'request',
  description: '设置表的 CrudApi 配置',
  guard: guardSchemaLocked,
  paramsSchema: {
    tableName: 'string',
    api: 'CrudApi — { list?, create?, update?, delete?, ... }',
  },
  example: {
    tableName: 'Orders',
    api: { list: { url: '/api/orders', method: 'GET' }, create: { url: '/api/orders', method: 'POST' } },
  },
  validate: (params) => {
    if (!params.tableName) return '缺少 tableName'
    if (Object.keys(params.api).length === 0) return '缺少 api'
    return null
  },
  execute: (session, params): StillResult => {
    const r = requireDataset(session)
    if ('error' in r) return r.error
    return metaSetTableApi(r.ds, params.tableName, params.api)
  },
}

// ─── datatable.addRows ─────────────────────────────────────

interface AddRowsParams { tableName: string; rows: IDataRow[] }

const datatableAddRows: StillDefinition<AddRowsParams, unknown> = {
  action: 'datatable.addRows',
  type: 'request',
  description: '写入内联静态行（枚举/配置表用）',
  guard: guardBlueprintAndDataset,
  paramsSchema: {
    tableName: 'string',
    rows: 'Array<Record<string, unknown>> — 行数据对象数组',
  },
  example: {
    tableName: 'Statuses',
    rows: [{ id: '1', label: '待审批' }, { id: '2', label: '已通过' }],
  },
  validate: (params) => {
    if (!params.tableName) return '缺少 tableName'
    if (!Array.isArray(params.rows) || params.rows.length === 0) return '缺少 rows'
    return null
  },
  execute: (session, params): StillResult => {
    const r = requireDataset(session)
    if ('error' in r) return r.error
    return metaAddRows(r.ds, params.tableName, params.rows)
  },
}

// ═══════════════════════════════════════════════════════════
// relation.* (3)
// ═══════════════════════════════════════════════════════════

// ─── relation.add ──────────────────────────────────────────

interface RelationAddParams {
  parentTable: string
  childTable: string
  parentField: string
  childField: string
  relationName?: string
}

const relationAdd: StillDefinition<RelationAddParams, unknown> = {
  action: 'relation.add',
  type: 'request',
  description: '添加 TableRelation',
  guard: guardSchemaUnlocked,
  paramsSchema: {
    parentTable: 'string', childTable: 'string',
    parentField: 'string', childField: 'string',
    relationName: 'string? — 可选关系名',
  },
  example: { parentTable: 'Orders', childTable: 'OrderItems', parentField: 'id', childField: 'orderId' },
  validate: (params) => {
    if (!params.parentTable) return '缺少 parentTable'
    if (!params.childTable) return '缺少 childTable'
    if (!params.parentField) return '缺少 parentField'
    if (!params.childField) return '缺少 childField'
    return null
  },
  execute: (session, params): StillResult => {
    const r = requireDataset(session)
    if ('error' in r) return r.error
    return metaAddRelation(r.ds, params)
  },
}

// ─── relation.remove ───────────────────────────────────────

interface RelationRemoveParams { parentTable: string; childTable: string }

const relationRemove: StillDefinition<RelationRemoveParams, unknown> = {
  action: 'relation.remove',
  type: 'request',
  description: '删除 TableRelation（校验 viewDependency 引用）',
  guard: guardSchemaUnlocked,
  paramsSchema: { parentTable: 'string', childTable: 'string' },
  example: { parentTable: 'Orders', childTable: 'OrderItems' },
  validate: (params) => {
    if (!params.parentTable) return '缺少 parentTable'
    if (!params.childTable) return '缺少 childTable'
    return null
  },
  execute: (session, params): StillResult => {
    const r = requireDataset(session)
    if ('error' in r) return r.error
    return metaRemoveRelation(r.ds, params.parentTable, params.childTable)
  },
}

// ─── relation.list ─────────────────────────────────────────

const relationList: StillDefinition<Record<string, never>, unknown> = {
  action: 'relation.list',
  type: 'describe',
  description: '列出所有 tableRelations',
  guard: guardDatasetOnly,
  paramsSchema: {},
  example: {},
  validate: () => null,
  execute: (session): StillResult => {
    const r = requireDataset(session)
    if ('error' in r) return r.error
    return metaListRelations(r.ds)
  },
}

// ═══════════════════════════════════════════════════════════
// schema.* (2)
// ═══════════════════════════════════════════════════════════

// ─── schema.lock ───────────────────────────────────────────

const schemaLock: StillDefinition<Record<string, never>, unknown> = {
  action: 'schema.lock',
  type: 'request',
  description: '锁定结构（禁止增删表/列/关系，允许 dataview / dependency / api 配置）',
  guard: guardSchemaUnlocked,
  paramsSchema: {},
  example: {},
  validate: () => null,
  execute: (session): StillResult => {
    const r = requireDataset(session)
    if ('error' in r) return r.error
    const ds = r.ds
    const tables = Object.keys(ds.tables)
    if (tables.length === 0) {
      return { ok: false, code: 'EMPTY_SCHEMA', msg: '没有任何表，无法锁定', fix: '请先 datatable.create' }
    }
    const noPk = tables.filter((t) => !(ds.tables[t]?.columns.some((c) => c.isPrimaryKey) ?? false))
    if (noPk.length > 0) {
      return {
        ok: false, code: 'MISSING_PK',
        msg: `以下表缺少主键列: ${noPk.join(', ')}`,
        fix: '请 datatable.addColumns 添加 isPrimaryKey=true 的列',
      }
    }
    const slot = getDataSetSlot(session)
    slot.schemaLocked = true
    return {
      ok: true,
      data: { schemaLocked: true, tableCount: tables.length, relationCount: (ds.tableRelations ?? []).length },
      summary: `结构已锁定（${tables.length} 表, ${(ds.tableRelations ?? []).length} 关系）`,
    }
  },
}

// ─── schema.unlock ─────────────────────────────────────────

interface SchemaUnlockParams { reason?: string }

const schemaUnlock: StillDefinition<SchemaUnlockParams, unknown> = {
  action: 'schema.unlock',
  type: 'request',
  description: '解锁结构（需说明原因，允许修改表/列/关系）',
  guard: guardSchemaLocked,
  paramsSchema: { reason: 'string? — 解锁原因' },
  example: { reason: '需要添加新字段' },
  validate: () => null,
  execute: (session, params): StillResult => {
    const slot = getDataSetSlot(session)
    slot.schemaLocked = false
    return {
      ok: true,
      data: { schemaLocked: false, reason: params.reason ?? '未说明' },
      summary: `结构已解锁${params.reason ? `（原因: ${params.reason}）` : ''}`,
    }
  },
}

// ═══════════════════════════════════════════════════════════
// dataview.* (5)
// ═══════════════════════════════════════════════════════════

// ─── dataview.create ───────────────────────────────────────

interface DataviewCreateParams { tableName: string; viewId: string }

const dataviewCreate: StillDefinition<DataviewCreateParams, unknown> = {
  action: 'dataview.create',
  type: 'request',
  description: '为表添加自定义 DataView（default 视图在建表时已自动创建）',
  guard: guardSchemaLocked,
  paramsSchema: { tableName: 'string', viewId: 'string' },
  example: { tableName: 'Orders', viewId: 'grid' },
  validate: (params) => {
    if (!params.tableName) return '缺少 tableName'
    if (!params.viewId) return '缺少 viewId'
    return null
  },
  execute: (session, params): StillResult => {
    const r = requireDataset(session)
    if ('error' in r) return r.error
    return metaAddView(r.ds, params.tableName, params.viewId)
  },
}

// ─── dataview.describe ─────────────────────────────────────

interface DataviewDescribeParams { tableName: string; viewId?: string }

const dataviewDescribe: StillDefinition<DataviewDescribeParams, unknown> = {
  action: 'dataview.describe',
  type: 'describe',
  description: '查看视图配置详情',
  guard: guardDatasetOnly,
  paramsSchema: { tableName: 'string', viewId: 'string? — 默认 default' },
  example: { tableName: 'Orders' },
  validate: (params) => {
    if (!params.tableName) return '缺少 tableName'
    return null
  },
  execute: (session, params): StillResult => {
    const r = requireDataset(session)
    if ('error' in r) return r.error
    return metaDescribeView(r.ds, params.tableName, params.viewId)
  },
}

// ─── dataview.configure ────────────────────────────────────

interface DataviewConfigureParams {
  tableName: string
  viewId?: string
  config?: Partial<IViewMetadata>
  [key: string]: unknown
}

/** 从扁平 params 中提取视图配置属性 */
function extractViewConfig(params: DataviewConfigureParams): Partial<IViewMetadata> | null {
  if (params.config && typeof params.config === 'object') {
    return params.config
  }
  const structuralKeys = new Set(['tableName', 'viewId', 'config'])
  const extracted: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params)) {
    if (!structuralKeys.has(k)) {
      extracted[k] = v
    }
  }
  return Object.keys(extracted).length > 0 ? (extracted as Partial<IViewMetadata>) : null
}

const dataviewConfigure: StillDefinition<DataviewConfigureParams, unknown> = {
  action: 'dataview.configure',
  type: 'request',
  description: '配置视图属性（autoLoad / autoCurrentFirst / pageSize / rows 等）',
  guard: guardSchemaLocked,
  paramsSchema: {
    tableName: 'string', viewId: 'string? — 默认 default',
    autoLoad: 'boolean? — 自动加载数据', autoCurrentFirst: 'boolean? — 自动选中首行',
    pageSize: 'number? — 每页行数', filterExpression: 'string?', sortExpression: 'string?',
  },
  example: { tableName: 'Orders', autoLoad: true, autoCurrentFirst: true, pageSize: 20 },
  validate: (params) => {
    if (!params.tableName) return '缺少 tableName'
    const config = extractViewConfig(params)
    if (!config) return '缺少配置属性（autoLoad / pageSize / autoCurrentFirst 等）'
    return null
  },
  execute: (session, params): StillResult => {
    const r = requireDataset(session)
    if ('error' in r) return r.error
    const config = extractViewConfig(params)
    if (!config) return { ok: false, code: 'INVALID_PARAMS', msg: '缺少配置属性', fix: '提供 autoLoad / pageSize 等属性' }
    return metaConfigureView(r.ds, params.tableName, params.viewId, config)
  },
}

// ─── dataview.setAggregates ────────────────────────────────

interface SetAggregatesParams {
  tableName: string
  viewId?: string
  aggregates: Record<string, AggregateColumnConfig>
}

const dataviewSetAggregates: StillDefinition<SetAggregatesParams, unknown> = {
  action: 'dataview.setAggregates',
  type: 'request',
  description: '设置视图级聚合列',
  guard: guardSchemaLocked,
  paramsSchema: {
    tableName: 'string', viewId: 'string? — 默认 default',
    aggregates: 'Record<string, AggregateColumnConfig> — 如 { price: { type: "sum" } }',
  },
  example: { tableName: 'Orders', aggregates: { price: { type: 'sum' }, score: { type: 'avg' } } },
  validate: (params) => {
    if (!params.tableName) return '缺少 tableName'
    return null
  },
  execute: (session, params): StillResult => {
    const r = requireDataset(session)
    if ('error' in r) return r.error
    return metaSetAggregates(r.ds, params.tableName, params.viewId, params.aggregates)
  },
}

// ─── dataview.setTreeConfig ────────────────────────────────

interface SetTreeConfigParams {
  tableName: string
  viewId?: string
  treeConfig: TreeConfig
}

const dataviewSetTreeConfig: StillDefinition<SetTreeConfigParams, unknown> = {
  action: 'dataview.setTreeConfig',
  type: 'request',
  description: '设置视图树配置（treeMode / idField / parentIdField / textField）',
  guard: guardSchemaLocked,
  paramsSchema: {
    tableName: 'string', viewId: 'string? — 默认 default',
    treeConfig: 'TreeConfig — { idField, parentIdField, textField, treeMode? }',
  },
  example: {
    tableName: 'Departments',
    treeConfig: { idField: 'id', parentIdField: 'parentId', textField: 'name', treeMode: 'nested' },
  },
  validate: (params) => {
    if (!params.tableName) return '缺少 tableName'
    if (!params.treeConfig.idField) return 'treeConfig 缺少 idField'
    if (!params.treeConfig.parentIdField) return 'treeConfig 缺少 parentIdField'
    return null
  },
  execute: (session, params): StillResult => {
    const r = requireDataset(session)
    if ('error' in r) return r.error
    return metaSetTreeConfig(r.ds, params.tableName, params.viewId, params.treeConfig)
  },
}

// ═══════════════════════════════════════════════════════════
// dependency.* (2)
// ═══════════════════════════════════════════════════════════

// ─── dependency.add ────────────────────────────────────────

interface DependencyAddParams {
  parentTable: string
  childTable: string
  parentView?: string
  childView?: string
  dependencyType?: ViewDependency['dependencyType']
  autoLoad?: boolean
}

const dependencyAdd: StillDefinition<DependencyAddParams, unknown> = {
  action: 'dependency.add',
  type: 'request',
  description: '添加 ViewDependency（级联类型默认 currentRow）',
  guard: guardSchemaLocked,
  paramsSchema: {
    parentTable: 'string', childTable: 'string',
    parentView: 'string? — 默认 default', childView: 'string? — 默认 default',
    dependencyType: '"currentRow" | "selectedRows" | "allRows" | "pagedRows" — 默认 currentRow',
    autoLoad: 'boolean? — 默认 true',
  },
  example: { parentTable: 'Orders', childTable: 'OrderItems', dependencyType: 'currentRow' },
  validate: (params) => {
    if (!params.parentTable) return '缺少 parentTable'
    if (!params.childTable) return '缺少 childTable'
    const valid = ['currentRow', 'selectedRows', 'allRows', 'pagedRows']
    if (params.dependencyType !== undefined && !valid.includes(params.dependencyType)) {
      return `dependencyType 必须是 ${valid.join('|')}`
    }
    return null
  },
  execute: (session, params): StillResult => {
    const r = requireDataset(session)
    if ('error' in r) return r.error
    return metaAddDependency(r.ds, params)
  },
}

// ─── dependency.remove ─────────────────────────────────────

interface DependencyRemoveParams {
  parentTable: string
  childTable: string
  parentView?: string
  childView?: string
}

const dependencyRemove: StillDefinition<DependencyRemoveParams, unknown> = {
  action: 'dependency.remove',
  type: 'request',
  description: '删除 ViewDependency',
  guard: guardSchemaLocked,
  paramsSchema: {
    parentTable: 'string', childTable: 'string',
    parentView: 'string? — 默认 default', childView: 'string? — 默认 default',
  },
  example: { parentTable: 'Orders', childTable: 'OrderItems' },
  validate: (params) => {
    if (!params.parentTable) return '缺少 parentTable'
    if (!params.childTable) return '缺少 childTable'
    return null
  },
  execute: (session, params): StillResult => {
    const r = requireDataset(session)
    if ('error' in r) return r.error
    return metaRemoveDependency(r.ds, params.parentTable, params.childTable)
  },
}

// ═══════════════════════════════════════════════════════════
// Domain Provider
// ═══════════════════════════════════════════════════════════

const allDatasetStills: StillDefinition[] = [
  // dataset (5)
  datasetInit, datasetDescribe, datasetValidate, datasetExport, datasetReset,
  // datatable (7)
  datatableCreate, datatableDescribe, datatableAddColumns, datatableUpdateColumn,
  datatableRemoveColumn, datatableSetApi, datatableAddRows,
  // relation (3)
  relationAdd, relationRemove, relationList,
  // schema (2)
  schemaLock, schemaUnlock,
  // dataview (5)
  dataviewCreate, dataviewDescribe, dataviewConfigure, dataviewSetAggregates, dataviewSetTreeConfig,
  // dependency (2)
  dependencyAdd, dependencyRemove,
] as unknown as StillDefinition[]

/** DataSet 域 — 24 个数据建模 action */
export const datasetDomain: DomainProvider = {
  name: 'dataset',
  stills: allDatasetStills,
  createSlot: (): DataSetSlot => ({
    dataset: null,
    schemaLocked: false,
    currentStep: '①',
  }),
}

// ═══════════════════════════════════════════════════════════
// 按名导出（兼容直接 import）
// ═══════════════════════════════════════════════════════════

export {
  datasetInit, datasetDescribe, datasetValidate, datasetExport, datasetReset,
  datatableCreate, datatableDescribe, datatableAddColumns, datatableUpdateColumn,
  datatableRemoveColumn, datatableSetApi, datatableAddRows,
  relationAdd, relationRemove, relationList,
  schemaLock, schemaUnlock,
  dataviewCreate, dataviewDescribe, dataviewConfigure, dataviewSetAggregates, dataviewSetTreeConfig,
  dependencyAdd, dependencyRemove,
}
