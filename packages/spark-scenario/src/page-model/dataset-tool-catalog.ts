import type { PageModelToolFailureMode, PageModelToolType } from './tool-contracts'

export type PageModelDatasetToolTarget = 'dataset' | 'table' | 'column' | 'view' | 'row' | 'relation' | 'dependency'

export interface PageModelDatasetToolRow {
  action: string
  type: PageModelToolType
  target: PageModelDatasetToolTarget
  crudToolMethod: string
  description: string
  paramsSchema: Record<string, unknown>
  resultSchema: Record<string, unknown>
  example: Record<string, unknown>
  usageRules: readonly string[]
  failureModes: readonly PageModelToolFailureMode[]
}

const NO_PARAMS: Record<string, unknown> = {}
const TABLE = { tableName: 'string — 表名' }
const VIEW = { tableName: 'string — 表名', viewId: 'string? — 视图 ID；省略为 default' }
const DATASET_RULE = '动作作用于当前 PageModelHost 绑定的同一个 DataSetCrudTool 实例。'
const REQUEST_RULE = 'request 动作成功后必须同步回写 pagedata.json 当前态。'

function describe(definition: Omit<PageModelDatasetToolRow, 'type'>): PageModelDatasetToolRow {
  return { type: 'describe', ...definition }
}

function request(definition: Omit<PageModelDatasetToolRow, 'type'>): PageModelDatasetToolRow {
  return { type: 'request', ...definition }
}

function row(params: {
  action: string
  type: PageModelToolType
  target: PageModelDatasetToolTarget
  crudToolMethod: string
  description: string
  paramsSchema?: Record<string, unknown>
  resultSchema?: Record<string, unknown>
  example?: Record<string, unknown>
  usageRules?: readonly string[]
  failureModes?: readonly PageModelToolFailureMode[]
}): PageModelDatasetToolRow {
  const factory = params.type === 'request' ? request : describe
  return factory({
    action: params.action,
    target: params.target,
    crudToolMethod: params.crudToolMethod,
    description: params.description,
    paramsSchema: params.paramsSchema ?? NO_PARAMS,
    resultSchema: params.resultSchema ?? {},
    example: params.example ?? {},
    usageRules: params.usageRules ?? [DATASET_RULE, ...(params.type === 'request' ? [REQUEST_RULE] : [])],
    failureModes: params.failureModes ?? [],
  })
}

export const PAGE_MODEL_DATASET_TOOL_ROWS = [
  row({ action: 'datasetTool.export', type: 'describe', target: 'dataset', crudToolMethod: 'toJson', description: '导出当前 DataSet 元数据快照。' }),
  row({ action: 'datasetTool.canUndo', type: 'describe', target: 'dataset', crudToolMethod: 'canUndo', description: '读取是否可撤销。' }),
  row({ action: 'datasetTool.canRedo', type: 'describe', target: 'dataset', crudToolMethod: 'canRedo', description: '读取是否可重做。' }),
  row({ action: 'datasetTool.historyCursor', type: 'describe', target: 'dataset', crudToolMethod: 'historyCursor', description: '读取历史游标。' }),
  row({ action: 'datasetTool.undo', type: 'request', target: 'dataset', crudToolMethod: 'undo', description: '撤销最近一次结构写操作。' }),
  row({ action: 'datasetTool.redo', type: 'request', target: 'dataset', crudToolMethod: 'redo', description: '重做最近一次撤销。' }),
  row({ action: 'datasetTool.clearHistory', type: 'request', target: 'dataset', crudToolMethod: 'clearHistory', description: '清空历史栈。' }),
  row({ action: 'datasetTool.listTables', type: 'describe', target: 'dataset', crudToolMethod: 'listTables', description: '列出全部数据表。' }),
  row({ action: 'datasetTool.getTable', type: 'describe', target: 'table', crudToolMethod: 'getTable', description: '获取指定数据表。', paramsSchema: TABLE }),
  row({ action: 'datasetTool.listColumns', type: 'describe', target: 'column', crudToolMethod: 'listColumns', description: '列出指定表列定义。', paramsSchema: TABLE }),
  row({ action: 'datasetTool.getColumn', type: 'describe', target: 'column', crudToolMethod: 'getColumn', description: '获取指定列定义。', paramsSchema: { ...TABLE, columnName: 'string — 列名' } }),
  row({ action: 'datasetTool.createColumn', type: 'request', target: 'column', crudToolMethod: 'createColumn', description: '向指定表追加一列。', paramsSchema: { ...TABLE, column: 'DataColumn — 列定义对象' } }),
  row({ action: 'datasetTool.updateColumn', type: 'request', target: 'column', crudToolMethod: 'updateColumn', description: '更新指定列定义。', paramsSchema: { ...TABLE, columnName: 'string — 列名', updates: 'Partial<DataColumn>' } }),
  row({ action: 'datasetTool.renameColumn', type: 'request', target: 'column', crudToolMethod: 'renameColumn', description: '重命名指定列并同步引用。', paramsSchema: { ...TABLE, columnName: 'string — 原列名', newColumnName: 'string — 新列名' } }),
  row({ action: 'datasetTool.deleteColumn', type: 'request', target: 'column', crudToolMethod: 'deleteColumn', description: '删除指定列。', paramsSchema: { ...TABLE, columnName: 'string — 列名' } }),
  row({ action: 'datasetTool.createTable', type: 'request', target: 'table', crudToolMethod: 'createTable', description: '创建数据表。', paramsSchema: { tableName: 'string — 表名', columns: 'DataColumn[] — 列定义数组', resourceType: 'string?', resourceId: 'string?', views: 'Record<string, IViewMetadata>?' } }),
  row({ action: 'datasetTool.updateTable', type: 'request', target: 'table', crudToolMethod: 'updateTable', description: '更新数据表结构、资源语义及运行配置。', paramsSchema: { ...TABLE, columnsToAdd: 'DataColumn[]?', columnUpdates: 'Array<{ columnName; updates }>?' } }),
  row({ action: 'datasetTool.renameTable', type: 'request', target: 'table', crudToolMethod: 'renameTable', description: '重命名数据表并同步引用。', paramsSchema: { ...TABLE, newTableName: 'string — 新表名' } }),
  row({ action: 'datasetTool.deleteTable', type: 'request', target: 'table', crudToolMethod: 'deleteTable', description: '删除指定数据表。', paramsSchema: TABLE }),
  row({ action: 'datasetTool.listViews', type: 'describe', target: 'view', crudToolMethod: 'listViews', description: '列出指定表全部视图。', paramsSchema: TABLE }),
  row({ action: 'datasetTool.getView', type: 'describe', target: 'view', crudToolMethod: 'getView', description: '获取指定视图。', paramsSchema: VIEW }),
  row({ action: 'datasetTool.createView', type: 'request', target: 'view', crudToolMethod: 'createView', description: '创建非 default 视图。', paramsSchema: { ...VIEW, config: 'IViewMetadata?' } }),
  row({ action: 'datasetTool.updateView', type: 'request', target: 'view', crudToolMethod: 'updateView', description: '更新视图元数据配置。', paramsSchema: { ...VIEW, updates: 'IViewMetadata — 更新内容' } }),
  row({ action: 'datasetTool.deleteView', type: 'request', target: 'view', crudToolMethod: 'deleteView', description: '删除指定视图。', paramsSchema: VIEW }),
  row({ action: 'datasetTool.listRows', type: 'describe', target: 'row', crudToolMethod: 'listRows', description: '列出指定视图当前行。', paramsSchema: VIEW }),
  row({ action: 'datasetTool.getRow', type: 'describe', target: 'row', crudToolMethod: 'getRow', description: '按主键读取一行。', paramsSchema: { ...VIEW, id: 'string | number — 主键值' } }),
  row({ action: 'datasetTool.createRow', type: 'request', target: 'row', crudToolMethod: 'createRow', description: '创建一行数据。', paramsSchema: { ...VIEW, row: 'IDataRow — 行对象' } }),
  row({ action: 'datasetTool.createRows', type: 'request', target: 'row', crudToolMethod: 'createRows', description: '批量创建行数据。', paramsSchema: { ...VIEW, rows: 'IDataRow[] — 行数组' } }),
  row({ action: 'datasetTool.updateRow', type: 'request', target: 'row', crudToolMethod: 'updateRow', description: '更新一行数据。', paramsSchema: { ...VIEW, id: 'string | number', updates: 'Record<string, unknown>' } }),
  row({ action: 'datasetTool.updateRows', type: 'request', target: 'row', crudToolMethod: 'updateRows', description: '批量更新行数据。', paramsSchema: { ...VIEW, items: 'Array<{ id; updates }>' } }),
  row({ action: 'datasetTool.deleteRow', type: 'request', target: 'row', crudToolMethod: 'deleteRow', description: '删除一行数据。', paramsSchema: { ...VIEW, id: 'string | number' } }),
  row({ action: 'datasetTool.deleteRows', type: 'request', target: 'row', crudToolMethod: 'deleteRows', description: '批量删除行数据。', paramsSchema: { ...VIEW, ids: 'Array<string | number>' } }),
  row({ action: 'datasetTool.listRelations', type: 'describe', target: 'relation', crudToolMethod: 'listRelations', description: '列出全部表关系。' }),
  row({ action: 'datasetTool.getRelation', type: 'describe', target: 'relation', crudToolMethod: 'getRelation', description: '读取指定关系。', paramsSchema: { parentTable: 'string', childTable: 'string', parentField: 'string?', childField: 'string?' } }),
  row({ action: 'datasetTool.createRelation', type: 'request', target: 'relation', crudToolMethod: 'createRelation', description: '创建表关系。', paramsSchema: { parentTable: 'string', childTable: 'string', parentField: 'string', childField: 'string' } }),
  row({ action: 'datasetTool.updateRelation', type: 'request', target: 'relation', crudToolMethod: 'updateRelation', description: '更新表关系。', paramsSchema: { selector: 'RelationSelector', updates: 'RelationUpdate' } }),
  row({ action: 'datasetTool.deleteRelation', type: 'request', target: 'relation', crudToolMethod: 'deleteRelation', description: '删除表关系。', paramsSchema: { parentTable: 'string', childTable: 'string', parentField: 'string?', childField: 'string?' } }),
  row({ action: 'datasetTool.listDependencies', type: 'describe', target: 'dependency', crudToolMethod: 'listDependencies', description: '列出视图依赖。' }),
  row({ action: 'datasetTool.getDependency', type: 'describe', target: 'dependency', crudToolMethod: 'getDependency', description: '读取指定视图依赖。', paramsSchema: { parentTable: 'string', childTable: 'string' } }),
  row({ action: 'datasetTool.createDependency', type: 'request', target: 'dependency', crudToolMethod: 'createDependency', description: '创建视图依赖。', paramsSchema: { parentTable: 'string', childTable: 'string', dependencyType: 'string?' } }),
  row({ action: 'datasetTool.updateDependency', type: 'request', target: 'dependency', crudToolMethod: 'updateDependency', description: '更新视图依赖。', paramsSchema: { parentTable: 'string', childTable: 'string', updates: 'ViewDependencyUpdate' } }),
  row({ action: 'datasetTool.deleteDependency', type: 'request', target: 'dependency', crudToolMethod: 'deleteDependency', description: '删除视图依赖。', paramsSchema: { parentTable: 'string', childTable: 'string' } }),
  row({ action: 'datasetTool.listAggregates', type: 'describe', target: 'view', crudToolMethod: 'listAggregates', description: '列出视图聚合配置。', paramsSchema: VIEW }),
  row({ action: 'datasetTool.getAggregate', type: 'describe', target: 'view', crudToolMethod: 'getAggregate', description: '读取单个聚合配置。', paramsSchema: { ...VIEW, aggregateKey: 'string — 聚合输出键' } }),
  row({ action: 'datasetTool.addAggregate', type: 'request', target: 'view', crudToolMethod: 'addAggregate', description: '新增聚合配置。', paramsSchema: { ...VIEW, aggregateKey: 'string', aggregate: 'AggregateColumnConfig' } }),
  row({ action: 'datasetTool.updateAggregate', type: 'request', target: 'view', crudToolMethod: 'updateAggregate', description: '更新聚合配置。', paramsSchema: { ...VIEW, aggregateKey: 'string', updates: 'Partial<AggregateColumnConfig>' } }),
  row({ action: 'datasetTool.removeAggregate', type: 'request', target: 'view', crudToolMethod: 'removeAggregate', description: '删除聚合配置。', paramsSchema: { ...VIEW, aggregateKey: 'string' } }),
  row({ action: 'datasetTool.getComputeExpression', type: 'describe', target: 'column', crudToolMethod: 'getComputeExpression', description: '读取计算列表达式。', paramsSchema: { ...TABLE, columnName: 'string' } }),
  row({ action: 'datasetTool.setComputeExpression', type: 'request', target: 'column', crudToolMethod: 'setComputeExpression', description: '设置计算列表达式。', paramsSchema: { ...TABLE, columnName: 'string', expression: 'string' } }),
  row({ action: 'datasetTool.clearComputeExpression', type: 'request', target: 'column', crudToolMethod: 'clearComputeExpression', description: '清除计算列表达式。', paramsSchema: { ...TABLE, columnName: 'string' } }),
] as const satisfies readonly PageModelDatasetToolRow[]

export function getPageModelDatasetToolRow(action: string): PageModelDatasetToolRow | undefined {
  return PAGE_MODEL_DATASET_TOOL_ROWS.find((entry) => entry.action === action)
}
