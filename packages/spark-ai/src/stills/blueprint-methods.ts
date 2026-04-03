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
  BlueprintPlanItem,
  BlueprintCheckpoint,
  BlueprintExecutionMode,
  ExecutionBlueprint,
  IStillSession,
} from './types'
import { noGuard, requireBlueprint } from './types'

// ═══════════════════════════════════════════════════════════
// 输入结构与通用 helper
// ═══════════════════════════════════════════════════════════

interface BlueprintPlanItemInput {
  id?: string
  title?: string
  action: string
  dependsOn?: string[]
  relatedPlanItemIds?: string[]
  executionMode?: BlueprintExecutionMode
  subagentGoal?: string
}

interface BlueprintCheckpointInput {
  id: string
  title: string
  plannedActions: string[]
  planItems?: BlueprintPlanItemInput[]
  validation: string
  dependsOn?: string[]
  relatedCheckpointIds?: string[]
  executionMode?: BlueprintExecutionMode
  subagentGoal?: string
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

interface BlueprintItemAdvanceParams {
  completedPlanItemId: string
  checkpointId?: string
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

function isExecutionMode(value: unknown): value is BlueprintExecutionMode {
  return value === 'inline' || value === 'subagent'
}

function validatePlanItemInput(
  planItem: BlueprintPlanItemInput,
  checkpointIndex: number,
  planItemIndex: number,
): string | null {
  if (!isNonEmptyString(planItem.action)) {
    return `checkpoint[${checkpointIndex}].planItems[${planItemIndex}] 缺少 action`
  }
  if (planItem.id !== undefined && !isNonEmptyString(planItem.id)) {
    return `checkpoint[${checkpointIndex}].planItems[${planItemIndex}] 的 id 必须是非空字符串`
  }
  if (planItem.title !== undefined && !isNonEmptyString(planItem.title)) {
    return `checkpoint[${checkpointIndex}].planItems[${planItemIndex}] 的 title 必须是非空字符串`
  }
  if (planItem.dependsOn !== undefined && !isStringArray(planItem.dependsOn)) {
    return `checkpoint[${checkpointIndex}].planItems[${planItemIndex}] 的 dependsOn 必须是 string[]`
  }
  if (planItem.relatedPlanItemIds !== undefined && !isStringArray(planItem.relatedPlanItemIds)) {
    return `checkpoint[${checkpointIndex}].planItems[${planItemIndex}] 的 relatedPlanItemIds 必须是 string[]`
  }
  if (planItem.executionMode !== undefined && !isExecutionMode(planItem.executionMode)) {
    return `checkpoint[${checkpointIndex}].planItems[${planItemIndex}] 的 executionMode 必须是 inline 或 subagent`
  }
  if (planItem.executionMode === 'subagent' && !isNonEmptyString(planItem.subagentGoal)) {
    return `checkpoint[${checkpointIndex}].planItems[${planItemIndex}] 在 executionMode=subagent 时必须提供 subagentGoal`
  }
  return null
}

function validateCheckpointInput(
  checkpoint: BlueprintCheckpointInput | BlueprintCheckpointInsertInput,
  index: number,
): string | null {
  if (!isNonEmptyString(checkpoint.id)) return `checkpoint[${index}] 缺少 id`
  if (!isNonEmptyString(checkpoint.title)) return `checkpoint[${index}] 缺少 title`
  if ((!Array.isArray(checkpoint.plannedActions) || checkpoint.plannedActions.length === 0)
    && (!Array.isArray(checkpoint.planItems) || checkpoint.planItems.length === 0)) {
    return `checkpoint[${index}] 缺少 plannedActions`
  }
  if (checkpoint.plannedActions.length > 0 && !isStringArray(checkpoint.plannedActions)) {
    return `checkpoint[${index}] 的 plannedActions 必须是 string[]`
  }
  if (checkpoint.planItems !== undefined) {
    if (!Array.isArray(checkpoint.planItems) || checkpoint.planItems.length === 0) {
      return `checkpoint[${index}] 的 planItems 必须是非空数组`
    }
    for (const [planItemIndex, planItem] of checkpoint.planItems.entries()) {
      const error = validatePlanItemInput(planItem, index, planItemIndex)
      if (error) return error
    }
  }
  if (!isNonEmptyString(checkpoint.validation)) return `checkpoint[${index}] 缺少 validation`
  if (checkpoint.dependsOn !== undefined && !isStringArray(checkpoint.dependsOn)) {
    return `checkpoint[${index}] 的 dependsOn 必须是 string[]`
  }
  if (checkpoint.relatedCheckpointIds !== undefined && !isStringArray(checkpoint.relatedCheckpointIds)) {
    return `checkpoint[${index}] 的 relatedCheckpointIds 必须是 string[]`
  }
  if (checkpoint.executionMode !== undefined && !isExecutionMode(checkpoint.executionMode)) {
    return `checkpoint[${index}] 的 executionMode 必须是 inline 或 subagent`
  }
  if (checkpoint.executionMode === 'subagent' && !isNonEmptyString(checkpoint.subagentGoal)) {
    return `checkpoint[${index}] 在 executionMode=subagent 时必须提供 subagentGoal`
  }
  return null
}

function toBlueprintPlanItems(input: BlueprintCheckpointInput): BlueprintPlanItem[] {
  if (input.planItems && input.planItems.length > 0) {
    return input.planItems.map((planItem, index) => ({
      id: planItem.id ?? `${input.id}.item${index + 1}`,
      title: planItem.title ?? planItem.action,
      action: planItem.action,
      status: 'pending',
      ...(planItem.dependsOn && planItem.dependsOn.length > 0 ? { dependsOn: planItem.dependsOn } : {}),
      ...(planItem.relatedPlanItemIds && planItem.relatedPlanItemIds.length > 0
        ? { relatedPlanItemIds: planItem.relatedPlanItemIds }
        : {}),
      ...(planItem.executionMode ? { executionMode: planItem.executionMode } : {}),
      ...(planItem.subagentGoal ? { subagentGoal: planItem.subagentGoal } : {}),
    }))
  }

  return input.plannedActions.map((action, index) => ({
    id: `${input.id}.item${index + 1}`,
    title: action,
    action,
    status: 'pending',
  }))
}

function toBlueprintCheckpoint(input: BlueprintCheckpointInput): BlueprintCheckpoint {
  const planItems = toBlueprintPlanItems(input)
  return {
    id: input.id,
    title: input.title,
    plannedActions: input.plannedActions.length > 0 ? input.plannedActions : planItems.map((item) => item.action),
    planItems,
    validation: input.validation,
    status: 'pending',
    ...(input.dependsOn && input.dependsOn.length > 0 ? { dependsOn: input.dependsOn } : {}),
    ...(input.relatedCheckpointIds && input.relatedCheckpointIds.length > 0
      ? { relatedCheckpointIds: input.relatedCheckpointIds }
      : {}),
    ...(input.executionMode ? { executionMode: input.executionMode } : {}),
    ...(input.subagentGoal ? { subagentGoal: input.subagentGoal } : {}),
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

function countDonePlanItems(checkpoint: BlueprintCheckpoint): number {
  return checkpoint.planItems.filter((planItem) => planItem.status === 'done').length
}

function findNextPendingPlanItem(checkpoint: BlueprintCheckpoint): BlueprintPlanItem | undefined {
  return checkpoint.planItems.find((planItem) => planItem.status === 'pending')
}

function syncCheckpointStatus(checkpoint: BlueprintCheckpoint): void {
  checkpoint.status = checkpoint.planItems.every((planItem) => planItem.status === 'done') ? 'done' : 'pending'
}

function findNextPendingCheckpoint(blueprint: ExecutionBlueprint): BlueprintCheckpoint | undefined {
  return blueprint.checkpoints.find((checkpoint) => checkpoint.status === 'pending')
}

/**
 * 修订蓝图后，currentCheckpointId 可能指向已删除节点。
 * 这里统一修正为：当前 pending → 第一个 checkpoint → 空字符串。
 */
function normalizeBlueprintPointers(blueprint: ExecutionBlueprint): void {
  for (const checkpoint of blueprint.checkpoints) {
    syncCheckpointStatus(checkpoint)
  }

  const nextPendingCheckpoint = findNextPendingCheckpoint(blueprint)
  const activeCheckpoint = nextPendingCheckpoint ?? blueprint.checkpoints[blueprint.checkpoints.length - 1]

  blueprint.currentCheckpointId = activeCheckpoint?.id ?? ''
  blueprint.currentPlanItemId = activeCheckpoint ? (findNextPendingPlanItem(activeCheckpoint)?.id ?? '') : ''
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
    checkpoints: 'Array<{ id, title, plannedActions, planItems?, validation, dependsOn?, relatedCheckpointIds?, executionMode?, subagentGoal? }>',
    openQuestions: 'string[]? — 未决问题',
  },
  example: {
    title: '订单系统数据建模',
    requirements: '...',
    checkpoints: [
      {
        id: 'cp1',
        title: '初始化 DataSet',
        plannedActions: ['dataset.init'],
        validation: 'session.describe',
        executionMode: 'inline',
      },
      {
        id: 'cp2',
        title: '创建核心表结构',
        plannedActions: ['datatable.create', 'relation.add'],
        validation: '表与关系齐备',
        dependsOn: ['cp1'],
        relatedCheckpointIds: ['cp3'],
        executionMode: 'subagent',
        subagentGoal: '补齐业务主表和关联表的结构与关系声明',
      },
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
      currentPlanItemId: firstCheckpoint?.planItems[0]?.id ?? '',
      openQuestions: params.openQuestions ?? [],
      checkpoints,
    }

    normalizeBlueprintPointers(session.blueprint)

    return {
      ok: true,
      data: {
        status: 'ok',
        blueprintVersion: 1,
        userGoal: params.title,
        checkpointCount: checkpoints.length,
        currentCheckpointId: firstCheckpoint?.id ?? '',
        currentPlanItemId: session.blueprint.currentPlanItemId,
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
        currentPlanItemId: blueprint.currentPlanItemId,
        currentCheckpointTitle: currentCheckpoint?.title ?? null,
        currentCheckpoint: currentCheckpoint
          ? {
              id: currentCheckpoint.id,
              title: currentCheckpoint.title,
              plannedActions: currentCheckpoint.plannedActions,
              validation: currentCheckpoint.validation,
              dependsOn: currentCheckpoint.dependsOn ?? [],
              relatedCheckpointIds: currentCheckpoint.relatedCheckpointIds ?? [],
              executionMode: currentCheckpoint.executionMode ?? 'inline',
              subagentGoal: currentCheckpoint.subagentGoal ?? null,
              currentPlanItemId: findNextPendingPlanItem(currentCheckpoint)?.id ?? null,
              planItems: currentCheckpoint.planItems.map((planItem) => ({
                id: planItem.id,
                title: planItem.title,
                action: planItem.action,
                status: planItem.status,
                note: planItem.note ?? null,
                dependsOn: planItem.dependsOn ?? [],
                relatedPlanItemIds: planItem.relatedPlanItemIds ?? [],
                executionMode: planItem.executionMode ?? 'inline',
                subagentGoal: planItem.subagentGoal ?? null,
              })),
              status: currentCheckpoint.status,
              note: currentCheckpoint.note ?? null,
            }
          : null,
        progress: `${doneCount}/${blueprint.checkpoints.length}`,
        checkpoints: blueprint.checkpoints.map((checkpoint) => ({
          id: checkpoint.id,
          title: checkpoint.title,
          status: checkpoint.status,
          note: checkpoint.note,
          plannedActions: checkpoint.plannedActions,
          validation: checkpoint.validation,
          dependsOn: checkpoint.dependsOn ?? [],
          relatedCheckpointIds: checkpoint.relatedCheckpointIds ?? [],
          executionMode: checkpoint.executionMode ?? 'inline',
          subagentGoal: checkpoint.subagentGoal ?? null,
          planItems: checkpoint.planItems.map((planItem) => ({
            id: planItem.id,
            title: planItem.title,
            action: planItem.action,
            status: planItem.status,
            note: planItem.note ?? null,
            dependsOn: planItem.dependsOn ?? [],
            relatedPlanItemIds: planItem.relatedPlanItemIds ?? [],
            executionMode: planItem.executionMode ?? 'inline',
            subagentGoal: planItem.subagentGoal ?? null,
          })),
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
    for (const planItem of checkpoint.planItems) {
      planItem.status = 'done'
    }
    if (params.note) checkpoint.note = params.note

    normalizeBlueprintPointers(blueprint)

    const nextCheckpoint = blueprint.checkpoints.find(
      (current) => current.id === blueprint.currentCheckpointId,
    )
    const nextPlanItem = nextCheckpoint ? findNextPendingPlanItem(nextCheckpoint) : undefined

    const doneCount = countDoneCheckpoints(blueprint)

    return {
      ok: true,
      data: {
        status: 'ok',
        completedCheckpointId: params.completedCheckpointId,
        nextCheckpointId: nextCheckpoint?.id ?? null,
        nextCheckpointTitle: nextCheckpoint?.title ?? null,
        nextPlanItemId: nextPlanItem?.id ?? null,
        nextPlanItemTitle: nextPlanItem?.title ?? null,
        nextCheckpointExecutionMode: nextCheckpoint?.executionMode ?? null,
        nextCheckpointDependsOn: nextCheckpoint?.dependsOn ?? [],
        progress: `${doneCount}/${blueprint.checkpoints.length}`,
        hint: nextCheckpoint
          ? nextCheckpoint.executionMode === 'subagent'
            ? `请为子代理准备任务：${nextCheckpoint.subagentGoal ?? nextCheckpoint.title}`
            : `请执行 ${nextCheckpoint.plannedActions[0]} (${nextCheckpoint.title})`
          : '所有 checkpoints 已完成',
      },
      summary: `推进: ${params.completedCheckpointId} → ${nextCheckpoint?.id ?? '全部完成'}`,
    }
  },
}

// ═══════════════════════════════════════════════════════════
// blueprint.item.advance
// ═══════════════════════════════════════════════════════════

export const blueprintItemAdvance: StillDefinition<BlueprintItemAdvanceParams, unknown> = {
  action: 'blueprint.item.advance',
  type: 'request',
  description: '标记单个 plan item 完成，并在必要时自动完成对应 checkpoint',
  guard: requireBlueprint,
  guardDescription: '需要 blueprint 已创建',
  paramsSchema: {
    completedPlanItemId: 'string — 要标记完成的 plan item ID',
    checkpointId: 'string? — 所属 checkpoint ID；不传则自动查找',
    note: 'string? — 完成备注',
  },
  example: { completedPlanItemId: 'cp2.item1', note: 'datatable.create 已完成' },
  validate: (params) => {
    if (!isNonEmptyString(params.completedPlanItemId)) return missingParam('completedPlanItemId')
    if (params.checkpointId !== undefined && !isNonEmptyString(params.checkpointId)) return 'checkpointId 必须是非空字符串'
    return null
  },
  execute: (session: IStillSession, params: BlueprintItemAdvanceParams): StillResult => {
    const required = requireSessionBlueprint(session)
    if ('error' in required) return required.error

    const blueprint = required.blueprint
    const checkpoint = params.checkpointId
      ? blueprint.checkpoints.find((current) => current.id === params.checkpointId)
      : blueprint.checkpoints.find((current) => current.planItems.some((item) => item.id === params.completedPlanItemId))

    if (!checkpoint) {
      return {
        ok: false,
        code: 'CHECKPOINT_NOT_FOUND',
        msg: `未找到 checkpoint: ${params.checkpointId ?? 'auto-locate'}`,
        fix: '请查 blueprint.describe 确认 checkpoint / plan item ID',
      }
    }

    const planItem = checkpoint.planItems.find((current) => current.id === params.completedPlanItemId)
    if (!planItem) {
      return {
        ok: false,
        code: 'PLAN_ITEM_NOT_FOUND',
        msg: `未找到 plan item: ${params.completedPlanItemId}`,
        fix: '请查 blueprint.describe 确认正确的 plan item ID',
      }
    }

    planItem.status = 'done'
    if (params.note) planItem.note = params.note

    syncCheckpointStatus(checkpoint)
    if (checkpoint.status === 'done' && !checkpoint.note && params.note) {
      checkpoint.note = `由 plan item 推进完成：${params.note}`
    }

    normalizeBlueprintPointers(blueprint)

    const nextCheckpoint = blueprint.checkpoints.find(
      (current) => current.id === blueprint.currentCheckpointId,
    )
    const nextPlanItem = nextCheckpoint ? findNextPendingPlanItem(nextCheckpoint) : undefined

    return {
      ok: true,
      data: {
        status: 'ok',
        completedPlanItemId: planItem.id,
        completedCheckpointId: checkpoint.id,
        checkpointCompleted: checkpoint.status === 'done',
        checkpointProgress: `${countDonePlanItems(checkpoint)}/${checkpoint.planItems.length}`,
        nextCheckpointId: nextCheckpoint?.id ?? null,
        nextCheckpointTitle: nextCheckpoint?.title ?? null,
        nextPlanItemId: nextPlanItem?.id ?? null,
        nextPlanItemTitle: nextPlanItem?.title ?? null,
        nextPlanItemAction: nextPlanItem?.action ?? null,
        hint: nextPlanItem
          ? nextPlanItem.executionMode === 'subagent'
            ? `请为子代理准备任务：${nextPlanItem.subagentGoal ?? nextPlanItem.title}`
            : `请执行 ${nextPlanItem.action}（${nextPlanItem.title}）`
          : '当前 checkpoint 的 plan items 已完成，可执行 blueprint.advance 或继续后续 checkpoint',
      },
      summary: `推进 plan item: ${planItem.id} → ${nextPlanItem?.id ?? '当前 checkpoint 完成'}`,
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
    addCheckpoints: 'Array<{ id, title, plannedActions, validation, dependsOn?, relatedCheckpointIds?, executionMode?, subagentGoal?, insertAfter? }>? — 新增 checkpoints',
    removeCheckpointIds: 'string[]? — 移除的 checkpoint IDs',
    updateOpenQuestions: 'string[]? — 更新的未决问题',
  },
  example: {
    reason: '发现需要额外的字典表',
    addCheckpoints: [
      {
        id: 'cp3',
        title: '字典表',
        plannedActions: ['datatable.create'],
        validation: '字典表建成',
        insertAfter: 'cp2',
        dependsOn: ['cp2'],
        executionMode: 'subagent',
        subagentGoal: '补齐字典表结构与初始数据入口',
      },
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
    normalizeBlueprintPointers(blueprint)

    return {
      ok: true,
      data: {
        status: 'ok',
        reason: params.reason,
        checkpointCount: blueprint.checkpoints.length,
        currentCheckpointId: blueprint.currentCheckpointId,
        currentPlanItemId: blueprint.currentPlanItemId,
      },
      summary: `蓝图修订: ${params.reason}`,
    }
  },
}
