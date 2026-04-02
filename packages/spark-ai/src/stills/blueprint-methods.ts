/**
 * Blueprint Methods
 *
 * 这个文件只负责蓝图编排本身，不触碰 dataset / meta / domain 细节：
 * 1. 创建 blueprint 与 checkpoints；
 * 2. 查询当前编排进度；
 * 3. 推进已完成 checkpoint；
 * 4. 根据执行反馈修订蓝图。
 */

import type {
  StillDefinition,
  StillResult,
  BlueprintCheckpoint,
  ExecutionBlueprint,
  IStillSession,
} from './types'
import { noGuard, requireBlueprint } from './types'

// ═══════════════════════════════════════════════════════════
// 输入结构与通用 helper
// ═══════════════════════════════════════════════════════════

interface BlueprintCheckpointInput {
  id: string
  title: string
  plannedActions: string[]
  validation: string
}

interface BlueprintCheckpointInsertInput extends BlueprintCheckpointInput {
  insertAfter?: string
}

interface BlueprintCreateParams {
  title: string
  requirements: string
  checkpoints: BlueprintCheckpointInput[]
  openQuestions?: string[]
}

interface BlueprintAdvanceParams {
  completedCheckpointId: string
  note?: string
}

interface BlueprintReviseParams {
  reason: string
  addCheckpoints?: BlueprintCheckpointInsertInput[]
  removeCheckpointIds?: string[]
  updateOpenQuestions?: string[]
}

function missingParam(name: string): string {
  return `缺少 ${name}`
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function validateCheckpointInput(
  checkpoint: BlueprintCheckpointInput | BlueprintCheckpointInsertInput,
  index: number,
): string | null {
  if (!isNonEmptyString(checkpoint.id)) return `checkpoint[${index}] 缺少 id`
  if (!isNonEmptyString(checkpoint.title)) return `checkpoint[${index}] 缺少 title`
  if (!Array.isArray(checkpoint.plannedActions) || checkpoint.plannedActions.length === 0) {
    return `checkpoint[${index}] 缺少 plannedActions`
  }
  if (!isStringArray(checkpoint.plannedActions)) {
    return `checkpoint[${index}] 的 plannedActions 必须是 string[]`
  }
  if (!isNonEmptyString(checkpoint.validation)) return `checkpoint[${index}] 缺少 validation`
  return null
}

function toBlueprintCheckpoint(input: BlueprintCheckpointInput): BlueprintCheckpoint {
  return {
    id: input.id,
    title: input.title,
    plannedActions: input.plannedActions,
    validation: input.validation,
    status: 'pending',
  }
}

function requireSessionBlueprint(
  session: IStillSession,
): { blueprint: ExecutionBlueprint } | { error: StillResult } {
  if (session.blueprint === null) {
    return {
      error: {
        ok: false,
        code: 'NO_BLUEPRINT',
        msg: 'Blueprint 未创建',
        fix: '请先执行 blueprint.create',
      },
    }
  }
  return { blueprint: session.blueprint }
}

function countDoneCheckpoints(blueprint: ExecutionBlueprint): number {
  return blueprint.checkpoints.filter((checkpoint) => checkpoint.status === 'done').length
}

function findNextPendingCheckpoint(blueprint: ExecutionBlueprint): BlueprintCheckpoint | undefined {
  return blueprint.checkpoints.find((checkpoint) => checkpoint.status === 'pending')
}

/**
 * 修订蓝图后，currentCheckpointId 可能指向已删除节点。
 * 这里统一修正为：当前 pending → 第一个 checkpoint → 空字符串。
 */
function normalizeCurrentCheckpoint(blueprint: ExecutionBlueprint): void {
  const currentExists = blueprint.checkpoints.some(
    (checkpoint) => checkpoint.id === blueprint.currentCheckpointId,
  )
  if (currentExists) return

  const nextPending = findNextPendingCheckpoint(blueprint)
  blueprint.currentCheckpointId = nextPending?.id ?? blueprint.checkpoints[0]?.id ?? ''
}

function insertCheckpoint(
  checkpoints: BlueprintCheckpoint[],
  checkpoint: BlueprintCheckpoint,
  insertAfter?: string,
): void {
  if (insertAfter) {
    const insertIndex = checkpoints.findIndex((current) => current.id === insertAfter)
    if (insertIndex >= 0) {
      checkpoints.splice(insertIndex + 1, 0, checkpoint)
      return
    }
  }
  checkpoints.push(checkpoint)
}

// ═══════════════════════════════════════════════════════════
// blueprint.create
// ═══════════════════════════════════════════════════════════

export const blueprintCreate: StillDefinition<BlueprintCreateParams, unknown> = {
  action: 'blueprint.create',
  type: 'request',
  description: '根据用户目标生成执行蓝图与 checkpoints',
  guard: noGuard,
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
    if (!isNonEmptyString(params.title)) return missingParam('title')
    if (!isNonEmptyString(params.requirements)) return missingParam('requirements')
    if (!Array.isArray(params.checkpoints) || params.checkpoints.length === 0) return missingParam('checkpoints')

    for (const [index, checkpoint] of params.checkpoints.entries()) {
      const error = validateCheckpointInput(checkpoint, index)
      if (error) return error
    }

    if (params.openQuestions !== undefined && !isStringArray(params.openQuestions)) {
      return 'openQuestions 必须是 string[]'
    }

    return null
  },
  execute: (session: IStillSession, params: BlueprintCreateParams): StillResult => {
    if (session.blueprint !== null) {
      return {
        ok: false,
        code: 'BLUEPRINT_EXISTS',
        msg: 'Blueprint 已存在',
        fix: '如需修改请用 blueprint.revise，如需重建请先 dataset.reset',
      }
    }

    const checkpoints = params.checkpoints.map(toBlueprintCheckpoint)
    const firstCheckpoint = checkpoints[0]

    session.blueprint = {
      version: 1,
      userGoal: params.title,
      currentCheckpointId: firstCheckpoint?.id ?? '',
      openQuestions: params.openQuestions ?? [],
      checkpoints,
    }

    return {
      ok: true,
      data: {
        status: 'ok',
        blueprintVersion: 1,
        userGoal: params.title,
        checkpointCount: checkpoints.length,
        currentCheckpointId: firstCheckpoint?.id ?? '',
        openQuestions: session.blueprint.openQuestions,
        hint: `蓝图已就绪，当前 checkpoint: ${firstCheckpoint?.id ?? ''}${firstCheckpoint ? `（${firstCheckpoint.title}）` : ''}`,
      },
      summary: `创建蓝图：${checkpoints.length} 个 checkpoints`,
    }
  },
}

// ═══════════════════════════════════════════════════════════
// blueprint.describe
// ═══════════════════════════════════════════════════════════

export const blueprintDescribe: StillDefinition<Record<string, never>, unknown> = {
  action: 'blueprint.describe',
  type: 'describe',
  description: '返回当前蓝图、当前 checkpoint、未决问题',
  guard: requireBlueprint,
  guardDescription: '需要 blueprint 已创建',
  paramsSchema: {},
  example: {},
  validate: () => null,
  execute: (session: IStillSession): StillResult => {
    const required = requireSessionBlueprint(session)
    if ('error' in required) return required.error

    const blueprint = required.blueprint
    const currentCheckpoint = blueprint.checkpoints.find(
      (checkpoint) => checkpoint.id === blueprint.currentCheckpointId,
    )
    const doneCount = countDoneCheckpoints(blueprint)

    return {
      ok: true,
      data: {
        userGoal: blueprint.userGoal,
        currentCheckpointId: blueprint.currentCheckpointId,
        currentCheckpointTitle: currentCheckpoint?.title ?? null,
        progress: `${doneCount}/${blueprint.checkpoints.length}`,
        checkpoints: blueprint.checkpoints.map((checkpoint) => ({
          id: checkpoint.id,
          title: checkpoint.title,
          status: checkpoint.status,
          note: checkpoint.note,
        })),
        openQuestions: blueprint.openQuestions,
      },
      summary: `蓝图进度 ${doneCount}/${blueprint.checkpoints.length}`,
    }
  },
}

// ═══════════════════════════════════════════════════════════
// blueprint.advance
// ═══════════════════════════════════════════════════════════

export const blueprintAdvance: StillDefinition<BlueprintAdvanceParams, unknown> = {
  action: 'blueprint.advance',
  type: 'request',
  description: '标记当前 checkpoint 完成并推进下一步',
  guard: requireBlueprint,
  guardDescription: '需要 blueprint 已创建',
  paramsSchema: {
    completedCheckpointId: 'string — 要标记完成的 checkpoint ID',
    note: 'string? — 完成备注',
  },
  example: { completedCheckpointId: 'cp1', note: 'dataset.init 成功' },
  validate: (params) => {
    if (!isNonEmptyString(params.completedCheckpointId)) return missingParam('completedCheckpointId')
    return null
  },
  execute: (session: IStillSession, params: BlueprintAdvanceParams): StillResult => {
    const required = requireSessionBlueprint(session)
    if ('error' in required) return required.error

    const blueprint = required.blueprint
    const checkpoint = blueprint.checkpoints.find(
      (current) => current.id === params.completedCheckpointId,
    )
    if (!checkpoint) {
      return {
        ok: false,
        code: 'CHECKPOINT_NOT_FOUND',
        msg: `未找到 checkpoint: ${params.completedCheckpointId}`,
        fix: '请查 blueprint.describe 确认正确的 checkpoint ID',
      }
    }

    checkpoint.status = 'done'
    if (params.note) checkpoint.note = params.note

    // 只推进到下一个 pending checkpoint；如果没有后续节点，则保留当前完成节点作为收尾位置。
    const nextCheckpoint = findNextPendingCheckpoint(blueprint)
    if (nextCheckpoint) {
      blueprint.currentCheckpointId = nextCheckpoint.id
    }

    const doneCount = countDoneCheckpoints(blueprint)

    return {
      ok: true,
      data: {
        status: 'ok',
        completedCheckpointId: params.completedCheckpointId,
        nextCheckpointId: nextCheckpoint?.id ?? null,
        nextCheckpointTitle: nextCheckpoint?.title ?? null,
        progress: `${doneCount}/${blueprint.checkpoints.length}`,
        hint: nextCheckpoint
          ? `请执行 ${nextCheckpoint.plannedActions[0]} (${nextCheckpoint.title})`
          : '所有 checkpoints 已完成',
      },
      summary: `推进: ${params.completedCheckpointId} → ${nextCheckpoint?.id ?? '全部完成'}`,
    }
  },
}

// ═══════════════════════════════════════════════════════════
// blueprint.revise
// ═══════════════════════════════════════════════════════════

export const blueprintRevise: StillDefinition<BlueprintReviseParams, unknown> = {
  action: 'blueprint.revise',
  type: 'request',
  description: '根据执行反馈修订 blueprint',
  guard: requireBlueprint,
  guardDescription: '需要 blueprint 已创建',
  paramsSchema: {
    reason: 'string — 修订原因',
    addCheckpoints: 'Array<{ id, title, plannedActions, validation, insertAfter? }>? — 新增 checkpoints',
    removeCheckpointIds: 'string[]? — 移除的 checkpoint IDs',
    updateOpenQuestions: 'string[]? — 更新的未决问题',
  },
  example: {
    reason: '发现需要额外的字典表',
    addCheckpoints: [
      { id: 'cp3', title: '字典表', plannedActions: ['datatable.create'], validation: '字典表建成', insertAfter: 'cp2' },
    ],
  },
  validate: (params) => {
    if (!isNonEmptyString(params.reason)) return missingParam('reason')

    if (params.addCheckpoints !== undefined) {
      if (!Array.isArray(params.addCheckpoints)) return 'addCheckpoints 必须是数组'
      for (const [index, checkpoint] of params.addCheckpoints.entries()) {
        const error = validateCheckpointInput(checkpoint, index)
        if (error) return error
      }
    }

    if (params.removeCheckpointIds !== undefined && !isStringArray(params.removeCheckpointIds)) {
      return 'removeCheckpointIds 必须是 string[]'
    }

    if (params.updateOpenQuestions !== undefined && !isStringArray(params.updateOpenQuestions)) {
      return 'updateOpenQuestions 必须是 string[]'
    }

    return null
  },
  execute: (session: IStillSession, params: BlueprintReviseParams): StillResult => {
    const required = requireSessionBlueprint(session)
    if ('error' in required) return required.error

    const blueprint = required.blueprint

    if (params.removeCheckpointIds) {
      const checkpointIdsToRemove = params.removeCheckpointIds
      blueprint.checkpoints = blueprint.checkpoints.filter(
        (checkpoint) => !checkpointIdsToRemove.includes(checkpoint.id),
      )
    }

    if (params.addCheckpoints) {
      for (const checkpointInput of params.addCheckpoints) {
        const checkpoint = toBlueprintCheckpoint(checkpointInput)
        insertCheckpoint(blueprint.checkpoints, checkpoint, checkpointInput.insertAfter)
      }
    }

    if (params.updateOpenQuestions) {
      blueprint.openQuestions = params.updateOpenQuestions
    }

    blueprint.lastReflection = params.reason
    normalizeCurrentCheckpoint(blueprint)

    return {
      ok: true,
      data: {
        status: 'ok',
        reason: params.reason,
        checkpointCount: blueprint.checkpoints.length,
        currentCheckpointId: blueprint.currentCheckpointId,
      },
      summary: `蓝图修订: ${params.reason}`,
    }
  },
}
