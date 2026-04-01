/**
 * Schema Methods — schema.lock / unlock
 */

import type { StillDefinition, StillContext, StillResult } from '../types'

// ─── schema.lock ───────────────────────────────────────────

export const schemaLock: StillDefinition<Record<string, never>, unknown> = {
  action: 'schema.lock',
  type: 'request',
  description: '锁定结构（禁止增删表/列/关系，允许 dataview / dependency / api 配置）',
  guard: { requireBlueprint: true, requireSchemaUnlocked: true },
  example: {},
  validate: () => null,
  execute: (ctx: StillContext): StillResult => {
    const ds = ctx.session.dataset
    if (ds === null) return { ok: false, code: 'NO_DATASET', msg: 'Dataset 未初始化', fix: '请先执行 dataset.init' }
    const tables = Object.keys(ds.tables)
    if (tables.length === 0) {
      return { ok: false, code: 'EMPTY_SCHEMA', msg: '没有任何表，无法锁定', fix: '请先 datatable.create' }
    }

    // 基础完整性检查：每张表至少有一个 PK
    const noPk = tables.filter((t) => !(ds.tables[t]?.columns.some((c) => c.isPrimaryKey) ?? false))
    if (noPk.length > 0) {
      return {
        ok: false,
        code: 'MISSING_PK',
        msg: `以下表缺少主键列: ${noPk.join(', ')}`,
        fix: '请 datatable.addColumns 添加 isPrimaryKey=true 的列',
      }
    }

    ctx.session.schemaLocked = true

    return {
      ok: true,
      data: {
        schemaLocked: true,
        tableCount: tables.length,
        relationCount: (ds.tableRelations ?? []).length,
      },
      summary: `结构已锁定（${tables.length} 表, ${(ds.tableRelations ?? []).length} 关系）`,
    }
  },
}

// ─── schema.unlock ─────────────────────────────────────────

interface SchemaUnlockParams {
  reason?: string
}

export const schemaUnlock: StillDefinition<SchemaUnlockParams, unknown> = {
  action: 'schema.unlock',
  type: 'request',
  description: '解锁结构（需说明原因，允许修改表/列/关系）',
  guard: { requireBlueprint: true, requireSchemaLocked: true },
  paramsSchema: { reason: 'string? — 解锁原因' },
  example: { reason: '需要添加新字段' },
  validate: () => null,
  execute: (ctx: StillContext, params: SchemaUnlockParams): StillResult => {
    ctx.session.schemaLocked = false

    return {
      ok: true,
      data: {
        schemaLocked: false,
        reason: params.reason ?? '未说明',
      },
      summary: `结构已解锁${params.reason ? `（原因: ${params.reason}）` : ''}`,
    }
  },
}
