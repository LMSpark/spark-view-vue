/**
 * DataView Methods — dataview.create / describe / configure / setAggregates / setTreeConfig
 */

import type { StillDefinition, StillContext, StillResult } from '../types'
import type { IViewMetadata, AggregateColumnConfig, TreeConfig } from '@spark-view/spark-data'

// ─── dataview.create ───────────────────────────────────────

interface DataviewCreateParams {
  tableName: string
  viewId: string
}

export const dataviewCreate: StillDefinition<DataviewCreateParams, unknown> = {
  action: 'dataview.create',
  type: 'request',
  description: '为表添加自定义 DataView（default 视图在建表时已自动创建）',
  guard: { requireBlueprint: true, requireSchemaLocked: true },
  paramsSchema: { tableName: 'string', viewId: 'string' },
  example: { tableName: 'Orders', viewId: 'grid' },
  validate: (params) => {
    if (!params.tableName) return '缺少 tableName'
    if (!params.viewId) return '缺少 viewId'
    return null
  },
  execute: (ctx: StillContext, params: DataviewCreateParams): StillResult => {
    const ds = ctx.session.dataset
    if (ds === null) return { ok: false, code: 'NO_DATASET', msg: 'Dataset 未初始化', fix: '请先执行 dataset.init' }
    const table = ds.tables[params.tableName]
    if (!table) {
      return { ok: false, code: 'TABLE_NOT_FOUND', msg: `表 ${params.tableName} 不存在`, fix: '请确认表名' }
    }
    if (params.viewId in table.views) {
      return { ok: false, code: 'VIEW_EXISTS', msg: `视图 ${params.viewId} 已存在`, fix: '请用 dataview.configure 配置' }
    }

    table.views[params.viewId] = {}

    return {
      ok: true,
      data: { tableName: params.tableName, viewId: params.viewId, viewCount: Object.keys(table.views).length },
      summary: `创建视图 ${params.tableName}:${params.viewId}`,
    }
  },
}

// ─── dataview.describe ─────────────────────────────────────

interface DataviewDescribeParams {
  tableName: string
  viewId?: string
}

export const dataviewDescribe: StillDefinition<DataviewDescribeParams, unknown> = {
  action: 'dataview.describe',
  type: 'describe',
  description: '查看视图配置详情',
  guard: {},
  paramsSchema: { tableName: 'string', viewId: 'string? — 默认 default' },
  validate: (params) => {
    if (!params.tableName) return '缺少 tableName'
    return null
  },
  execute: (ctx: StillContext, params: DataviewDescribeParams): StillResult => {
    const ds = ctx.session.dataset
    if (ds === null) return { ok: false, code: 'NO_DATASET', msg: 'Dataset 未初始化', fix: '请先执行 dataset.init' }
    const table = ds.tables[params.tableName]
    if (!table) {
      return { ok: false, code: 'TABLE_NOT_FOUND', msg: `表 ${params.tableName} 不存在`, fix: '请确认表名' }
    }
    const vid = params.viewId ?? 'default'
    const view = table.views[vid]
    if (!view) {
      return { ok: false, code: 'VIEW_NOT_FOUND', msg: `视图 ${vid} 不存在`, fix: '请用 dataview.create 创建' }
    }

    return {
      ok: true,
      data: {
        tableName: params.tableName,
        viewId: vid,
        config: view,
        viewIds: Object.keys(table.views),
      },
      summary: `视图 ${params.tableName}:${vid}`,
    }
  },
}

// ─── dataview.configure ────────────────────────────────────

interface DataviewConfigureParams {
  tableName: string
  viewId?: string
  config: Partial<IViewMetadata>
}

export const dataviewConfigure: StillDefinition<DataviewConfigureParams, unknown> = {
  action: 'dataview.configure',
  type: 'request',
  description: '配置视图属性（autoLoad / autoCurrentFirst / pageSize / rows 等）',
  guard: { requireBlueprint: true, requireSchemaLocked: true },
  paramsSchema: {
    tableName: 'string',
    viewId: 'string? — 默认 default',
    config: 'Partial<IViewMetadata> — autoLoad / autoCurrentFirst / pageSize / filterExpression / sortExpression / rows',
  },
  example: { tableName: 'Orders', config: { autoLoad: true, autoCurrentFirst: true, pageSize: 20 } },
  validate: (params) => {
    if (!params.tableName) return '缺少 tableName'
    return null
  },
  execute: (ctx: StillContext, params: DataviewConfigureParams): StillResult => {
    const ds = ctx.session.dataset
    if (ds === null) return { ok: false, code: 'NO_DATASET', msg: 'Dataset 未初始化', fix: '请先执行 dataset.init' }
    const table = ds.tables[params.tableName]
    if (!table) {
      return { ok: false, code: 'TABLE_NOT_FOUND', msg: `表 ${params.tableName} 不存在`, fix: '请确认表名' }
    }
    const vid = params.viewId ?? 'default'
    const view = table.views[vid]
    if (!view) {
      return { ok: false, code: 'VIEW_NOT_FOUND', msg: `视图 ${vid} 不存在`, fix: '请先 dataview.create' }
    }

    Object.assign(view, params.config)

    return {
      ok: true,
      data: { tableName: params.tableName, viewId: vid, config: view },
      summary: `配置视图 ${params.tableName}:${vid}（${Object.keys(params.config).join(', ')}）`,
    }
  },
}

// ─── dataview.setAggregates ────────────────────────────────

interface SetAggregatesParams {
  tableName: string
  viewId?: string
  aggregates: Record<string, AggregateColumnConfig>
}

export const dataviewSetAggregates: StillDefinition<SetAggregatesParams, unknown> = {
  action: 'dataview.setAggregates',
  type: 'request',
  description: '设置视图级聚合列',
  guard: { requireBlueprint: true, requireSchemaLocked: true },
  paramsSchema: {
    tableName: 'string',
    viewId: 'string? — 默认 default',
    aggregates: 'Record<string, AggregateColumnConfig> — 如 { price: { type: "sum" } }',
  },
  example: {
    tableName: 'Orders',
    aggregates: { price: { type: 'sum' }, score: { type: 'avg' } },
  },
  validate: (params) => {
    if (!params.tableName) return '缺少 tableName'
    return null
  },
  execute: (ctx: StillContext, params: SetAggregatesParams): StillResult => {
    const ds = ctx.session.dataset
    if (ds === null) return { ok: false, code: 'NO_DATASET', msg: 'Dataset 未初始化', fix: '请先执行 dataset.init' }
    const table = ds.tables[params.tableName]
    if (!table) {
      return { ok: false, code: 'TABLE_NOT_FOUND', msg: `表 ${params.tableName} 不存在`, fix: '请确认表名' }
    }
    const vid = params.viewId ?? 'default'
    const view = table.views[vid]
    if (!view) {
      return { ok: false, code: 'VIEW_NOT_FOUND', msg: `视图 ${vid} 不存在`, fix: '请先 dataview.create' }
    }

    // 校验聚合引用的字段在非计算列中存在
    const colNames = new Set(table.columns.map((c) => c.name))
    const missingFields = Object.entries(params.aggregates)
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

    view.aggregates = params.aggregates

    return {
      ok: true,
      data: {
        tableName: params.tableName,
        viewId: vid,
        aggregates: params.aggregates,
        aggregateCount: Object.keys(params.aggregates).length,
      },
      summary: `设置 ${Object.keys(params.aggregates).length} 个聚合列`,
    }
  },
}

// ─── dataview.setTreeConfig ────────────────────────────────

interface SetTreeConfigParams {
  tableName: string
  viewId?: string
  treeConfig: TreeConfig
}

export const dataviewSetTreeConfig: StillDefinition<SetTreeConfigParams, unknown> = {
  action: 'dataview.setTreeConfig',
  type: 'request',
  description: '设置视图树配置（treeMode / idField / parentIdField / textField）',
  guard: { requireBlueprint: true, requireSchemaLocked: true },
  paramsSchema: {
    tableName: 'string',
    viewId: 'string? — 默认 default',
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
  execute: (ctx: StillContext, params: SetTreeConfigParams): StillResult => {
    const ds = ctx.session.dataset
    if (ds === null) return { ok: false, code: 'NO_DATASET', msg: 'Dataset 未初始化', fix: '请先执行 dataset.init' }
    const table = ds.tables[params.tableName]
    if (!table) {
      return { ok: false, code: 'TABLE_NOT_FOUND', msg: `表 ${params.tableName} 不存在`, fix: '请确认表名' }
    }
    const vid = params.viewId ?? 'default'
    const view = table.views[vid]
    if (!view) {
      return { ok: false, code: 'VIEW_NOT_FOUND', msg: `视图 ${vid} 不存在`, fix: '请先 dataview.create' }
    }

    // 检查树配置引用的字段存在
    const colNames = new Set(table.columns.map((c) => c.name))
    const { idField, parentIdField } = params.treeConfig
    if (idField === undefined || !colNames.has(idField)) {
      return { ok: false, code: 'COLUMN_NOT_FOUND', msg: `idField "${idField ?? ''}" 不存在`, fix: '请检查列名' }
    }
    if (parentIdField === undefined || !colNames.has(parentIdField)) {
      return { ok: false, code: 'COLUMN_NOT_FOUND', msg: `parentIdField "${parentIdField ?? ''}" 不存在`, fix: '请检查列名' }
    }

    view.treeConfig = params.treeConfig

    return {
      ok: true,
      data: { tableName: params.tableName, viewId: vid, treeConfig: params.treeConfig },
      summary: `设置树配置 ${params.tableName}:${vid}（mode=${params.treeConfig.treeMode ?? 'flat'}）`,
    }
  },
}
