/**
 * Dependency Methods — dependency.add / remove
 */

import type { StillDefinition, StillContext, StillResult, ViewDependency } from '../types'

// ─── dependency.add ────────────────────────────────────────

interface DependencyAddParams {
  parentTable: string
  childTable: string
  parentView?: string
  childView?: string
  dependencyType?: ViewDependency['dependencyType']
  autoLoad?: boolean
}

export const dependencyAdd: StillDefinition<DependencyAddParams, unknown> = {
  action: 'dependency.add',
  type: 'request',
  description: '添加 ViewDependency（级联类型默认 currentRow）',
  guard: { requireBlueprint: true, requireSchemaLocked: true },
  paramsSchema: {
    parentTable: 'string',
    childTable: 'string',
    parentView: 'string? — 默认 default',
    childView: 'string? — 默认 default',
    dependencyType: '"currentRow" | "selectedRows" | "allRows" | "pagedRows" — 默认 currentRow',
    autoLoad: 'boolean? — 默认 true',
  },
  example: {
    parentTable: 'Orders',
    childTable: 'OrderItems',
    dependencyType: 'currentRow',
  },
  validate: (params) => {
    if (!params.parentTable) return '缺少 parentTable'
    if (!params.childTable) return '缺少 childTable'
    const valid = ['currentRow', 'selectedRows', 'allRows', 'pagedRows']
    if (params.dependencyType !== undefined && !valid.includes(params.dependencyType)) {
      return `dependencyType 必须是 ${valid.join('|')}`
    }
    return null
  },
  execute: (ctx: StillContext, params: DependencyAddParams): StillResult => {
    const ds = ctx.session.dataset
    if (ds === null) return { ok: false, code: 'NO_DATASET', msg: 'Dataset 未初始化', fix: '请先执行 dataset.init' }

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
      (d) =>
        d.parentTable === params.parentTable &&
        d.childTable === params.childTable,
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
  },
}

// ─── dependency.remove ─────────────────────────────────────

interface DependencyRemoveParams {
  parentTable: string
  childTable: string
  parentView?: string
  childView?: string
}

export const dependencyRemove: StillDefinition<DependencyRemoveParams, unknown> = {
  action: 'dependency.remove',
  type: 'request',
  description: '删除 ViewDependency',
  guard: { requireBlueprint: true, requireSchemaLocked: true },
  paramsSchema: {
    parentTable: 'string',
    childTable: 'string',
    parentView: 'string? — 默认 default',
    childView: 'string? — 默认 default',
  },
  validate: (params) => {
    if (!params.parentTable) return '缺少 parentTable'
    if (!params.childTable) return '缺少 childTable'
    return null
  },
  execute: (ctx: StillContext, params: DependencyRemoveParams): StillResult => {
    const ds = ctx.session.dataset
    if (ds === null) return { ok: false, code: 'NO_DATASET', msg: 'Dataset 未初始化', fix: '请先执行 dataset.init' }
    ds.viewDependencies ??= []

    const idx = ds.viewDependencies.findIndex(
      (d) =>
        d.parentTable === params.parentTable &&
        d.childTable === params.childTable,
    )

    if (idx < 0) {
      return { ok: false, code: 'DEPENDENCY_NOT_FOUND', msg: '依赖不存在', fix: '请确认参数' }
    }

    ds.viewDependencies.splice(idx, 1)

    return {
      ok: true,
      data: {
        status: 'ok',
        parentTable: params.parentTable,
        childTable: params.childTable,
        dependencyCount: ds.viewDependencies.length,
      },
      summary: `删除依赖 ${params.parentTable}→${params.childTable}`,
    }
  },
}
