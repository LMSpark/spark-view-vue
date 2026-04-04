/**
 * DataSet Domain
 *
 * 1. 定义 dataset 域在 still session 中的状态；
 * 2. 按 namespace 注册数据建模 action；
 * 3. 直接把建模操作委托给 DataSet / DataTable / DataView 运行时对象。
 *
 * 设计原则：
 * - session state 持有真实 DataSet 实例，而不是元数据投影；
 * - still 层只负责编排、guard、参数校验、错误映射；
 * - 导出/序列化通过 DataSet.toData() / toJSON() 完成。
 */

import type {
  IStillSession,
  StillGuard,
  StillResult,
  StillDefinition,
  DomainState,
  DomainProvider,
  ViewDependency,
  PostValidationWarning,
} from './types'
import { getDomainState } from './types'
import type { DataColumn, CrudApi, IDataRow, AggregateColumnConfig, TreeConfig, IViewMetadata, DataTable, DataView, TableRelation } from '@spark-view/spark-data'
import { DataSet, INSTANCE_PERMISSION_FIELD, MODEL_PERMISSION_FIELD } from '@spark-view/spark-data'

type ProjectedPayload<T> = { data: T; summary: string }
type StillFailure = { ok: false; code: string; msg: string; fix: string }
type DatasetValidationIssue = { rule: string; pass: boolean; detail?: string }

const STRING_COLUMN_TYPES = new Set(['string', 'varchar', 'text'])
const NUMBER_COLUMN_TYPES = new Set(['number', 'int', 'integer', 'decimal', 'float', 'double'])
const BOOLEAN_COLUMN_TYPES = new Set(['boolean', 'bool'])
const DATE_COLUMN_TYPES = new Set(['date', 'datetime'])
const TIME_COLUMN_TYPES = new Set(['time'])
const OBJECT_COLUMN_TYPES = new Set(['object'])
const ARRAY_COLUMN_TYPES = new Set(['array'])
const ENUM_COLUMN_TYPES = new Set(['enum'])
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
const INTERNAL_ROW_META_FIELDS = new Set<string>(['_pk', INSTANCE_PERMISSION_FIELD, MODEL_PERMISSION_FIELD])
const CRUD_API_ENDPOINT_KEYS = [
  'create',
  'retrieve',
  'update',
  'delete',
  'list',
  'import',
  'export',
  'node',
  'children',
  'path',
  'subtree',
  'move',
  'search',
  'nested',
  'nestedSearch',
] as const

// ═══════════════════════════════════════════════════════════
// 域状态与通用帮助函数
// ═══════════════════════════════════════════════════════════

/**
 * 数据建模域的生命周期阶段。
 *
 * 与蓝图 checkpoint 对齐：
 * - discover   — 初始态，了解可用能力
 * - blueprint  — 蓝图已创建，dataset 尚未初始化
 * - design     — dataset 已初始化，schema 未锁定（建表/列/关系）
 * - configure  — schema 已锁定（视图/API/依赖配置）
 * - validate   — 校验阶段
 * - export     — 导出完成
 */
export type DesignPhase = 'discover' | 'blueprint' | 'design' | 'configure' | 'validate' | 'export'

/** DataSet 域在 session.domains['dataset'] 中保存的会话状态。 */
export interface DataSetDomainState extends DomainState<DataSet | null, DesignPhase> {
  /** schema 是否已锁定（锁定后禁止结构变更，允许视图/API/依赖配置） */
  locked: boolean
}

/** 类型安全的 dataset 域 state 访问器。 */
export function getDataSetState(session: IStillSession): DataSetDomainState {
  return getDomainState<DataSetDomainState>(session, 'dataset')
}

/**
 * 统一的初始 state 工厂。
 * createState 与 dataset.reset 共用它，避免默认值出现双份定义后漂移。
 */
function createDataSetState(): DataSetDomainState {
  return {
    data: null,
    locked: false,
    phase: 'discover',
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

function isHttpEndpointConfig(value: unknown): value is { url: string; method?: string } {
  if (!isNonEmptyRecord(value)) return false
  if (!isNonEmptyString(value['url'])) return false
  const method = value['method']
  return method === undefined || (typeof method === 'string' && HTTP_METHODS.has(method))
}

function validateCrudApiConfig(api: CrudApi): string | null {
  if (!isNonEmptyRecord(api)) return missingParam('api')

  let hasRecognizedEndpoint = false
  for (const key of CRUD_API_ENDPOINT_KEYS) {
    const endpoint = api[key]
    if (endpoint === undefined) continue
    hasRecognizedEndpoint = true
    if (!isHttpEndpointConfig(endpoint)) {
      return `api.${key} 必须包含 url，method 只能是 GET/POST/PUT/PATCH/DELETE`
    }
  }

  if (api['batch'] !== undefined) {
    hasRecognizedEndpoint = true
    if (!isNonEmptyRecord(api['batch'])) {
      return 'api.batch 必须是对象'
    }
    for (const key of ['create', 'update', 'delete'] as const) {
      const endpoint = api['batch'][key]
      if (endpoint !== undefined && !isHttpEndpointConfig(endpoint)) {
        return `api.batch.${key} 必须包含 url，method 只能是 GET/POST/PUT/PATCH/DELETE`
      }
    }
  }

  if (!hasRecognizedEndpoint) {
    return 'api 至少包含一个合法端点键（如 list/create/update/delete，或 tree/batch 端点）'
  }

  return null
}

function rejectLegacyViewNameParam<T extends object>(params: T): string | null {
  return isNonEmptyString((params as Record<string, unknown>)['viewName']) ? '使用 viewId，不支持 viewName 参数' : null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMissingValue(value: unknown): value is null | undefined {
  return value === null || value === undefined
}

function isColumnRequired(column: DataColumn): boolean {
  return column.isPrimaryKey === true || column.required === true || column.allowDBNull === false
}

function describeValueType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (value instanceof Date) return 'date'
  return typeof value
}

function normalizeColumnType(type: DataColumn['type']): string {
  return String(type).toLowerCase()
}

function isValueCompatibleWithColumnType(type: DataColumn['type'], value: unknown): boolean {
  const normalizedType = normalizeColumnType(type)

  if (STRING_COLUMN_TYPES.has(normalizedType)) return typeof value === 'string'
  if (NUMBER_COLUMN_TYPES.has(normalizedType)) return typeof value === 'number' && Number.isFinite(value)
  if (BOOLEAN_COLUMN_TYPES.has(normalizedType)) return typeof value === 'boolean'
  if (DATE_COLUMN_TYPES.has(normalizedType)) return typeof value === 'string' || value instanceof Date
  if (TIME_COLUMN_TYPES.has(normalizedType)) return typeof value === 'string'
  if (OBJECT_COLUMN_TYPES.has(normalizedType)) return isPlainObject(value)
  if (ARRAY_COLUMN_TYPES.has(normalizedType)) return Array.isArray(value)
  if (ENUM_COLUMN_TYPES.has(normalizedType)) return typeof value === 'string' || typeof value === 'number'

  return true
}

function formatValidationIssueSummary(issues: DatasetValidationIssue[], maxItems = 3): string {
  return issues
    .filter((issue) => !issue.pass)
    .slice(0, maxItems)
    .map((issue) => issue.detail ?? issue.rule)
    .join('；')
}

function collectRowConsistencyIssues(
  tableName: string,
  columns: readonly DataColumn[],
  rows: readonly IDataRow[],
  baselineRows: readonly IDataRow[] = [],
): DatasetValidationIssue[] {
  const issues: DatasetValidationIssue[] = []
  const userColumns = columns.filter((column) => !column.isComputed)
  const columnMap = new Map(userColumns.map((column) => [column.name, column]))
  const declaredNames = new Set(columnMap.keys())
  const primaryKeyColumns = userColumns.filter((column) => column.isPrimaryKey === true)
  const seenPrimaryKeys = new Map<string, number>()

  const rememberPrimaryKey = (row: IDataRow, rowIndex: number): void => {
    if (primaryKeyColumns.length === 0) return
    const keyParts = primaryKeyColumns.map((column) => row[column.name])
    if (keyParts.some((value) => isMissingValue(value))) return
    const key = keyParts.map((value) => JSON.stringify(value)).join('::')
    if (!seenPrimaryKeys.has(key)) {
      seenPrimaryKeys.set(key, rowIndex)
      return
    }

    const previousIndex = seenPrimaryKeys.get(key) ?? 0
    issues.push({
      rule: `表 ${tableName} 主键唯一`,
      pass: false,
      detail: `表 ${tableName} 第 ${rowIndex + 1} 行与第 ${previousIndex + 1} 行主键重复`,
    })
  }

  baselineRows.forEach(rememberPrimaryKey)

  rows.forEach((row, rowIndex) => {
    const unknownKeys = Object.keys(row).filter((key) => !INTERNAL_ROW_META_FIELDS.has(key) && !declaredNames.has(key))
    if (unknownKeys.length > 0) {
      issues.push({
        rule: `表 ${tableName} 行字段必须已声明`,
        pass: false,
        detail: `表 ${tableName} 第 ${rowIndex + 1} 行包含未声明字段: ${unknownKeys.join(', ')}`,
      })
    }

    for (const column of userColumns) {
      const value = row[column.name]
      if (isMissingValue(value)) {
        if (isColumnRequired(column)) {
          issues.push({
            rule: `表 ${tableName} 必填字段完整`,
            pass: false,
            detail: `表 ${tableName} 第 ${rowIndex + 1} 行缺少字段 ${column.name}`,
          })
        }
        continue
      }

      if (!isValueCompatibleWithColumnType(column.type, value)) {
        issues.push({
          rule: `表 ${tableName} 字段类型匹配`,
          pass: false,
          detail: `表 ${tableName} 第 ${rowIndex + 1} 行字段 ${column.name} 类型不匹配：期望 ${column.type}，实际 ${describeValueType(value)}`,
        })
      }
    }

    rememberPrimaryKey(row, baselineRows.length + rowIndex)
  })

  return issues
}

function collectRelationCompatibilityIssues(dataset: DataSet): DatasetValidationIssue[] {
  const issues: DatasetValidationIssue[] = []

  for (const relation of dataset.tableRelations ?? []) {
    const parentColumn = dataset.getTable(relation.parentTable)?.columns.find((column) => column.name === relation.parentField)
    const childColumn = dataset.getTable(relation.childTable)?.columns.find((column) => column.name === relation.childField)
    if (!parentColumn || !childColumn) continue

    if (normalizeColumnType(parentColumn.type) !== normalizeColumnType(childColumn.type)) {
      issues.push({
        rule: `关系 ${relation.parentTable}→${relation.childTable} 字段类型一致`,
        pass: false,
        detail: `关系 ${relation.parentTable}.${relation.parentField}(${parentColumn.type}) 与 ${relation.childTable}.${relation.childField}(${childColumn.type}) 类型不一致`,
      })
    }
  }

  return issues
}

function collectOptionTablesWithoutRows(dataset: DataSet): string[] {
  return Object.values(dataset.tables)
    .filter((table) => table.getView('options') !== undefined && table.rows.length === 0)
    .map((table) => table.tableName)
}

// ═══════════════════════════════════════════════════════════
// Post-validation helpers（供 postValidate 钩子使用）
// ═══════════════════════════════════════════════════════════

/**
 * Options 视图配置校验：有 options 视图的表必须有 valueField + labelField；
 * 含 parentId 列的表的 options 视图必须有 treeConfig。
 * 下沉自 verify 脚本 collectOptionViewConfigIssues。
 */
function postValidateOptionViews(dataset: DataSet): PostValidationWarning[] {
  const warnings: PostValidationWarning[] = []

  for (const [tableName, table] of Object.entries(dataset.tables)) {
    const optionsView = table.getView('options')
    if (!optionsView) continue

    if (optionsView.valueField === undefined) {
      warnings.push({
        rule: 'OPTIONS_VALUE_FIELD',
        detail: `${tableName}.options 视图缺少 valueField`,
        fix: `请 dataview.configure { tableName: "${tableName}", viewId: "options", valueField: "id" }`,
      })
    }
    if (optionsView.labelField === undefined) {
      warnings.push({
        rule: 'OPTIONS_LABEL_FIELD',
        detail: `${tableName}.options 视图缺少 labelField`,
        fix: `请 dataview.configure { tableName: "${tableName}", viewId: "options", labelField: "name" }`,
      })
    }

    const hasParentId = table.columns.some((column) => column.name === 'parentId')
    if (hasParentId && optionsView.treeConfig === undefined) {
      warnings.push({
        rule: 'OPTIONS_TREE_CONFIG',
        detail: `${tableName} 含 parentId 列，options 视图缺少 treeConfig`,
        fix: `请 dataview.setTreeConfig { tableName: "${tableName}", viewId: "options", treeConfig: { idField: "id", parentIdField: "parentId", textField: "name" } }`,
      })
    }
  }

  return warnings
}

/**
 * 聚合/计算列交叉验证：数值型计算列理应有对应的 sum 聚合。
 * 下沉自 verify 脚本内联校验逻辑。
 */
function postValidateComputedAggregates(
  dataset: DataSet,
  tableName: string,
  viewId: string,
): PostValidationWarning[] {
  const table = dataset.getTable(tableName)
  if (!table) return []

  const computedNumericColumns = table.columns.filter(
    (col) => col.computeExpression !== undefined && NUMBER_COLUMN_TYPES.has(normalizeColumnType(col.type)),
  )
  if (computedNumericColumns.length === 0) return []

  const resolvedViewId = viewId
  const view = table.getView(resolvedViewId)
  if (!view) return []

  const aggregates = view.aggregates
  if (Object.keys(aggregates).length === 0) {
    return computedNumericColumns.map((col) => ({
      rule: 'COMPUTED_AGGREGATE',
      detail: `${tableName}.${col.name} 是数值计算列，但视图 ${resolvedViewId} 没有任何聚合配置`,
      fix: `请 dataview.setAggregates 为数值计算列添加 sum 聚合`,
    }))
  }

  const warnings: PostValidationWarning[] = []
  for (const col of computedNumericColumns) {
    const agg = aggregates[col.name]
    if (!agg) {
      warnings.push({
        rule: 'COMPUTED_AGGREGATE',
        detail: `${tableName}.${col.name} 是数值计算列，但未配置聚合`,
        fix: `请在 dataview.setAggregates 中为 ${col.name} 添加 { type: "sum" }`,
      })
    }
  }

  return warnings
}

function createWorkingDataSet(dataSetName: string): DataSet {
  return new DataSet({ dataSetName, tables: {}, tableRelations: [], viewDependencies: [] })
}

function inspectSchemaInstance(dataset: DataSet): {
  tableCount: number
  relationCount: number
  missingPrimaryKeys: string[]
} {
  const tableNames = Object.keys(dataset.tables)
  const missingPrimaryKeys = tableNames.filter(
    (tableName) => !(dataset.tables[tableName]?.columns.some((column) => column.isPrimaryKey) ?? false),
  )

  return {
    tableCount: tableNames.length,
    relationCount: dataset.tableRelations?.length ?? 0,
    missingPrimaryKeys,
  }
}

function listTableNames(dataset: DataSet): string[] {
  return Object.keys(dataset.tables)
}

function countColumns(dataset: DataSet, predicate?: (column: DataColumn) => boolean): number {
  return Object.values(dataset.tables).reduce(
    (sum, table) => sum + table.columns.filter((column) => predicate?.(column) ?? true).length,
    0,
  )
}

function describeDatasetInstance(
  dataset: DataSet,
): ProjectedPayload<{
  dataSetName: string
  tables: string[]
  tableCount: number
  totalColumns: number
  computedColumns: number
  relations: number
  viewDependencies: number
}> {
  const tableNames = listTableNames(dataset)
  const totalColumns = countColumns(dataset)
  const computedColumns = countColumns(dataset, (column) => column.computeExpression !== undefined)
  const userColumns = countColumns(dataset, (column) => !column.isComputed)

  return {
    data: {
      dataSetName: dataset.dataSetName,
      tables: tableNames,
      tableCount: tableNames.length,
      totalColumns,
      computedColumns,
      relations: dataset.tableRelations?.length ?? 0,
      viewDependencies: dataset.viewDependencies?.length ?? 0,
    },
    summary: `DataSet ${dataset.dataSetName}: ${tableNames.length} 表, ${userColumns} 列, ${dataset.tableRelations?.length ?? 0} 关系`,
  }
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function projectDataSetSnapshot(dataset: DataSet): ProjectedPayload<{
  status: 'ok'
  snapshot: Record<string, unknown>
}> {
  return {
    data: {
      status: 'ok',
      snapshot: cloneJsonValue(dataset.toData()) as unknown as Record<string, unknown>,
    },
    summary: `导出 DataSet: ${dataset.dataSetName}`,
  }
}

function projectRelationList(dataset: DataSet): ProjectedPayload<{
  relations: TableRelation[]
  count: number
}> {
  const relations = (dataset.tableRelations ?? []).map((relation) => ({ ...relation }))
  return {
    data: { relations, count: relations.length },
    summary: `${relations.length} 条关系`,
  }
}

function describeTableInstance(table: DataTable): ProjectedPayload<{
  tableName: string
  columns: Array<{
    name: string
    type: DataColumn['type']
    isPrimaryKey: boolean
    label: string | undefined
    computeExpression: string | undefined
  }>
  columnCount: number
  api: CrudApi | null
  viewCount: number
  views: string[]
  relations: string[]
}> {
  const relations = (table.dataSet?.tableRelations ?? []).filter(
    (relation) => relation.parentTable === table.tableName || relation.childTable === table.tableName,
  )
  const userColumns = table.columns.filter((column) => !column.isComputed)

  return {
    data: {
      tableName: table.tableName,
      columns: userColumns.map((column) => ({
        name: column.name,
        type: column.type,
        isPrimaryKey: column.isPrimaryKey ?? false,
        label: column.label,
        computeExpression: column.computeExpression,
      })),
      columnCount: userColumns.length,
      api: table.api ?? null,
      viewCount: Object.keys(table.views).length,
      views: Object.keys(table.views),
      relations: relations.map((relation) => `${relation.parentTable}→${relation.childTable}`),
    },
    summary: `表 ${table.tableName} 详情`,
  }
}

function projectViewCreation(table: DataTable, viewId: string): ProjectedPayload<{
  tableName: string
  viewId: string
  viewCount: number
}> {
  return {
    data: {
      tableName: table.tableName,
      viewId,
      viewCount: Object.keys(table.views).length,
    },
    summary: `创建视图 ${table.tableName}:${viewId}`,
  }
}

function describeViewInstance(view: DataView): ProjectedPayload<{
  tableName: string
  viewId: string
  config: IViewMetadata
  viewIds: string[]
}> {
  const table = view.dataTable
  if (!table) {
    throw new DataSetOpError('VIEW_NOT_ATTACHED', `视图 ${view.tableName}:${view.viewId} 尚未绑定 DataTable`, '请通过 DataTable.getOrCreateView() 创建视图')
  }

  return {
    data: {
      tableName: view.tableName,
      viewId: view.viewId,
      config: view.toData(),
      viewIds: Object.keys(table.views),
    },
    summary: `视图 ${view.tableName}:${view.viewId}`,
  }
}

function projectViewConfiguration(
  view: DataView,
  changedKeys: string[],
): ProjectedPayload<{
  tableName: string
  viewId: string
  config: IViewMetadata
}> {
  return {
    data: {
      tableName: view.tableName,
      viewId: view.viewId,
      config: view.toData(),
    },
    summary: `配置视图 ${view.tableName}:${view.viewId}（${changedKeys.join(', ')}）`,
  }
}

function projectAggregateConfiguration(
  view: DataView,
  aggregates: Record<string, AggregateColumnConfig>,
): ProjectedPayload<{
  tableName: string
  viewId: string
  aggregates: Record<string, AggregateColumnConfig>
  aggregateCount: number
}> {
  return {
    data: {
      tableName: view.tableName,
      viewId: view.viewId,
      aggregates,
      aggregateCount: Object.keys(aggregates).length,
    },
    summary: `设置 ${Object.keys(aggregates).length} 个聚合列`,
  }
}

function projectTreeConfiguration(
  view: DataView,
  treeConfig: TreeConfig,
): ProjectedPayload<{
  tableName: string
  viewId: string
  treeConfig: TreeConfig
}> {
  return {
    data: {
      tableName: view.tableName,
      viewId: view.viewId,
      treeConfig,
    },
    summary: `设置树配置 ${view.tableName}:${view.viewId}（mode=${treeConfig.treeMode ?? 'flat'}）`,
  }
}

function validateDatasetInstance(
  dataset: DataSet,
): ProjectedPayload<{
  status: 'ok'
  valid: boolean
  dataSetName: string
  summary: {
    tables: number
    totalColumns: number
    computedColumns: number
    relations: number
  }
  checks: DatasetValidationIssue[]
  issues: DatasetValidationIssue[]
}> {
  const issues: DatasetValidationIssue[] = []

  for (const [name, table] of Object.entries(dataset.tables)) {
    const hasPrimaryKey = table.columns.some((column) => column.isPrimaryKey)
    issues.push({
      rule: `表 ${name} 至少一个主键`,
      pass: hasPrimaryKey,
      ...(!hasPrimaryKey ? { detail: `表 ${name} 缺少主键列` } : {}),
    })
  }

  for (const relation of dataset.tableRelations ?? []) {
    const parentExists = dataset.getTable(relation.parentTable) !== undefined
    const childExists = dataset.getTable(relation.childTable) !== undefined
    const tablesPass = parentExists && childExists
    issues.push({
      rule: `关系 ${relation.parentTable}→${relation.childTable} 引用表存在`,
      pass: tablesPass,
      ...(!tablesPass ? { detail: `${!parentExists ? relation.parentTable : relation.childTable} 不存在` } : {}),
    })

    if (!tablesPass || !relation.parentField) continue

    const parentHasField = dataset.getTable(relation.parentTable)?.columns.some((column) => column.name === relation.parentField) ?? false
    const childHasField = relation.childField
      ? (dataset.getTable(relation.childTable)?.columns.some((column) => column.name === relation.childField) ?? false)
      : true
    const fieldsPass = parentHasField && childHasField
    issues.push({
      rule: `关系 ${relation.parentTable}→${relation.childTable} 引用字段存在`,
      pass: fieldsPass,
      ...(!fieldsPass ? { detail: '关联字段在对应表中未找到' } : {}),
    })
  }

  for (const [name, table] of Object.entries(dataset.tables)) {
    for (const column of table.columns) {
      if (column.computeExpression !== undefined) {
        issues.push({ rule: `表 ${name} 计算列 ${column.name} 表达式有效`, pass: true })
      }
    }

    issues.push(...collectRowConsistencyIssues(name, table.columns, table.rows))
  }

  issues.push(...collectRelationCompatibilityIssues(dataset))

  const relationKeys = (dataset.tableRelations ?? []).map((relation) => `${relation.parentTable}→${relation.childTable}`)
  const uniqueRelationKeys = new Set(relationKeys)
  issues.push({
    rule: '无重复关系',
    pass: relationKeys.length === uniqueRelationKeys.size,
    ...(relationKeys.length !== uniqueRelationKeys.size ? { detail: '存在重复的表间关系' } : {}),
  })

  const valid = issues.every((issue) => issue.pass)
  const failedIssueCount = issues.filter((issue) => !issue.pass).length
  const totalColumns = countColumns(dataset)
  const computedColumns = countColumns(dataset, (column) => column.computeExpression !== undefined)
  const tableCount = listTableNames(dataset).length

  return {
    data: {
      status: 'ok',
      valid,
      dataSetName: dataset.dataSetName,
      summary: {
        tables: tableCount,
        totalColumns,
        computedColumns,
        relations: dataset.tableRelations?.length ?? 0,
      },
      checks: issues,
      issues: issues.filter((issue) => !issue.pass),
    },
    summary: valid
      ? `校验通过：${issues.length} 项检查，0 个问题`
      : `校验未通过：${failedIssueCount} 个问题`,
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function mapRelationAddError(error: unknown): DataSetOpError {
  const message = toErrorMessage(error)
  if (message.includes('not found')) {
    const code = message.includes('field') ? 'COLUMN_NOT_FOUND' : 'TABLE_NOT_FOUND'
    return new DataSetOpError(code, message, '请查 datatable.describe')
  }
  if (message.includes('already exists')) {
    return new DataSetOpError('RELATION_EXISTS', '相同关系已存在', '跳过此步骤')
  }
  return new DataSetOpError('UNKNOWN', message, '')
}

function mapRelationRemoveError(error: unknown, parentTable: string, childTable: string): DataSetOpError {
  const message = toErrorMessage(error)
  if (message.includes('not found')) {
    return new DataSetOpError('RELATION_NOT_FOUND', '关系不存在', '请查 relation.list')
  }
  if (message.includes('referenced')) {
    return new DataSetOpError('RELATION_IN_USE', `关系 ${parentTable}→${childTable} 被 viewDependency 引用`, '先 dependency.remove 再删关系')
  }
  return new DataSetOpError('UNKNOWN', message, '')
}

function mapDependencyAddError(error: unknown): DataSetOpError {
  const message = toErrorMessage(error)
  if (message.includes('not found')) {
    return new DataSetOpError('TABLE_NOT_FOUND', message, '请确认表名')
  }
  if (message.includes('No tableRelation')) {
    return new DataSetOpError('NO_RELATION', message, '请先 relation.add')
  }
  if (message.includes('already exists')) {
    return new DataSetOpError('DEPENDENCY_EXISTS', '相同依赖已存在', '跳过此步骤')
  }
  return new DataSetOpError('UNKNOWN', message, '')
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
    const state = getDataSetState(session)
    if (checks.requireDataset !== false && state.data === null) {
      return { code: 'NO_DATASET', msg: 'Dataset 尚未初始化，请先执行 dataset.init' }
    }
    if (checks.requireSchemaUnlocked === true && state.locked) {
      return { code: 'SCHEMA_LOCKED', msg: 'Schema 已锁定，不允许此操作。如需修改请先 schema.unlock' }
    }
    if (checks.requireSchemaLocked === true && !state.locked) {
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
// 统一读取当前工作 DataSet
// ═══════════════════════════════════════════════════════════

/**
 * 从 session 读取 runtime DataSet。
 * 失败时直接返回 StillResult，方便 execute 里早返回并保持错误结构一致。
 */
function requireDataset(session: IStillSession): { ds: DataSet } | { error: StillFailure } {
  const state = getDataSetState(session)
  if (state.data === null) {
    return { error: { ok: false, code: 'NO_DATASET', msg: 'Dataset 未初始化', fix: '请先执行 dataset.init' } }
  }
  return { ds: state.data }
}

function withDS<T>(session: IStillSession, operation: (DS: DataSet) => StillResult<T>): StillResult<T> {
  const required = requireDataset(session)
  if ('error' in required) return required.error
  const DS = required.ds
  return operation(DS)
}

/** 领域操作错误，携带结构化修复提示 */
class DataSetOpError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly fix: string,
  ) {
    super(message)
    this.name = 'DataSetOpError'
  }
}

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

function toStillError(error: unknown): StillFailure {
  if (error instanceof DataSetOpError) {
    return { ok: false, code: error.code, msg: error.message, fix: error.fix }
  }
  return {
    ok: false,
    code: 'OP_FAILED',
    msg: error instanceof Error ? error.message : 'Operation failed',
    fix: '请检查输入参数',
  }
}

function executeDSOperation<T>(operation: () => ProjectedPayload<T>): StillResult<T> {
  try {
    const result = operation()
    return { ok: true, data: result.data, summary: result.summary }
  } catch (error) {
    return toStillError(error)
  }
}

// ═══════════════════════════════════════════════════════════
// dataset.* (5)
// ═══════════════════════════════════════════════════════════

// ─── dataset.init ──────────────────────────────────────────

interface DatasetInitParams { dataSetName: string }

const datasetInit: StillDefinition<DatasetInitParams, unknown> = {
  action: 'dataset.init',
  type: 'request',
  description: '创建空 DataSet 实例（设 dataSetName）',
  guard: guardBlueprintOnly,
  guardDescription: guardBlueprintOnlyDesc,
  paramsSchema: { dataSetName: 'string — DataSet 名称' },
  example: { dataSetName: 'OrderSystem' },
  validate: (params) => {
    if (!isNonEmptyString(params.dataSetName)) return missingParam('dataSetName')
    return null
  },
  execute: (session, params): StillResult => {
    const state = getDataSetState(session)
    if (state.data !== null) {
      return { ok: false, code: 'DATASET_EXISTS', msg: 'Dataset 已存在', fix: '如需重建请先 dataset.reset' }
    }
    state.data = createWorkingDataSet(params.dataSetName)
    const snapshot = state.data.toData()
    // 与外层设计工作流保持一致：dataset 初始化完成后进入结构设计阶段。
    state.phase = 'design'
    return {
      ok: true,
      data: {
        status: 'ok',
        dataSetName: snapshot.dataSetName,
        schemaVersion: snapshot.schemaVersion ?? 2,
        tables: snapshot.tables,
        tableRelations: snapshot.tableRelations ?? [],
        viewDependencies: snapshot.viewDependencies ?? [],
      },
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
    const state = getDataSetState(session)
    return withDS(session, (DS) => {
      const info = describeDatasetInstance(DS)
      return {
        ok: true,
        data: { ...info.data, locked: state.locked },
        summary: info.summary,
      }
    })
  },
}

// ─── dataset.validate ──────────────────────────────────────

const datasetValidate: StillDefinition<Record<string, never>, unknown> = {
  action: 'dataset.validate',
  type: 'request',
  description: '全量结构校验，返回 issues[]',
  guard: guardDatasetOnly,
  guardDescription: guardDatasetOnlyDesc,
  usageRules: [
    '执行成功只代表校验动作本身完成；是否通过要继续检查返回值里的 data.valid。',
    '适合在 schema.lock 之后、dataset.export 之前做全量验收；若 valid=false，先修 issues 再继续。',
  ],
  paramsSchema: {},
  resultSchema: {
    valid: 'boolean — 是否通过全量校验',
    issues: 'Array<{ scope: string; code: string; detail?: string }> — 校验问题清单',
    summary: 'object — 校验汇总信息',
    hint: 'string — 下一步建议',
  },
  example: {},
  failureModes: [
    {
      code: 'NO_DATASET',
      when: '当前会话尚未初始化 DataSet 就执行 dataset.validate',
      fix: '先 dataset.init，再继续建模与校验',
    },
  ],
  validate: () => null,
  execute: (session): StillResult => {
    const state = getDataSetState(session)
    return withDS(session, (DS) => {
      const result = validateDatasetInstance(DS)
      const hint = result.data.valid
        ? (state.locked ? '校验通过' : '校验通过，无问题。请执行 schema.lock 锁定 schema')
        : '存在校验问题，请先修复'
      return {
        ok: true,
        data: {
          ...result.data,
          summary: { ...result.data.summary, locked: state.locked },
          hint,
        },
        summary: result.summary,
      }
    })
  },
}

// ─── dataset.export ────────────────────────────────────────

const datasetExport: StillDefinition<Record<string, never>, unknown> = {
  action: 'dataset.export',
  type: 'request',
  description: '导出当前 DataSet 的序列化快照',
  guard: guardBlueprintAndDataset,
  guardDescription: guardBlueprintAndDatasetDesc,
  paramsSchema: {},
  example: {},
  validate: () => null,
  execute: (session): StillResult => withDS(session, (DS) => executeDSOperation(() => projectDataSetSnapshot(DS))),
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
    const state = getDataSetState(session)
    Object.assign(state, createDataSetState())
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
  execute: (session, params): StillResult => withDS(session, (DS) => executeDSOperation(() => {
      try {
        DS.addTable(params.tableName, params.columns)
      } catch {
        throw new DataSetOpError('TABLE_EXISTS', `表 ${params.tableName} 已存在`, '使用 datatable.addColumns 向已有表追加列')
      }
      const computedCols = params.columns.filter(c => c.computeExpression !== undefined)
      return {
        data: {
          status: 'ok',
          tableName: params.tableName,
          columnCount: params.columns.length,
          columns: params.columns.map(c => c.name),
          ...(computedCols.length > 0 ? { computedColumns: computedCols.map(c => c.name) } : {}),
        },
        summary: `建表 ${params.tableName}（${params.columns.length} 列）`,
      }
    })),
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
  execute: (session, params): StillResult => withDS(session, (DS) => executeDSOperation(() => describeTableInstance(requireTable(DS, params.tableName)))),
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
  execute: (session, params): StillResult => withDS(session, (DS) => executeDSOperation(() => {
      const table = requireTable(DS, params.tableName)
      const { added, skipped } = table.addColumns(params.columns)
      return {
        data: { status: 'ok', tableName: params.tableName, added, skipped, totalColumns: table.columns.length },
        summary: `追加 ${added.length} 列到 ${params.tableName}${skipped.length > 0 ? `（跳过 ${skipped.length} 个重名列）` : ''}`,
      }
    })),
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
    const { name: _ignoredName, ...safeUpdates } = params.updates
    return withDS(session, (DS) => executeDSOperation(() => {
      const table = requireTable(DS, params.tableName)
      try {
        const updatedFields = table.updateColumn(params.columnName, params.updates)
        return {
          data: { status: 'ok', tableName: params.tableName, columnName: params.columnName, updatedFields },
          summary: `更新 ${params.tableName}.${params.columnName}: ${Object.keys(safeUpdates).join(', ')}`,
        }
      } catch {
        throw new DataSetOpError('COLUMN_NOT_FOUND', `列 ${params.columnName} 不存在`, '请查 datatable.describe')
      }
    }))
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
  execute: (session, params): StillResult => withDS(session, (DS) => executeDSOperation(() => {
      const table = requireTable(DS, params.tableName)
      // 关系引用校验（跨实体逻辑）
      const relImpact = (DS.tableRelations ?? []).filter(
        rel => (rel.parentTable === params.tableName && rel.parentField === params.columnName)
            || (rel.childTable === params.tableName && rel.childField === params.columnName),
      )
      if (relImpact.length > 0) {
        throw new DataSetOpError('COLUMN_IN_USE', `列 ${params.columnName} 被 ${relImpact.length} 条关系引用`, '请先 relation.remove 相关关系后再删除此列')
      }
      try {
        table.removeColumn(params.columnName)
      } catch {
        throw new DataSetOpError('COLUMN_NOT_FOUND', `列 ${params.columnName} 不存在`, '请查 datatable.describe')
      }
      return {
        data: { status: 'ok', tableName: params.tableName, columnName: params.columnName, remainingColumns: table.columns.length },
        summary: `删除列 ${params.tableName}.${params.columnName}`,
      }
    })),
}

// ─── datatable.setApi ──────────────────────────────────────

interface SetApiParams { tableName: string; api: CrudApi }

const datatableSetApi: StillDefinition<SetApiParams, unknown> = {
  action: 'datatable.setApi',
  type: 'request',
  description: '设置表的 CrudApi 配置',
  guard: guardSchemaLocked,
  guardDescription: guardSchemaLockedDesc,
  usageRules: [
    'api 不是单个 {url, method}；必须按 list/create/update/delete 等端点键组织。',
    '至少提供一个合法端点；每个端点都必须包含 url，method 只能是标准 HTTP 方法。',
  ],
  paramsSchema: {
    tableName: 'string',
    api: 'CrudApi — { list?, create?, update?, delete?, ... }',
  },
  resultSchema: {
    status: '"ok"',
    tableName: 'string',
    endpoints: 'string[] — 本次成功配置的 API 端点键',
  },
  example: {
    tableName: 'Orders',
    api: { list: { url: '/api/orders', method: 'GET' }, create: { url: '/api/orders', method: 'POST' } },
  },
  failureModes: [
    {
      code: 'INVALID_PARAMS',
      when: 'api 没有 list/create/update/delete 等合法端点键，或端点缺少 url',
      fix: '改成标准 CrudApi 结构，例如 api.list / api.create / api.update / api.delete',
    },
    {
      code: 'TABLE_NOT_FOUND',
      when: 'tableName 不存在',
      fix: '先 datatable.create 建表，或核对 tableName',
    },
  ],
  validate: (params) => {
    if (!isNonEmptyString(params.tableName)) return missingParam('tableName')
    return validateCrudApiConfig(params.api)
  },
  execute: (session, params): StillResult => withDS(session, (DS) => executeDSOperation(() => {
      const table = requireTable(DS, params.tableName)
      table.setApi(params.api)
      const endpoints = Object.keys(params.api).filter(k => params.api[k as keyof CrudApi] !== undefined)
      return {
        data: { status: 'ok', tableName: params.tableName, endpoints },
        summary: `设置 ${params.tableName} API: ${endpoints.join(', ')}`,
      }
    })),
}

// ─── datatable.addRows ─────────────────────────────────────

interface AddRowsParams { tableName: string; rows: IDataRow[] }

const datatableAddRows: StillDefinition<AddRowsParams, unknown> = {
  action: 'datatable.addRows',
  type: 'request',
  description: '写入内联静态行（枚举/配置表用）',
  guard: guardBlueprintAndDataset,
  guardDescription: guardBlueprintAndDatasetDesc,
  usageRules: [
    '只给静态枚举表、配置表或 seed 数据表写入内联 rows；不要用它模拟远程列表接口结果。',
    'rows 中的字段必须全部已声明；必填字段不能缺失；主键不能重复；值类型必须匹配列定义。',
  ],
  paramsSchema: {
    tableName: 'string',
    rows: 'Array<Record<string, unknown>> — 行数据对象数组',
  },
  resultSchema: {
    status: '"ok"',
    tableName: 'string',
    addedRows: 'number',
    totalRows: 'number',
    remainingOptionTablesWithoutRows: 'string[] — 仍未写入种子数据的 options 视图表',
    hint: 'string — 剩余种子数据待办提示',
  },
  example: {
    tableName: 'Statuses',
    rows: [{ id: '1', label: '待审批' }, { id: '2', label: '已通过' }],
  },
  failureModes: [
    {
      code: 'TABLE_NOT_FOUND',
      when: 'tableName 指向不存在的表',
      fix: '先 datatable.create 建表，或核对 tableName',
    },
    {
      code: 'INVALID_ROW_DATA',
      when: '行数据出现未声明字段、缺失必填值、主键重复或值类型不匹配',
      fix: '按列定义修正字段名、必填值、主键和值类型后重试',
    },
  ],
  validate: (params) => {
    if (!isNonEmptyString(params.tableName)) return missingParam('tableName')
    if (!isNonEmptyArray<IDataRow>(params.rows)) return missingParam('rows')
    return null
  },
  execute: (session, params): StillResult => withDS(session, (DS) => executeDSOperation(() => {
      const table = requireTable(DS, params.tableName)
      const rowIssues = collectRowConsistencyIssues(params.tableName, table.columns, params.rows, table.rows)
      if (rowIssues.length > 0) {
        throw new DataSetOpError(
          'INVALID_ROW_DATA',
          formatValidationIssueSummary(rowIssues),
          '请按列定义修正字段名、必填值、主键和值类型后重试',
        )
      }
      const totalRows = table.addRows(params.rows)
      const remainingOptionTablesWithoutRows = collectOptionTablesWithoutRows(DS)
      const hint = remainingOptionTablesWithoutRows.length > 0
        ? `仍有 options 视图表缺少种子数据: ${remainingOptionTablesWithoutRows.join(', ')}`
        : '当前 options 视图表的种子数据已补齐'
      return {
        data: {
          status: 'ok',
          tableName: params.tableName,
          addedRows: params.rows.length,
          totalRows,
          remainingOptionTablesWithoutRows,
          hint,
        },
        summary: `写入 ${params.rows.length} 行到 ${params.tableName}${remainingOptionTablesWithoutRows.length > 0 ? `；仍缺种子: ${remainingOptionTablesWithoutRows.join(', ')}` : ''}`,
      }
    })),
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
  execute: (session, params): StillResult => withDS(session, (DS) => executeDSOperation(() => {
      try {
        DS.addRelation(params)
      } catch (error) {
        throw mapRelationAddError(error)
      }
      return {
        data: {
          status: 'ok',
          parentTable: params.parentTable, childTable: params.childTable,
          parentField: params.parentField, childField: params.childField,
          relationCount: DS.tableRelations?.length ?? 0,
        },
        summary: `添加关系 ${params.parentTable}→${params.childTable}`,
      }
    })),
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
  execute: (session, params): StillResult => withDS(session, (DS) => executeDSOperation(() => {
      try {
        DS.removeRelation(params.parentTable, params.childTable)
      } catch (error) {
        throw mapRelationRemoveError(error, params.parentTable, params.childTable)
      }
      return {
        data: { status: 'ok', parentTable: params.parentTable, childTable: params.childTable, relationCount: DS.tableRelations?.length ?? 0 },
        summary: `删除关系 ${params.parentTable}→${params.childTable}`,
      }
    })),
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
  execute: (session): StillResult => withDS(session, (DS) => executeDSOperation(() => projectRelationList(DS))),
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
  usageRules: [
    '只在核心表结构、主键和主要关系都准备好之后再锁定。',
    '锁定后不再新增或删除表/列/关系；如果必须改结构，先 schema.unlock 说明原因。',
  ],
  paramsSchema: {},
  resultSchema: {
    locked: 'true',
    tableCount: 'number',
    relationCount: 'number',
  },
  example: {},
  failureModes: [
    {
      code: 'EMPTY_SCHEMA',
      when: '当前 DataSet 还没有任何表',
      fix: '先用 datatable.create 建立至少一张表',
    },
    {
      code: 'MISSING_PK',
      when: '仍有表缺少主键列时尝试锁定 schema',
      fix: '先补齐 isPrimaryKey=true 的列，再执行 schema.lock',
    },
  ],
  validate: () => null,
  execute: (session): StillResult => withDS(session, (DS) => {
    const preflight = inspectSchemaInstance(DS)

    if (preflight.tableCount === 0) {
      return { ok: false, code: 'EMPTY_SCHEMA', msg: '没有任何表，无法锁定', fix: '请先 datatable.create' }
    }
    if (preflight.missingPrimaryKeys.length > 0) {
      return {
        ok: false, code: 'MISSING_PK',
        msg: `以下表缺少主键列: ${preflight.missingPrimaryKeys.join(', ')}`,
        fix: '请 datatable.addColumns 添加 isPrimaryKey=true 的列',
      }
    }

    const state = getDataSetState(session)
    state.locked = true
    state.phase = 'configure'
    return {
      ok: true,
      data: {
        locked: true,
        tableCount: preflight.tableCount,
        relationCount: preflight.relationCount,
      },
      summary: `结构已锁定（${preflight.tableCount} 表, ${preflight.relationCount} 关系）`,
    }
  }),
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
    const state = getDataSetState(session)
    state.locked = false
    state.phase = 'design'
    return {
      ok: true,
      data: { locked: false, reason: params.reason ?? '未说明' },
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
  execute: (session, params): StillResult => withDS(session, (DS) => executeDSOperation(() => {
      const table = requireTable(DS, params.tableName)
      if (table.getView(params.viewId)) {
        throw new DataSetOpError('VIEW_EXISTS', `视图 ${params.viewId} 已存在`, '请用 dataview.configure 配置')
      }
      table.addView(params.viewId)
      return projectViewCreation(table, params.viewId)
    })),
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
  execute: (session, params): StillResult => withDS(session, (DS) => executeDSOperation(() => {
      const { view } = requireView(DS, params.tableName, params.viewId)
      return describeViewInstance(view)
    })),
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
  const structuralKeys = new Set(['tableName', 'viewId', 'viewName', 'config'])
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
  usageRules: [
    '只使用 viewId 指定视图；viewName 是旧参数别名，当前会被直接拒绝。',
    '至少提供一个真正的视图配置字段，不能只传 tableName / viewId 这种结构字段。',
  ],
  paramsSchema: {
    tableName: 'string', viewId: 'string? — 默认 default',
    note: 'string? — 视图用途备注（如 "主列表" / "下拉选项数据源"）',
    autoLoad: 'boolean? — 自动加载数据', autoCurrentFirst: 'boolean? — 自动选中首行',
    pageSize: 'number? — 每页行数', rows: 'object[]? — 初始行数据',
    filterExpression: 'string?', sortExpression: 'string?',
    valueField: 'string? — 值字段（用于下拉选项的 value）',
    labelField: 'string? — 标签字段（用于下拉选项的显示文本）',
  },
  resultSchema: {
    tableName: 'string',
    viewId: 'string',
    config: 'IViewMetadata — 更新后的视图配置快照',
  },
  example: { tableName: 'Orders', note: '订单主列表', autoLoad: true, autoCurrentFirst: true, pageSize: 20 },
  failureModes: [
    {
      code: 'INVALID_PARAMS',
      when: '传了 viewName 旧参数，或没有任何有效配置字段',
      fix: '改用 viewId，并补充 autoLoad / pageSize / rows / note 等配置字段',
    },
    {
      code: 'VIEW_NOT_FOUND',
      when: '指定的 tableName/viewId 找不到对应视图',
      fix: '先 dataview.describe 或 dataview.create，确认视图存在后再配置',
    },
  ],
  validate: (params) => {
    if (!isNonEmptyString(params.tableName)) return missingParam('tableName')
    const aliasError = rejectLegacyViewNameParam(params)
    if (aliasError) return aliasError
    const config = extractViewConfig(params)
    if (!config) return '缺少配置属性（autoLoad / pageSize / autoCurrentFirst 等）'
    return null
  },
  execute: (session, params): StillResult => {
    const config = extractViewConfig(params)
    if (!config) return { ok: false, code: 'INVALID_PARAMS', msg: '缺少配置属性', fix: '提供 autoLoad / pageSize 等属性' }
    return withDS(session, (DS) => executeDSOperation(() => {
      const { view } = requireView(DS, params.tableName, params.viewId)
      view.configure(config)
      return projectViewConfiguration(view, Object.keys(config))
    }))
  },
  postValidate: (session): PostValidationWarning[] => {
    const DS = getDataSetState(session).data
    if (!DS) return []
    return postValidateOptionViews(DS)
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
    const aliasError = rejectLegacyViewNameParam(params)
    if (aliasError) return aliasError
    if (!isNonEmptyRecord(params.aggregates)) return missingParam('aggregates')
    return null
  },
  execute: (session, params): StillResult => withDS(session, (DS) => executeDSOperation(() => {
      const { view } = requireView(DS, params.tableName, params.viewId)
      try {
        view.setAggregates(params.aggregates)
        return projectAggregateConfiguration(view, params.aggregates)
      } catch (error) {
        throw new DataSetOpError('COLUMN_NOT_FOUND', toErrorMessage(error), '请先添加相关列')
      }
    })),
  postValidate: (session, params): PostValidationWarning[] => {
    const DS = getDataSetState(session).data
    if (!DS) return []
    return postValidateComputedAggregates(DS, params.tableName, params.viewId ?? 'default')
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
    const aliasError = rejectLegacyViewNameParam(params)
    if (aliasError) return aliasError
    if (!isNonEmptyString(params.treeConfig.idField)) return 'treeConfig 缺少 idField'
    if (!isNonEmptyString(params.treeConfig.parentIdField)) return 'treeConfig 缺少 parentIdField'
    return null
  },
  execute: (session, params): StillResult => withDS(session, (DS) => executeDSOperation(() => {
      const { view } = requireView(DS, params.tableName, params.viewId)
      try {
        view.setTreeConfig(params.treeConfig)
        return projectTreeConfiguration(view, params.treeConfig)
      } catch (error) {
        throw new DataSetOpError('COLUMN_NOT_FOUND', toErrorMessage(error), '请检查列名')
      }
    })),
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
  execute: (session, params): StillResult => withDS(session, (DS) => executeDSOperation(() => {
      try {
        DS.addDependency(params)
      } catch (error) {
        throw mapDependencyAddError(error)
      }
      const deps = DS.viewDependencies ?? []
      const dep = deps[deps.length - 1]
      return {
        data: {
          status: 'ok',
          parentTable: params.parentTable, childTable: params.childTable,
          dependencyType: dep?.dependencyType ?? 'currentRow',
          dependencyCount: deps.length,
        },
        summary: `添加依赖 ${params.parentTable}→${params.childTable}（${params.dependencyType ?? 'currentRow'}）`,
      }
    })),
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
  execute: (session, params): StillResult => withDS(session, (DS) => executeDSOperation(() => {
      try {
        DS.removeDependency(params.parentTable, params.childTable)
      } catch {
        throw new DataSetOpError('DEPENDENCY_NOT_FOUND', '依赖不存在', '请确认参数')
      }
      return {
        data: { status: 'ok', parentTable: params.parentTable, childTable: params.childTable, dependencyCount: DS.viewDependencies?.length ?? 0 },
        summary: `删除依赖 ${params.parentTable}→${params.childTable}`,
      }
    })),
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
 * 注册表层不会按静态类型直接调用各 still 的 params，因此这里显式擦除具体参数泛型。
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
export const datasetDomain: DomainProvider<DataSetDomainState> = {
  name: 'dataset',
  roleHint: 'SPARK View 数据建模专家——负责 DataSet 结构设计（表、列、关系、视图、依赖）',
  stills: allDatasetStills,
  createState: createDataSetState,
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
