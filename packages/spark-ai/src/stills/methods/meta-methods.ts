/**
 * Meta Methods — stills.capabilities / stills.actionSpec / session.describe
 */

import type { StillDefinition, StillContext, StillResult } from '../types'
import { getAllStills, getStill } from '../dispatcher'

// ─── stills.capabilities ───────────────────────────────────

export const stillsCapabilities: StillDefinition<Record<string, never>, unknown> = {
  action: 'stills.capabilities',
  type: 'describe',
  description: '返回当前可用动作目录，按命名空间分组',
  guard: { requireDataset: false },
  example: {},
  validate: () => null,
  execute: (): StillResult => {
    const all = getAllStills()
    const actions: Array<{
      name: string
      type: string
      brief: string
      guard?: string
    }> = []

    for (const [, s] of all) {
      const guardHint = s.guard.requireSchemaLocked
        ? 'schemaLocked'
        : s.guard.requireSchemaUnlocked
          ? 'schemaUnlocked'
          : undefined
      actions.push({
        name: s.action,
        type: s.type,
        brief: s.description,
        ...(guardHint ? { guard: guardHint } : {}),
      })
    }

    return {
      ok: true,
      data: {
        actions,
        total: actions.length,
        hint: '用 stills.actionSpec 查具体动作的参数格式',
      },
      summary: `返回 ${actions.length} 个可用动作`,
    }
  },
}

// ─── stills.actionSpec ─────────────────────────────────────

interface ActionSpecParams {
  action: string
}

export const stillsActionSpec: StillDefinition<ActionSpecParams, unknown> = {
  action: 'stills.actionSpec',
  type: 'describe',
  description: '返回指定动作的参数规格、guard、示例',
  guard: { requireDataset: false },
  paramsSchema: { action: 'string — 动作名' },
  example: { action: 'datatable.create' },
  validate: (params) => {
    if (!params.action || typeof params.action !== 'string') {
      return '缺少 action 参数'
    }
    return null
  },
  execute: (_ctx: StillContext, params: ActionSpecParams): StillResult => {
    const still = getStill(params.action)
    if (!still) {
      return {
        ok: false,
        code: 'UNKNOWN_ACTION',
        msg: `未知动作: ${params.action}`,
        fix: '请先查 stills.capabilities 获取可用动作列表',
      }
    }

    return {
      ok: true,
      data: {
        action: still.action,
        type: still.type,
        description: still.description,
        guard: still.guard,
        paramsSchema: still.paramsSchema ?? null,
        resultSchema: still.resultSchema ?? null,
        example: still.example ?? null,
      },
      summary: `返回动作 ${still.action} 的规格`,
    }
  },
}

// ─── session.describe ──────────────────────────────────────

export const sessionDescribe: StillDefinition<Record<string, never>, unknown> = {
  action: 'session.describe',
  type: 'describe',
  description: '返回当前步骤、锁状态、dataset 摘要、blueprint 摘要',
  guard: { requireDataset: false },
  example: {},
  validate: () => null,
  execute: (ctx: StillContext): StillResult => {
    const { session } = ctx
    const ds = session.dataset

    const datasetSummary = ds
      ? {
          dataSetName: ds.dataSetName,
          tables: Object.keys(ds.tables).length,
          totalColumns: Object.values(ds.tables).reduce(
            (sum, t) => sum + t.columns.length, 0,
          ),
          relations: ds.tableRelations?.length ?? 0,
        }
      : null

    const blueprintSummary = session.blueprint
      ? {
          userGoal: session.blueprint.userGoal,
          currentCheckpointId: session.blueprint.currentCheckpointId,
          totalCheckpoints: session.blueprint.checkpoints.length,
          completedCheckpoints: session.blueprint.checkpoints.filter(
            (cp) => cp.status === 'done',
          ).length,
          openQuestions: session.blueprint.openQuestions,
        }
      : null

    return {
      ok: true,
      data: {
        currentStep: session.currentStep,
        schemaLocked: session.schemaLocked,
        dataset: datasetSummary,
        blueprint: blueprintSummary,
        patchCount: session.patchLog.length,
        hint: ds === null
          ? '新会话，尚未开始建模'
          : session.blueprint === null
            ? '已有 DataSet，但尚无蓝图'
            : `进行中：${blueprintSummary?.completedCheckpoints}/${blueprintSummary?.totalCheckpoints} checkpoints`,
      },
      summary: '返回当前会话状态',
    }
  },
}
