/**
 * Blueprint Methods — blueprint.create / describe / advance / revise
 */

import type { StillDefinition, StillContext, StillResult, BlueprintCheckpoint, ExecutionBlueprint } from '../types'

// ─── blueprint.create ──────────────────────────────────────

interface BlueprintCreateParams {
  title: string
  requirements: string
  checkpoints: Array<{
    id: string
    title: string
    plannedActions: string[]
    validation: string
  }>
  openQuestions?: string[]
}

export const blueprintCreate: StillDefinition<BlueprintCreateParams, unknown> = {
  action: 'blueprint.create',
  type: 'request',
  description: '根据用户目标生成执行蓝图与 checkpoints',
  guard: { requireDataset: false },
  paramsSchema: {
    title: 'string — 蓝图标题',
    requirements: 'string — 需求描述',
    checkpoints: 'Array<{ id, title, plannedActions, validation }>',
    openQuestions: 'string[]? — 未决问题',
  },
  example: {
    title: '订单系统数据建模',
    requirements: '...',
    checkpoints: [
      { id: 'cp1', title: '初始化 DataSet', plannedActions: ['dataset.init'], validation: 'session.describe' },
    ],
  },
  validate: (params) => {
    if (!params.title || typeof params.title !== 'string') return '缺少 title'
    if (!params.requirements || typeof params.requirements !== 'string') return '缺少 requirements'
    if (!Array.isArray(params.checkpoints) || params.checkpoints.length === 0) return '缺少 checkpoints'
    for (const cp of params.checkpoints) {
      if (!cp.id || !cp.title || !Array.isArray(cp.plannedActions) || !cp.validation) {
        return `checkpoint ${cp.id} 缺少必填字段（id/title/plannedActions/validation）`
      }
    }
    return null
  },
  execute: (ctx: StillContext, params: BlueprintCreateParams): StillResult => {
    if (ctx.session.blueprint !== null) {
      return {
        ok: false,
        code: 'BLUEPRINT_EXISTS',
        msg: 'Blueprint 已存在',
        fix: '如需修改请用 blueprint.revise，如需重建请先 dataset.reset',
      }
    }

    const checkpoints: BlueprintCheckpoint[] = params.checkpoints.map((cp) => ({
      id: cp.id,
      title: cp.title,
      plannedActions: cp.plannedActions,
      validation: cp.validation,
      status: 'pending' as const,
    }))

    const blueprint: ExecutionBlueprint = {
      version: 1,
      userGoal: params.title,
      currentCheckpointId: checkpoints[0]?.id ?? '',
      openQuestions: params.openQuestions ?? [],
      checkpoints,
    }

    ctx.session.blueprint = blueprint
    ctx.session.currentStep = '③'

    const firstCp = checkpoints[0]

    return {
      ok: true,
      data: {
        status: 'ok',
        blueprintVersion: 1,
        userGoal: params.title,
        checkpointCount: checkpoints.length,
        currentCheckpointId: firstCp?.id ?? '',
        openQuestions: blueprint.openQuestions,
        hint: `蓝图已就绪，当前 checkpoint: ${firstCp?.id ?? ''}${firstCp ? `（${firstCp.title}）` : ''}`,
      },
      summary: `创建蓝图：${checkpoints.length} 个 checkpoints`,
    }
  },
}

// ─── blueprint.describe ────────────────────────────────────

export const blueprintDescribe: StillDefinition<Record<string, never>, unknown> = {
  action: 'blueprint.describe',
  type: 'describe',
  description: '返回当前蓝图、当前 checkpoint、未决问题',
  guard: { requireDataset: false, requireBlueprint: true },
  example: {},
  validate: () => null,
  execute: (ctx: StillContext): StillResult => {
    const bp = ctx.session.blueprint
    if (bp === null) return { ok: false, code: 'NO_BLUEPRINT', msg: 'Blueprint 未创建', fix: '请先执行 blueprint.create' }
    const current = bp.checkpoints.find((cp) => cp.id === bp.currentCheckpointId)
    const done = bp.checkpoints.filter((cp) => cp.status === 'done').length

    return {
      ok: true,
      data: {
        userGoal: bp.userGoal,
        currentCheckpointId: bp.currentCheckpointId,
        currentCheckpointTitle: current?.title ?? null,
        progress: `${done}/${bp.checkpoints.length}`,
        checkpoints: bp.checkpoints.map((cp) => ({
          id: cp.id,
          title: cp.title,
          status: cp.status,
          note: cp.note,
        })),
        openQuestions: bp.openQuestions,
      },
      summary: `蓝图进度 ${done}/${bp.checkpoints.length}`,
    }
  },
}

// ─── blueprint.advance ─────────────────────────────────────

interface BlueprintAdvanceParams {
  completedCheckpointId: string
  note?: string
}

export const blueprintAdvance: StillDefinition<BlueprintAdvanceParams, unknown> = {
  action: 'blueprint.advance',
  type: 'request',
  description: '标记当前 checkpoint 完成并推进下一步',
  guard: { requireDataset: false, requireBlueprint: true },
  paramsSchema: {
    completedCheckpointId: 'string — 要标记完成的 checkpoint ID',
    note: 'string? — 完成备注',
  },
  example: { completedCheckpointId: 'cp1', note: 'dataset.init 成功' },
  validate: (params) => {
    if (!params.completedCheckpointId || typeof params.completedCheckpointId !== 'string') {
      return '缺少 completedCheckpointId'
    }
    return null
  },
  execute: (ctx: StillContext, params: BlueprintAdvanceParams): StillResult => {
    const bp = ctx.session.blueprint
    if (bp === null) return { ok: false, code: 'NO_BLUEPRINT', msg: 'Blueprint 未创建', fix: '请先执行 blueprint.create' }
    const cp = bp.checkpoints.find((c) => c.id === params.completedCheckpointId)
    if (!cp) {
      return {
        ok: false,
        code: 'CHECKPOINT_NOT_FOUND',
        msg: `未找到 checkpoint: ${params.completedCheckpointId}`,
        fix: '请查 blueprint.describe 确认正确的 checkpoint ID',
      }
    }

    cp.status = 'done'
    if (params.note) cp.note = params.note

    // 找下一个 pending checkpoint
    const next = bp.checkpoints.find((c) => c.status === 'pending')
    if (next) {
      bp.currentCheckpointId = next.id
    }

    const done = bp.checkpoints.filter((c) => c.status === 'done').length

    return {
      ok: true,
      data: {
        status: 'ok',
        completedCheckpointId: params.completedCheckpointId,
        nextCheckpointId: next?.id ?? null,
        nextCheckpointTitle: next?.title ?? null,
        progress: `${done}/${bp.checkpoints.length}`,
        hint: next
          ? `请执行 ${next.plannedActions[0]} (${next.title})`
          : '所有 checkpoints 已完成',
      },
      summary: `推进: ${params.completedCheckpointId} → ${next?.id ?? '全部完成'}`,
    }
  },
}

// ─── blueprint.revise ──────────────────────────────────────

interface BlueprintReviseParams {
  reason: string
  addCheckpoints?: Array<{
    id: string
    title: string
    plannedActions: string[]
    validation: string
    insertAfter?: string
  }>
  removeCheckpointIds?: string[]
  updateOpenQuestions?: string[]
}

export const blueprintRevise: StillDefinition<BlueprintReviseParams, unknown> = {
  action: 'blueprint.revise',
  type: 'request',
  description: '根据执行反馈修订 blueprint',
  guard: { requireDataset: false, requireBlueprint: true },
  paramsSchema: {
    reason: 'string — 修订原因',
    addCheckpoints: 'Array? — 新增 checkpoints',
    removeCheckpointIds: 'string[]? — 移除的 checkpoint IDs',
    updateOpenQuestions: 'string[]? — 更新的未决问题',
  },
  validate: (params) => {
    if (!params.reason || typeof params.reason !== 'string') return '缺少 reason'
    return null
  },
  execute: (ctx: StillContext, params: BlueprintReviseParams): StillResult => {
    const bp = ctx.session.blueprint
    if (bp === null) return { ok: false, code: 'NO_BLUEPRINT', msg: 'Blueprint 未创建', fix: '请先执行 blueprint.create' }

    // 移除 checkpoints
    if (params.removeCheckpointIds) {
      const toRemove = params.removeCheckpointIds
      bp.checkpoints = bp.checkpoints.filter(
        (cp) => !toRemove.includes(cp.id),
      )
    }

    // 新增 checkpoints
    if (params.addCheckpoints) {
      for (const newCp of params.addCheckpoints) {
        const checkpoint: BlueprintCheckpoint = {
          id: newCp.id,
          title: newCp.title,
          plannedActions: newCp.plannedActions,
          validation: newCp.validation,
          status: 'pending',
        }
        if (newCp.insertAfter) {
          const idx = bp.checkpoints.findIndex((c) => c.id === newCp.insertAfter)
          if (idx >= 0) {
            bp.checkpoints.splice(idx + 1, 0, checkpoint)
            continue
          }
        }
        bp.checkpoints.push(checkpoint)
      }
    }

    // 更新 openQuestions
    if (params.updateOpenQuestions) {
      bp.openQuestions = params.updateOpenQuestions
    }

    bp.lastReflection = params.reason

    // 确保 currentCheckpointId 仍有效
    const currentStillExists = bp.checkpoints.some((c) => c.id === bp.currentCheckpointId)
    if (!currentStillExists) {
      const next = bp.checkpoints.find((c) => c.status === 'pending')
      if (next) bp.currentCheckpointId = next.id
    }

    return {
      ok: true,
      data: {
        status: 'ok',
        reason: params.reason,
        checkpointCount: bp.checkpoints.length,
        currentCheckpointId: bp.currentCheckpointId,
      },
      summary: `蓝图修订: ${params.reason}`,
    }
  },
}
