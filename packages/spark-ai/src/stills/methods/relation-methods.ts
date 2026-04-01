/**
 * Relation Methods — relation.add / remove / list
 */

import type { StillDefinition, StillContext, StillResult, TableRelation } from '../types'

// ─── relation.add ──────────────────────────────────────────

interface RelationAddParams {
  parentTable: string
  childTable: string
  parentField: string
  childField: string
  relationName?: string
}

export const relationAdd: StillDefinition<RelationAddParams, unknown> = {
  action: 'relation.add',
  type: 'request',
  description: '添加 TableRelation',
  guard: { requireBlueprint: true, requireSchemaUnlocked: true },
  paramsSchema: {
    parentTable: 'string',
    childTable: 'string',
    parentField: 'string',
    childField: 'string',
    relationName: 'string? — 可选关系名',
  },
  example: {
    parentTable: 'Orders',
    childTable: 'OrderItems',
    parentField: 'id',
    childField: 'orderId',
  },
  validate: (params) => {
    if (!params.parentTable) return '缺少 parentTable'
    if (!params.childTable) return '缺少 childTable'
    if (!params.parentField) return '缺少 parentField'
    if (!params.childField) return '缺少 childField'
    return null
  },
  execute: (ctx: StillContext, params: RelationAddParams): StillResult => {
    const ds = ctx.session.dataset
    if (ds === null) return { ok: false, code: 'NO_DATASET', msg: 'Dataset 未初始化', fix: '请先执行 dataset.init' }
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
      (r) => r.parentTable === params.parentTable && r.childTable === params.childTable &&
             r.parentField === params.parentField && r.childField === params.childField,
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
  },
}

// ─── relation.remove ───────────────────────────────────────

interface RelationRemoveParams {
  parentTable: string
  childTable: string
}

export const relationRemove: StillDefinition<RelationRemoveParams, unknown> = {
  action: 'relation.remove',
  type: 'request',
  description: '删除 TableRelation（校验 viewDependency 引用）',
  guard: { requireBlueprint: true, requireSchemaUnlocked: true },
  paramsSchema: { parentTable: 'string', childTable: 'string' },
  validate: (params) => {
    if (!params.parentTable) return '缺少 parentTable'
    if (!params.childTable) return '缺少 childTable'
    return null
  },
  execute: (ctx: StillContext, params: RelationRemoveParams): StillResult => {
    const ds = ctx.session.dataset
    if (ds === null) return { ok: false, code: 'NO_DATASET', msg: 'Dataset 未初始化', fix: '请先执行 dataset.init' }
    ds.tableRelations ??= []

    const idx = ds.tableRelations.findIndex(
      (r) => r.parentTable === params.parentTable && r.childTable === params.childTable,
    )
    if (idx < 0) {
      return { ok: false, code: 'RELATION_NOT_FOUND', msg: '关系不存在', fix: '请查 relation.list' }
    }

    // 检查 viewDependency 引用
    const depImpact = (ds.viewDependencies ?? []).filter(
      (d) => d.parentTable === params.parentTable && d.childTable === params.childTable,
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
      data: {
        status: 'ok',
        parentTable: params.parentTable,
        childTable: params.childTable,
        relationCount: ds.tableRelations.length,
      },
      summary: `删除关系 ${params.parentTable}→${params.childTable}`,
    }
  },
}

// ─── relation.list ─────────────────────────────────────────

export const relationList: StillDefinition<Record<string, never>, unknown> = {
  action: 'relation.list',
  type: 'describe',
  description: '列出所有 tableRelations',
  guard: {},
  example: {},
  validate: () => null,
  execute: (ctx: StillContext): StillResult => {
    const rels = ctx.session.dataset?.tableRelations ?? []
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
  },
}
