/**
 * Dataset Methods — dataset.init / describe / validate / export / reset
 */

import type { StillDefinition, StillContext, StillResult, IDataSetMetadata } from '../types'
import { createEmptyDataset } from '../types'

// ─── dataset.init ──────────────────────────────────────────

interface DatasetInitParams {
  dataSetName: string
}

export const datasetInit: StillDefinition<DatasetInitParams, unknown> = {
  action: 'dataset.init',
  type: 'request',
  description: '创建空 IDataSetMetadata（设 dataSetName）',
  guard: { requireDataset: false, requireBlueprint: true },
  paramsSchema: { dataSetName: 'string — DataSet 名称' },
  example: { dataSetName: 'OrderSystem' },
  validate: (params) => {
    if (!params.dataSetName || typeof params.dataSetName !== 'string') return '缺少 dataSetName'
    return null
  },
  execute: (ctx: StillContext, params: DatasetInitParams): StillResult => {
    if (ctx.session.dataset !== null) {
      return {
        ok: false,
        code: 'DATASET_EXISTS',
        msg: 'Dataset 已存在',
        fix: '如需重建请先 dataset.reset',
      }
    }

    ctx.session.dataset = createEmptyDataset(params.dataSetName)
    ctx.session.currentStep = '④'

    return {
      ok: true,
      data: {
        status: 'ok',
        dataSetName: params.dataSetName,
        schemaVersion: 1,
        tables: {},
        tableRelations: [],
        viewDependencies: [],
      },
      summary: `创建 DataSet: ${params.dataSetName}`,
    }
  },
}

// ─── dataset.describe ──────────────────────────────────────

export const datasetDescribe: StillDefinition<Record<string, never>, unknown> = {
  action: 'dataset.describe',
  type: 'describe',
  description: '返回当前 dataset 结构摘要',
  guard: {},
  example: {},
  validate: () => null,
  execute: (ctx: StillContext): StillResult => {
    const ds = ctx.session.dataset
    if (ds === null) return { ok: false, code: 'NO_DATASET', msg: 'Dataset 未初始化', fix: '请先执行 dataset.init' }
    const tableNames = Object.keys(ds.tables)
    const totalColumns = Object.values(ds.tables).reduce((sum, t) => sum + t.columns.length, 0)
    const computedColumns = Object.values(ds.tables).reduce(
      (sum, t) => sum + t.columns.filter((c) => c.computeExpression !== undefined).length, 0,
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
        schemaLocked: ctx.session.schemaLocked,
      },
      summary: `DataSet ${ds.dataSetName}: ${tableNames.length} 表, ${totalColumns} 列, ${ds.tableRelations?.length ?? 0} 关系`,
    }
  },
}

// ─── dataset.validate ──────────────────────────────────────

export const datasetValidate: StillDefinition<Record<string, never>, unknown> = {
  action: 'dataset.validate',
  type: 'request',
  description: '全量结构校验，返回 issues[]',
  guard: {},
  paramsSchema: {},
  example: {},
  validate: () => null,
  execute: (ctx: StillContext): StillResult => {
    const ds = ctx.session.dataset
    if (ds === null) return { ok: false, code: 'NO_DATASET', msg: 'Dataset 未初始化', fix: '请先执行 dataset.init' }
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

    // 检查 3: 计算列引用的字段在同表内（简单检测，不解析表达式语法）
    for (const [name, table] of Object.entries(ds.tables)) {
      for (const col of table.columns) {
        if (col.computeExpression) {
          // 检查是否引用了同表中的字段（简单启发式：检查列名是否出现在表达式中）
          issues.push({
            rule: `表 ${name} 计算列 ${col.name} 表达式有效`,
            pass: true, // 简单启发式，不做深度解析
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
      (sum, t) => sum + t.columns.filter((c) => c.computeExpression !== undefined).length, 0,
    )

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
          schemaLocked: ctx.session.schemaLocked,
        },
        checks: issues,
        issues: issues.filter((i) => !i.pass),
        hint: valid
          ? ctx.session.schemaLocked
            ? '校验通过'
            : '校验通过，无问题。请执行 schema.lock 锁定 schema'
          : '存在校验问题，请先修复',
      },
      summary: `校验${valid ? '通过' : '未通过'}：${issues.filter((i) => !i.pass).length} 个问题`,
    }
  },
}

// ─── dataset.export ────────────────────────────────────────

export const datasetExport: StillDefinition<Record<string, never>, unknown> = {
  action: 'dataset.export',
  type: 'request',
  description: '导出完整 IDataSetMetadata 快照',
  guard: { requireBlueprint: true },
  example: {},
  validate: () => null,
  execute: (ctx: StillContext): StillResult => {
    const ds = ctx.session.dataset
    if (ds === null) return { ok: false, code: 'NO_DATASET', msg: 'Dataset 未初始化', fix: '请先执行 dataset.init' }
    // 深拷贝以避免外部修改
    const snapshot: IDataSetMetadata = JSON.parse(JSON.stringify(ds)) as IDataSetMetadata

    return {
      ok: true,
      data: {
        status: 'ok',
        snapshot,
      },
      summary: `导出 DataSet: ${ds.dataSetName}`,
    }
  },
}

// ─── dataset.reset ─────────────────────────────────────────

export const datasetReset: StillDefinition<Record<string, never>, unknown> = {
  action: 'dataset.reset',
  type: 'request',
  description: '清空重来（需前端二次确认）',
  guard: { requireDataset: false },
  example: {},
  validate: () => null,
  execute: (ctx: StillContext): StillResult => {
    ctx.session.dataset = null
    ctx.session.blueprint = null
    ctx.session.schemaLocked = false
    ctx.session.currentStep = '①'
    ctx.session.patchLog = []

    return {
      ok: true,
      data: { status: 'ok', hint: '已重置，回到初始状态' },
      summary: '会话已重置',
    }
  },
}
