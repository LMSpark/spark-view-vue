/**
 * DataTable Methods — datatable.create / describe / addColumns / updateColumn / removeColumn / setApi / addRows
 */

import type { StillDefinition, StillContext, StillResult } from '../types'
import type { DataColumn, ITableMetadata, IViewMetadata, CrudApi } from '@spark-view/spark-data'

// ─── datatable.create ──────────────────────────────────────

interface DatatableCreateParams {
  tableName: string
  columns: DataColumn[]
}

export const datatableCreate: StillDefinition<DatatableCreateParams, unknown> = {
  action: 'datatable.create',
  type: 'request',
  description: '添加一张表（tableName + columns）',
  guard: { requireBlueprint: true, requireSchemaUnlocked: true },
  paramsSchema: {
    tableName: 'string — 表名',
    columns: 'DataColumn[] — 列定义（name/type/isPrimaryKey/label 等）',
  },
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
  execute: (ctx: StillContext, params: DatatableCreateParams): StillResult => {
    const ds = ctx.session.dataset
    if (ds === null) return { ok: false, code: 'NO_DATASET', msg: 'Dataset 未初始化', fix: '请先执行 dataset.init' }
    if (params.tableName in ds.tables) {
      return {
        ok: false,
        code: 'TABLE_EXISTS',
        msg: `表 ${params.tableName} 已存在`,
        fix: '使用 datatable.addColumns 向已有表追加列',
      }
    }

    const defaultView: IViewMetadata = {
      tableName: params.tableName,
      viewId: 'default',
    }

    const table: ITableMetadata = {
      tableName: params.tableName,
      columns: params.columns,
      views: { default: defaultView },
    }

    ds.tables[params.tableName] = table

    const computedCols = params.columns.filter((c) => c.computeExpression !== undefined)

    return {
      ok: true,
      data: {
        status: 'ok',
        tableName: params.tableName,
        columnCount: params.columns.length,
        columns: params.columns.map((c) => c.name),
        ...(computedCols.length > 0 ? { computedColumns: computedCols.map((c) => c.name) } : {}),
      },
      summary: `建表 ${params.tableName}（${params.columns.length} 列）`,
    }
  },
}

// ─── datatable.describe ────────────────────────────────────

interface DatatableDescribeParams {
  tableName: string
}

export const datatableDescribe: StillDefinition<DatatableDescribeParams, unknown> = {
  action: 'datatable.describe',
  type: 'describe',
  description: '返回指定表详情（列清单/关系/API/视图数）',
  guard: {},
  paramsSchema: { tableName: 'string — 表名' },
  example: { tableName: 'Orders' },
  validate: (params) => {
    if (!params.tableName || typeof params.tableName !== 'string') return '缺少 tableName'
    return null
  },
  execute: (ctx: StillContext, params: DatatableDescribeParams): StillResult => {
    const ds = ctx.session.dataset
    if (ds === null) return { ok: false, code: 'NO_DATASET', msg: 'Dataset 未初始化', fix: '请先执行 dataset.init' }
    const table = ds.tables[params.tableName]
    if (!table) {
      return {
        ok: false,
        code: 'TABLE_NOT_FOUND',
        msg: `表 ${params.tableName} 不存在`,
        fix: '请查 dataset.describe 确认已有表名',
      }
    }

    const relations = (ds.tableRelations ?? []).filter(
      (r) => r.parentTable === params.tableName || r.childTable === params.tableName,
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
      summary: `表 ${params.tableName} 详情`,
    }
  },
}

// ─── datatable.addColumns ──────────────────────────────────

interface AddColumnsParams {
  tableName: string
  columns: DataColumn[]
}

export const datatableAddColumns: StillDefinition<AddColumnsParams, unknown> = {
  action: 'datatable.addColumns',
  type: 'request',
  description: '向已有表追加列（同名列不覆盖）',
  guard: { requireBlueprint: true, requireSchemaUnlocked: true },
  paramsSchema: {
    tableName: 'string',
    columns: 'DataColumn[]',
  },
  validate: (params) => {
    if (!params.tableName) return '缺少 tableName'
    if (!Array.isArray(params.columns) || params.columns.length === 0) return '缺少 columns'
    return null
  },
  execute: (ctx: StillContext, params: AddColumnsParams): StillResult => {
    const ds = ctx.session.dataset
    if (ds === null) return { ok: false, code: 'NO_DATASET', msg: 'Dataset 未初始化', fix: '请先执行 dataset.init' }
    const table = ds.tables[params.tableName]
    if (!table) {
      return {
        ok: false,
        code: 'TABLE_NOT_FOUND',
        msg: `表 ${params.tableName} 不存在`,
        fix: '请先 datatable.create 建表',
      }
    }

    const existingNames = new Set(table.columns.map((c) => c.name))
    const added: string[] = []
    const skipped: string[] = []

    for (const col of params.columns) {
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
        tableName: params.tableName,
        added,
        skipped,
        totalColumns: table.columns.length,
      },
      summary: `追加 ${added.length} 列到 ${params.tableName}${skipped.length > 0 ? `（跳过 ${skipped.length} 个重名列）` : ''}`,
    }
  },
}

// ─── datatable.updateColumn ────────────────────────────────

interface UpdateColumnParams {
  tableName: string
  columnName: string
  updates: Partial<DataColumn>
}

export const datatableUpdateColumn: StillDefinition<UpdateColumnParams, unknown> = {
  action: 'datatable.updateColumn',
  type: 'request',
  description: '修改单列属性（type/label/computeExpression 等）',
  guard: { requireBlueprint: true, requireSchemaUnlocked: true },
  paramsSchema: {
    tableName: 'string',
    columnName: 'string',
    updates: 'Partial<DataColumn> — 要修改的字段',
  },
  validate: (params) => {
    if (!params.tableName) return '缺少 tableName'
    if (!params.columnName) return '缺少 columnName'
    if (Object.keys(params.updates).length === 0) return '缺少 updates'
    return null
  },
  execute: (ctx: StillContext, params: UpdateColumnParams): StillResult => {
    const ds = ctx.session.dataset
    if (ds === null) return { ok: false, code: 'NO_DATASET', msg: 'Dataset 未初始化', fix: '请先执行 dataset.init' }
    const table = ds.tables[params.tableName]
    if (!table) {
      return { ok: false, code: 'TABLE_NOT_FOUND', msg: `表 ${params.tableName} 不存在`, fix: '请查 dataset.describe' }
    }

    const col = table.columns.find((c) => c.name === params.columnName)
    if (!col) {
      return { ok: false, code: 'COLUMN_NOT_FOUND', msg: `列 ${params.columnName} 不存在`, fix: '请查 datatable.describe' }
    }

    // 不允许修改 name（重命名需删后重建）
    const { name: _name, ...safeUpdates } = params.updates
    Object.assign(col, safeUpdates)

    return {
      ok: true,
      data: {
        status: 'ok',
        tableName: params.tableName,
        columnName: params.columnName,
        updatedFields: Object.keys(safeUpdates),
      },
      summary: `更新 ${params.tableName}.${params.columnName}: ${Object.keys(safeUpdates).join(', ')}`,
    }
  },
}

// ─── datatable.removeColumn ────────────────────────────────

interface RemoveColumnParams {
  tableName: string
  columnName: string
}

export const datatableRemoveColumn: StillDefinition<RemoveColumnParams, unknown> = {
  action: 'datatable.removeColumn',
  type: 'request',
  description: '删除列（校验关系/视图引用，返回 impact）',
  guard: { requireBlueprint: true, requireSchemaUnlocked: true },
  paramsSchema: { tableName: 'string', columnName: 'string' },
  validate: (params) => {
    if (!params.tableName) return '缺少 tableName'
    if (!params.columnName) return '缺少 columnName'
    return null
  },
  execute: (ctx: StillContext, params: RemoveColumnParams): StillResult => {
    const ds = ctx.session.dataset
    if (ds === null) return { ok: false, code: 'NO_DATASET', msg: 'Dataset 未初始化', fix: '请先执行 dataset.init' }
    const table = ds.tables[params.tableName]
    if (!table) {
      return { ok: false, code: 'TABLE_NOT_FOUND', msg: `表 ${params.tableName} 不存在`, fix: '请查 dataset.describe' }
    }

    const idx = table.columns.findIndex((c) => c.name === params.columnName)
    if (idx < 0) {
      return { ok: false, code: 'COLUMN_NOT_FOUND', msg: `列 ${params.columnName} 不存在`, fix: '请查 datatable.describe' }
    }

    // 检查关系引用
    const relImpact = (ds.tableRelations ?? []).filter(
      (r) =>
        (r.parentTable === params.tableName && r.parentField === params.columnName) ||
        (r.childTable === params.tableName && r.childField === params.columnName),
    )

    if (relImpact.length > 0) {
      return {
        ok: false,
        code: 'COLUMN_IN_USE',
        msg: `列 ${params.columnName} 被 ${relImpact.length} 条关系引用`,
        fix: '请先 relation.remove 相关关系后再删除此列',
      }
    }

    table.columns.splice(idx, 1)

    return {
      ok: true,
      data: {
        status: 'ok',
        tableName: params.tableName,
        columnName: params.columnName,
        remainingColumns: table.columns.length,
      },
      summary: `删除列 ${params.tableName}.${params.columnName}`,
    }
  },
}

// ─── datatable.setApi ──────────────────────────────────────

interface SetApiParams {
  tableName: string
  api: CrudApi
}

export const datatableSetApi: StillDefinition<SetApiParams, unknown> = {
  action: 'datatable.setApi',
  type: 'request',
  description: '设置表的 CrudApi 配置',
  guard: { requireBlueprint: true, requireSchemaLocked: true },
  paramsSchema: {
    tableName: 'string',
    api: 'CrudApi — { list?, create?, update?, delete?, ... }',
  },
  example: {
    tableName: 'Orders',
    api: {
      list: { url: '/api/orders', method: 'GET' },
      create: { url: '/api/orders', method: 'POST' },
    },
  },
  validate: (params) => {
    if (!params.tableName) return '缺少 tableName'
    if (Object.keys(params.api).length === 0) return '缺少 api'
    return null
  },
  execute: (ctx: StillContext, params: SetApiParams): StillResult => {
    const ds = ctx.session.dataset
    if (ds === null) return { ok: false, code: 'NO_DATASET', msg: 'Dataset 未初始化', fix: '请先执行 dataset.init' }
    const table = ds.tables[params.tableName]
    if (!table) {
      return { ok: false, code: 'TABLE_NOT_FOUND', msg: `表 ${params.tableName} 不存在`, fix: '请查 dataset.describe' }
    }

    table.api = params.api

    const endpoints = Object.keys(params.api).filter(
      (k) => params.api[k as keyof CrudApi] !== undefined,
    )

    return {
      ok: true,
      data: {
        status: 'ok',
        tableName: params.tableName,
        endpoints,
      },
      summary: `设置 ${params.tableName} API: ${endpoints.join(', ')}`,
    }
  },
}

// ─── datatable.addRows ─────────────────────────────────────

interface AddRowsParams {
  tableName: string
  rows: Array<Record<string, unknown>>
}

export const datatableAddRows: StillDefinition<AddRowsParams, unknown> = {
  action: 'datatable.addRows',
  type: 'request',
  description: '写入内联静态行（枚举/配置表用）',
  guard: { requireBlueprint: true },
  paramsSchema: {
    tableName: 'string',
    rows: 'Array<Record<string, unknown>>',
  },
  validate: (params) => {
    if (!params.tableName) return '缺少 tableName'
    if (!Array.isArray(params.rows) || params.rows.length === 0) return '缺少 rows'
    return null
  },
  execute: (ctx: StillContext, params: AddRowsParams): StillResult => {
    const ds = ctx.session.dataset
    if (ds === null) return { ok: false, code: 'NO_DATASET', msg: 'Dataset 未初始化', fix: '请先执行 dataset.init' }
    const table = ds.tables[params.tableName]
    if (!table) {
      return { ok: false, code: 'TABLE_NOT_FOUND', msg: `表 ${params.tableName} 不存在`, fix: '请查 dataset.describe' }
    }

    // 写入 default view 的 rows
    table.views.default.rows ??= []
    table.views.default.rows.push(...params.rows)

    return {
      ok: true,
      data: {
        status: 'ok',
        tableName: params.tableName,
        addedRows: params.rows.length,
        totalRows: table.views.default.rows.length,
      },
      summary: `写入 ${params.rows.length} 行到 ${params.tableName}`,
    }
  },
}
