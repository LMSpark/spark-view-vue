/**
 * DataSet Domain
 *
 * 这个文件只负责三类事情：
 * 1. 定义 dataset 域在 still session 中的状态槽位；
 * 2. 按 namespace 注册数据建模 action；
 * 3. 将真正的数据建模变更委托给 spark-data 提供的 meta* 包装层。
 *
 * meta* 对外仍然收发 IDataSetMetadata，
 * 对内会投影到 DataSet/DataTable/DataView 运行时对象并直接复用 dataset-ops。
 * 这里本身不直接操作运行时实例，也不承担 UI 交互逻辑。
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
// 域状态与通用帮助函数
// ═══════════════════════════════════════════════════════════

/**
 * 6 步设计流程序号。
 * 本文件只负责保存当前位置，不重新定义各步骤的业务含义。
 */
export type DesignStep = '①' | '②' | '③' | '④' | '⑤' | '⑥'

/** DataSet 域在 session.domains['dataset'] 中保存的槽位结构。 */
export interface DataSetSlot {
  /** 当前正在编辑的元数据快照；未初始化时为 null。 */
  dataset: IDataSetMetadata | null
  /** true 表示进入“结构冻结”阶段，只允许改视图/API/依赖等后置配置。 */
  schemaLocked: boolean
  /** 供外层 still 工作流 UI 展示当前阶段。 */
  currentStep: DesignStep
}

/** 类型安全的域 slot 访问器。 */
export function getDataSetSlot(session: IStillSession): DataSetSlot {
  return session.domains['dataset'] as DataSetSlot
}

/**
 * 统一的初始 slot 工厂。
 * createSlot 与 dataset.reset 共用它，避免默认值出现双份定义后漂移。
 */
function createDataSetSlot(): DataSetSlot {
  return {
    dataset: null,
    schemaLocked: false,
    currentStep: '①',
  }
}

/** validate 回调必须返回字符串，不要因为空参直接抛异常。 */
function missingParam(name: string): string {
  return `缺少 ${name}`
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isNonEmptyArray<T>(value: unknown): value is T[] {
  return Array.isArray(value) && value.length > 0
}

function isNonEmptyRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.keys(value).length > 0
}

// ═══════════════════════════════════════════════════════════
// Guard 工厂与会话前置约束
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

/**
 * 创建 DataSet 域 guard。
 *
 * still action 的职责是“声明前置条件”，不是在 execute 中到处散落 if/else。
 * 这里把 blueprint、dataset、schema 状态组合成可复用的 guard 片段。
 */
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

/** 仅要求 blueprint 存在；dataset.init 用这个 guard，因为它本身就是创建 dataset 的动作。 */
const guardBlueprintOnly = dsGuard({ requireDataset: false, requireBlueprint: true })
const guardBlueprintOnlyDesc = '需要 blueprint 已创建'

/** 结构编辑类动作：要求 blueprint、dataset 都已存在，且 schema 仍可编辑。 */
const guardSchemaUnlocked = dsGuard({ requireBlueprint: true, requireSchemaUnlocked: true })
const guardSchemaUnlockedDesc = '需要 blueprint + dataset 已创建，且 schema 未锁定'

/** 后置配置类动作：要求 schema 已冻结，避免视图/API 配置跟结构同时漂移。 */
const guardSchemaLocked = dsGuard({ requireBlueprint: true, requireSchemaLocked: true })
const guardSchemaLockedDesc = '需要 blueprint + dataset 已创建，且 schema 已锁定'

/** 既要求 blueprint，也要求 dataset，但不关心 schema 是否已锁定。 */
const guardBlueprintAndDataset = dsGuard({ requireBlueprint: true })
const guardBlueprintAndDatasetDesc = '需要 blueprint + dataset 已创建'

/** 仅要求 dataset 存在。 */
const guardDatasetOnly = dsGuard({})
const guardDatasetOnlyDesc = '需要 dataset 已创建'

/** 完全不设前置条件，适合 reset 这类“从任何状态都可执行”的动作。 */
const guardNone = dsGuard({ requireDataset: false })

// ═══════════════════════════════════════════════════════════
// 统一读取当前 dataset 元数据
// ═══════════════════════════════════════════════════════════

/**
 * 从 session 读取 dataset 元数据。
 * 失败时直接返回 StillResult，方便 execute 里早返回并保持错误结构一致。
 */
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
  guardDescription: guardBlueprintOnlyDesc,
  paramsSchema: { dataSetName: 'string — DataSet 名称' },
  example: { dataSetName: 'OrderSystem' },
  validate: (params) => {
    if (!isNonEmptyString(params.dataSetName)) return missingParam('dataSetName')
    return null
  },
  execute: (session, params): StillResult => {
    const slot = getDataSetSlot(session)
    if (slot.dataset !== null) {
      return { ok: false, code: 'DATASET_EXISTS', msg: 'Dataset 已存在', fix: '如需重建请先 dataset.reset' }
    }
    slot.dataset = metaCreateDataSet(params.dataSetName)
    // 与外层设计工作流保持一致：dataset 初始化完成后进入结构设计阶段。
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
  guardDescription: guardDatasetOnlyDesc,
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
  guardDescription: guardDatasetOnlyDesc,
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
  guardDescription: guardBlueprintAndDatasetDesc,
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
    Object.assign(slot, createDataSetSlot())
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
  guardDescription: guardSchemaUnlockedDesc,
  paramsSchema: { tableName: 'string — 表名', columns: 'DataColumn[] — 列定义（name/type/isPrimaryKey/label 等）' },
  example: {
    tableName: 'Orders',
    columns: [
      { name: 'id', type: 'number', isPrimaryKey: true, label: '订单ID' },
      { name: 'customerId', type: 'string', label: '客户ID' },
    ],
  },
  validate: (params) => {
    if (!isNonEmptyString(params.tableName)) return missingParam('tableName')
    if (!isNonEmptyArray<DataColumn>(params.columns)) return missingParam('columns')
    for (const column of params.columns) {
      if (!isNonEmptyString(column.name)) return '列缺少 name'
      if (!isNonEmptyString(column.type)) return `列 ${column.name} 缺少 type`
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
  guardDescription: guardDatasetOnlyDesc,
  paramsSchema: { tableName: 'string — 表名' },
  example: { tableName: 'Orders' },
  validate: (params) => {
    if (!isNonEmptyString(params.tableName)) return missingParam('tableName')
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
  guardDescription: guardSchemaUnlockedDesc,
  paramsSchema: { tableName: 'string', columns: 'DataColumn[] — 新增的列定义' },
  example: { tableName: 'Users', columns: [{ name: 'email', type: 'string', label: '邮箱' }] },
  validate: (params) => {
    if (!isNonEmptyString(params.tableName)) return missingParam('tableName')
    if (!isNonEmptyArray<DataColumn>(params.columns)) return missingParam('columns')
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
  guardDescription: guardSchemaUnlockedDesc,
  paramsSchema: {
    tableName: 'string',
    columnName: 'string — 要修改的列名',
    updates: 'Partial<DataColumn> — 要修改的字段',
  },
  example: { tableName: 'Orders', columnName: 'status', updates: { label: '订单状态', type: 'string' } },
  validate: (params) => {
    if (!isNonEmptyString(params.tableName)) return missingParam('tableName')
    if (!isNonEmptyString(params.columnName)) return missingParam('columnName')
    if (!isNonEmptyRecord(params.updates)) return missingParam('updates')
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
  guardDescription: guardSchemaUnlockedDesc,
  paramsSchema: { tableName: 'string', columnName: 'string — 要删除的列名' },
  example: { tableName: 'Users', columnName: 'tempField' },
  validate: (params) => {
    if (!isNonEmptyString(params.tableName)) return missingParam('tableName')
    if (!isNonEmptyString(params.columnName)) return missingParam('columnName')
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
  guardDescription: guardSchemaLockedDesc,
  paramsSchema: {
    tableName: 'string',
    api: 'CrudApi — { list?, create?, update?, delete?, ... }',
  },
  example: {
    tableName: 'Orders',
    api: { list: { url: '/api/orders', method: 'GET' }, create: { url: '/api/orders', method: 'POST' } },
  },
  validate: (params) => {
    if (!isNonEmptyString(params.tableName)) return missingParam('tableName')
    if (!isNonEmptyRecord(params.api)) return missingParam('api')
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
  guardDescription: guardBlueprintAndDatasetDesc,
  paramsSchema: {
    tableName: 'string',
    rows: 'Array<Record<string, unknown>> — 行数据对象数组',
  },
  example: {
    tableName: 'Statuses',
    rows: [{ id: '1', label: '待审批' }, { id: '2', label: '已通过' }],
  },
  validate: (params) => {
    if (!isNonEmptyString(params.tableName)) return missingParam('tableName')
    if (!isNonEmptyArray<IDataRow>(params.rows)) return missingParam('rows')
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
  guardDescription: guardSchemaUnlockedDesc,
  paramsSchema: {
    parentTable: 'string', childTable: 'string',
    parentField: 'string', childField: 'string',
    relationName: 'string? — 可选关系名',
  },
  example: { parentTable: 'Orders', childTable: 'OrderItems', parentField: 'id', childField: 'orderId' },
  validate: (params) => {
    if (!isNonEmptyString(params.parentTable)) return missingParam('parentTable')
    if (!isNonEmptyString(params.childTable)) return missingParam('childTable')
    if (!isNonEmptyString(params.parentField)) return missingParam('parentField')
    if (!isNonEmptyString(params.childField)) return missingParam('childField')
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
  guardDescription: guardSchemaUnlockedDesc,
  paramsSchema: { parentTable: 'string', childTable: 'string' },
  example: { parentTable: 'Orders', childTable: 'OrderItems' },
  validate: (params) => {
    if (!isNonEmptyString(params.parentTable)) return missingParam('parentTable')
    if (!isNonEmptyString(params.childTable)) return missingParam('childTable')
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
  guardDescription: guardDatasetOnlyDesc,
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
  guardDescription: guardSchemaUnlockedDesc,
  paramsSchema: {},
  example: {},
  validate: () => null,
  execute: (session): StillResult => {
    const r = requireDataset(session)
    if ('error' in r) return r.error
    const ds = r.ds
    const tables = Object.keys(ds.tables)

    // 锁定前做两层硬校验：
    // 1. 至少存在一张表，避免生成空壳 schema；
    // 2. 每张表都必须具备主键，确保后续 CRUD、选中态和级联能稳定定位行。
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
  guardDescription: guardSchemaLockedDesc,
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
  guardDescription: guardSchemaLockedDesc,
  paramsSchema: { tableName: 'string', viewId: 'string' },
  example: { tableName: 'Orders', viewId: 'grid' },
  validate: (params) => {
    if (!isNonEmptyString(params.tableName)) return missingParam('tableName')
    if (!isNonEmptyString(params.viewId)) return missingParam('viewId')
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
  guardDescription: guardDatasetOnlyDesc,
  paramsSchema: { tableName: 'string', viewId: 'string? — 默认 default' },
  example: { tableName: 'Orders' },
  validate: (params) => {
    if (!isNonEmptyString(params.tableName)) return missingParam('tableName')
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

/**
 * dataview.configure 同时兼容两种传参方式：
 * 1. config: { autoLoad: true, pageSize: 20 }
 * 2. 扁平字段：{ tableName: 'Orders', autoLoad: true, pageSize: 20 }
 *
 * 这里会剥离结构性字段，只保留真正属于 IViewMetadata 的配置项。
 */
function extractViewConfig(params: DataviewConfigureParams): Partial<IViewMetadata> | null {
  if (isNonEmptyRecord(params.config)) {
    return params.config
  }
  const structuralKeys = new Set(['tableName', 'viewId', 'config'])
  const extracted: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params)) {
    if (!structuralKeys.has(k)) {
      extracted[k] = v
    }
  }
  return isNonEmptyRecord(extracted) ? (extracted as Partial<IViewMetadata>) : null
}

const dataviewConfigure: StillDefinition<DataviewConfigureParams, unknown> = {
  action: 'dataview.configure',
  type: 'request',
  description: '配置视图属性（autoLoad / autoCurrentFirst / pageSize / rows 等）',
  guard: guardSchemaLocked,
  guardDescription: guardSchemaLockedDesc,
  paramsSchema: {
    tableName: 'string', viewId: 'string? — 默认 default',
    note: 'string? — 视图用途备注（如 "主列表" / "下拉选项数据源"）',
    autoLoad: 'boolean? — 自动加载数据', autoCurrentFirst: 'boolean? — 自动选中首行',
    pageSize: 'number? — 每页行数', rows: 'object[]? — 初始行数据',
    filterExpression: 'string?', sortExpression: 'string?',
    valueField: 'string? — 值字段（用于下拉选项的 value）',
    labelField: 'string? — 标签字段（用于下拉选项的显示文本）',
  },
  example: { tableName: 'Orders', note: '订单主列表', autoLoad: true, autoCurrentFirst: true, pageSize: 20 },
  validate: (params) => {
    if (!isNonEmptyString(params.tableName)) return missingParam('tableName')
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
  guardDescription: guardSchemaLockedDesc,
  paramsSchema: {
    tableName: 'string', viewId: 'string? — 默认 default',
    aggregates: 'Record<string, AggregateColumnConfig> — 如 { price: { type: "sum" } }',
  },
  example: { tableName: 'Orders', aggregates: { price: { type: 'sum' }, score: { type: 'avg' } } },
  validate: (params) => {
    if (!isNonEmptyString(params.tableName)) return missingParam('tableName')
    if (!isNonEmptyRecord(params.aggregates)) return missingParam('aggregates')
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
  guardDescription: guardSchemaLockedDesc,
  paramsSchema: {
    tableName: 'string', viewId: 'string? — 默认 default',
    treeConfig: 'TreeConfig — { idField, parentIdField, textField, treeMode? }',
  },
  example: {
    tableName: 'Departments',
    treeConfig: { idField: 'id', parentIdField: 'parentId', textField: 'name', treeMode: 'nested' },
  },
  validate: (params) => {
    if (!isNonEmptyString(params.tableName)) return missingParam('tableName')
    if (!isNonEmptyString(params.treeConfig.idField)) return 'treeConfig 缺少 idField'
    if (!isNonEmptyString(params.treeConfig.parentIdField)) return 'treeConfig 缺少 parentIdField'
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

const VALID_DEPENDENCY_TYPES: ReadonlyArray<ViewDependency['dependencyType']> = [
  'currentRow',
  'selectedRows',
  'allRows',
  'pagedRows',
]

const dependencyAdd: StillDefinition<DependencyAddParams, unknown> = {
  action: 'dependency.add',
  type: 'request',
  description: '添加 ViewDependency（级联类型默认 currentRow）',
  guard: guardSchemaLocked,
  guardDescription: guardSchemaLockedDesc,
  paramsSchema: {
    parentTable: 'string', childTable: 'string',
    parentView: 'string? — 默认 default', childView: 'string? — 默认 default',
    dependencyType: '"currentRow" | "selectedRows" | "allRows" | "pagedRows" — 默认 currentRow',
    autoLoad: 'boolean? — 默认 true',
  },
  example: { parentTable: 'Orders', childTable: 'OrderItems', dependencyType: 'currentRow' },
  validate: (params) => {
    if (!isNonEmptyString(params.parentTable)) return missingParam('parentTable')
    if (!isNonEmptyString(params.childTable)) return missingParam('childTable')
    if (params.dependencyType !== undefined && !VALID_DEPENDENCY_TYPES.includes(params.dependencyType)) {
      return `dependencyType 必须是 ${VALID_DEPENDENCY_TYPES.join('|')}`
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
  guardDescription: guardSchemaLockedDesc,
  paramsSchema: {
    parentTable: 'string', childTable: 'string',
    parentView: 'string? — 默认 default', childView: 'string? — 默认 default',
  },
  example: { parentTable: 'Orders', childTable: 'OrderItems' },
  validate: (params) => {
    if (!isNonEmptyString(params.parentTable)) return missingParam('parentTable')
    if (!isNonEmptyString(params.childTable)) return missingParam('childTable')
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

const datasetStills = [
  datasetInit,
  datasetDescribe,
  datasetValidate,
  datasetExport,
  datasetReset,
]

const datatableStills = [
  datatableCreate,
  datatableDescribe,
  datatableAddColumns,
  datatableUpdateColumn,
  datatableRemoveColumn,
  datatableSetApi,
  datatableAddRows,
]

const relationStills = [
  relationAdd,
  relationRemove,
  relationList,
]

const schemaStills = [
  schemaLock,
  schemaUnlock,
]

const dataviewStills = [
  dataviewCreate,
  dataviewDescribe,
  dataviewConfigure,
  dataviewSetAggregates,
  dataviewSetTreeConfig,
]

const dependencyStills = [
  dependencyAdd,
  dependencyRemove,
]

/**
 * 暴露顺序就是 still 面板和命令发现时看到的顺序。
 * 这里按 namespace 分组拼装，后续增删 action 时不必在人肉统计里找位置。
 */
const allDatasetStills = [
  ...datasetStills,
  ...datatableStills,
  ...relationStills,
  ...schemaStills,
  ...dataviewStills,
  ...dependencyStills,
] as unknown as StillDefinition[]

/** DataSet 域 — 24 个数据建模 action */
export const datasetDomain: DomainProvider = {
  name: 'dataset',
  roleHint: 'SPARK View 数据建模专家——负责 DataSet 结构设计（表、列、关系、视图、依赖）',
  stills: allDatasetStills,
  createSlot: createDataSetSlot,
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
