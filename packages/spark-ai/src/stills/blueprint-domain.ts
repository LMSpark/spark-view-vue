/**
 * Blueprint Domain — 蓝图编排域
 *
 * 会话→蓝图→业务 三层架构的中间层。
 * 负责：创建执行蓝图、推进 checkpoint / plan item、修订蓝图、验证覆盖度。
 *
 * 设计原则：
 * - 蓝图是"编译器"：把用户需求编译成可执行的 checkpoint 序列；
 * - 验证下沉到 still：脚本层只做轻量编排，覆盖度/自检由本域 still 驱动；
 * - 蓝图状态统一存放在 session.domains['blueprint'].data。
 */

import type {
  StillDefinition,
  StillResult,
  StillGuard,
  PatchEntry,
  BlueprintPlanItem,
  BlueprintCheckpoint,
  BlueprintExecutionMode,
  ExecutionBlueprint,
  IStillSession,
  DomainState,
  DomainProvider,
} from './types'
import { getDomainState } from './types'
import { getStill } from './dispatcher'
import {
  STILLS_ACTION_SPEC_ACTION,
  BLUEPRINT_CREATE_ACTION,
  BLUEPRINT_DESCRIBE_ACTION,
  BLUEPRINT_ADVANCE_ACTION,
  BLUEPRINT_ITEM_ADVANCE_ACTION,
  BLUEPRINT_REVISE_ACTION,
  BLUEPRINT_VALIDATE_COVERAGE_ACTION,
  BLUEPRINT_SELF_CHECK_ACTION,
  DATASET_BOOTSTRAP_ACTION,
  DATATABLE_CREATE_ACTION,
  RELATION_ADD_ACTION,
  SCHEMA_LOCK_ACTION,
} from './action-names'

// ═══════════════════════════════════════════════════════════
// Types & State
// ═══════════════════════════════════════════════════════════

export type BlueprintPhase = 'idle' | 'active' | 'completed'

export interface BlueprintDomainState extends DomainState<ExecutionBlueprint | null, BlueprintPhase> {}

export function createBlueprintState(): BlueprintDomainState {
  return { data: null, phase: 'idle' }
}

export function getBlueprintState(session: IStillSession): BlueprintDomainState {
  return getDomainState<BlueprintDomainState>(session, 'blueprint')
}

// ═══════════════════════════════════════════════════════════
// Guards
// ═══════════════════════════════════════════════════════════

interface BpGuardOptions {
  requireBlueprint?: boolean
}

function bpGuard(checks: BpGuardOptions = {}): StillGuard {
  return (session: IStillSession): { code: string; msg: string } | null => {
    if (checks.requireBlueprint === true) {
      const state = getBlueprintState(session)
      if (state.data === null) {
        return { code: 'NO_BLUEPRINT', msg: 'Blueprint 尚未创建，请先执行 blueprint.create' }
      }
    }
    return null
  }
}

const guardNone = bpGuard({})
const guardBlueprint = bpGuard({ requireBlueprint: true })
const guardBlueprintDesc = '需要 blueprint 已创建'

// ═══════════════════════════════════════════════════════════
// State Helpers
// ═══════════════════════════════════════════════════════════

/** 根据 blueprint 数据同步 phase。每次变更后调用。 */
function syncPhase(state: BlueprintDomainState): void {
  if (state.data === null) {
    state.phase = 'idle'
    return
  }
  const allDone = state.data.checkpoints.every((cp) => cp.status === 'done')
  state.phase = allDone ? 'completed' : 'active'
}

function requireBP(
  session: IStillSession,
): { state: BlueprintDomainState; blueprint: ExecutionBlueprint } | { error: StillResult } {
  const state = getBlueprintState(session)
  if (state.data === null) {
    return {
      error: {
        ok: false,
        code: 'NO_BLUEPRINT',
        msg: 'Blueprint 未创建',
        fix: `请先查看 ${BLUEPRINT_CREATE_ACTION} 规格并创建蓝图：\n${buildActionSpecFix(BLUEPRINT_CREATE_ACTION, 'retry-blueprint-create-spec')}`,
      },
    }
  }
  return { state, blueprint: state.data }
}

// ═══════════════════════════════════════════════════════════
// Input Interfaces
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
  plannedActions?: string[]
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

interface BlueprintCheckpointUpdateInput {
  id: string
  title?: string
  plannedActions?: string[]
  planItems?: BlueprintPlanItemInput[]
  validation?: string
  dependsOn?: string[]
  relatedCheckpointIds?: string[]
  executionMode?: BlueprintExecutionMode
  subagentGoal?: string
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
  updateCheckpoints?: BlueprintCheckpointUpdateInput[]
  removeCheckpointIds?: string[]
  updateOpenQuestions?: string[]
}

// ═══════════════════════════════════════════════════════════
// Validation Helpers
// ═══════════════════════════════════════════════════════════

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

function validateStillActionReference(action: string, location: string): string | null {
  if (getStill(action) === undefined) {
    return `${location} 的 action 必须是已注册 still: ${action}`
  }
  return null
}

function findDuplicateActions(actions: string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()

  for (const action of actions) {
    if (seen.has(action)) {
      duplicates.add(action)
      continue
    }
    seen.add(action)
  }

  return [...duplicates]
}

function validatePlanItemInput(
  planItem: BlueprintPlanItemInput,
  checkpointIndex: number,
  planItemIndex: number,
): string | null {
  if (!isNonEmptyString(planItem.action)) {
    return `checkpoint[${checkpointIndex}].planItems[${planItemIndex}] 缺少 action`
  }
  const actionError = validateStillActionReference(
    planItem.action,
    `checkpoint[${checkpointIndex}].planItems[${planItemIndex}]`,
  )
  if (actionError) return actionError
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
  const plannedActions = Array.isArray(checkpoint.plannedActions) ? checkpoint.plannedActions : []

  if (!isNonEmptyString(checkpoint.id)) return `checkpoint[${index}] 缺少 id`
  if (!isNonEmptyString(checkpoint.title)) return `checkpoint[${index}] 缺少 title`
  if ((plannedActions.length === 0)
    && (!Array.isArray(checkpoint.planItems) || checkpoint.planItems.length === 0)) {
    return `checkpoint[${index}] 缺少 plannedActions`
  }
  if (checkpoint.plannedActions !== undefined && !isStringArray(checkpoint.plannedActions)) {
    return `checkpoint[${index}] 的 plannedActions 必须是 string[]`
  }
  if (plannedActions.length > 0) {
    for (const [actionIndex, action] of plannedActions.entries()) {
      const actionError = validateStillActionReference(
        action,
        `checkpoint[${index}].plannedActions[${actionIndex}]`,
      )
      if (actionError) return actionError
    }
    if (checkpoint.planItems === undefined) {
      const duplicateActions = findDuplicateActions(plannedActions)
      if (duplicateActions.length > 0) {
        return `checkpoint[${index}] 包含重复 plannedActions (${duplicateActions.join(', ')})，请改用 planItems 为每次动作提供独立 title`
      }
    }
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

function validateCheckpointUpdateInput(update: BlueprintCheckpointUpdateInput, index: number): string | null {
  if (!isNonEmptyString(update.id)) return `updateCheckpoints[${index}] 缺少 id`
  if (!hasCheckpointUpdatePayload(update)) {
    return `updateCheckpoints[${index}] 至少提供一个变更字段`
  }
  if (update.title !== undefined && !isNonEmptyString(update.title)) {
    return `updateCheckpoints[${index}] 的 title 必须是非空字符串`
  }
  if (update.plannedActions !== undefined) {
    if (!isStringArray(update.plannedActions)) {
      return `updateCheckpoints[${index}] 的 plannedActions 必须是 string[]`
    }
    if (update.plannedActions.length === 0 && (update.planItems === undefined || update.planItems.length === 0)) {
      return `updateCheckpoints[${index}] 的 plannedActions 不能为空`
    }
    for (const [actionIndex, action] of update.plannedActions.entries()) {
      const actionError = validateStillActionReference(
        action,
        `updateCheckpoints[${index}].plannedActions[${actionIndex}]`,
      )
      if (actionError) return actionError
    }
    if (update.planItems === undefined) {
      const duplicateActions = findDuplicateActions(update.plannedActions)
      if (duplicateActions.length > 0) {
        return `updateCheckpoints[${index}] 包含重复 plannedActions (${duplicateActions.join(', ')})，请改用 planItems 为每次动作提供独立 title`
      }
    }
  }
  if (update.planItems !== undefined) {
    if (!Array.isArray(update.planItems) || update.planItems.length === 0) {
      return `updateCheckpoints[${index}] 的 planItems 必须是非空数组`
    }
    for (const [planItemIndex, planItem] of update.planItems.entries()) {
      const error = validatePlanItemInput(planItem, index, planItemIndex)
      if (error) return error.replace(`checkpoint[${index}]`, `updateCheckpoints[${index}]`)
    }
  }
  if (update.validation !== undefined && !isNonEmptyString(update.validation)) {
    return `updateCheckpoints[${index}] 的 validation 必须是非空字符串`
  }
  if (update.dependsOn !== undefined && !isStringArray(update.dependsOn)) {
    return `updateCheckpoints[${index}] 的 dependsOn 必须是 string[]`
  }
  if (update.relatedCheckpointIds !== undefined && !isStringArray(update.relatedCheckpointIds)) {
    return `updateCheckpoints[${index}] 的 relatedCheckpointIds 必须是 string[]`
  }
  if (update.executionMode !== undefined && !isExecutionMode(update.executionMode)) {
    return `updateCheckpoints[${index}] 的 executionMode 必须是 inline 或 subagent`
  }
  if (update.subagentGoal !== undefined && !isNonEmptyString(update.subagentGoal)) {
    return `updateCheckpoints[${index}] 的 subagentGoal 必须是非空字符串`
  }
  if (update.insertAfter !== undefined && !isNonEmptyString(update.insertAfter)) {
    return `updateCheckpoints[${index}] 的 insertAfter 必须是非空字符串`
  }
  return null
}

// ═══════════════════════════════════════════════════════════
// Conversion & Mutation Helpers
// ═══════════════════════════════════════════════════════════

function toBlueprintPlanItems(input: BlueprintCheckpointInput): BlueprintPlanItem[] {
  if (input.planItems && input.planItems.length > 0) {
    return input.planItems.map((planItem, index) => ({
      id: planItem.id ?? `${input.id}.item${index + 1}`,
      title: planItem.title ?? planItem.action,
      action: planItem.action,
      status: 'pending' as const,
      ...(planItem.dependsOn && planItem.dependsOn.length > 0 ? { dependsOn: planItem.dependsOn } : {}),
      ...(planItem.relatedPlanItemIds && planItem.relatedPlanItemIds.length > 0
        ? { relatedPlanItemIds: planItem.relatedPlanItemIds }
        : {}),
      ...(planItem.executionMode ? { executionMode: planItem.executionMode } : {}),
      ...(planItem.subagentGoal ? { subagentGoal: planItem.subagentGoal } : {}),
    }))
  }

  return (input.plannedActions ?? []).map((action, index) => ({
    id: `${input.id}.item${index + 1}`,
    title: action,
    action,
    status: 'pending' as const,
    ...(index > 0 ? { dependsOn: [`${input.id}.item${index}`] } : {}),
  }))
}

function toBlueprintPlanItemInput(planItem: BlueprintPlanItem): BlueprintPlanItemInput {
  return {
    id: planItem.id,
    title: planItem.title,
    action: planItem.action,
    ...(planItem.dependsOn && planItem.dependsOn.length > 0 ? { dependsOn: planItem.dependsOn } : {}),
    ...(planItem.relatedPlanItemIds && planItem.relatedPlanItemIds.length > 0
      ? { relatedPlanItemIds: planItem.relatedPlanItemIds }
      : {}),
    ...(planItem.executionMode ? { executionMode: planItem.executionMode } : {}),
    ...(planItem.subagentGoal ? { subagentGoal: planItem.subagentGoal } : {}),
  }
}

function toBlueprintCheckpointInput(checkpoint: BlueprintCheckpoint): BlueprintCheckpointInput {
  return {
    id: checkpoint.id,
    title: checkpoint.title,
    plannedActions: checkpoint.plannedActions,
    planItems: checkpoint.planItems.map(toBlueprintPlanItemInput),
    validation: checkpoint.validation,
    ...(checkpoint.dependsOn && checkpoint.dependsOn.length > 0 ? { dependsOn: checkpoint.dependsOn } : {}),
    ...(checkpoint.relatedCheckpointIds && checkpoint.relatedCheckpointIds.length > 0
      ? { relatedCheckpointIds: checkpoint.relatedCheckpointIds }
      : {}),
    ...(checkpoint.executionMode ? { executionMode: checkpoint.executionMode } : {}),
    ...(checkpoint.subagentGoal ? { subagentGoal: checkpoint.subagentGoal } : {}),
  }
}

function hasCheckpointUpdatePayload(update: BlueprintCheckpointUpdateInput): boolean {
  return update.title !== undefined
    || update.plannedActions !== undefined
    || update.planItems !== undefined
    || update.validation !== undefined
    || update.dependsOn !== undefined
    || update.relatedCheckpointIds !== undefined
    || update.executionMode !== undefined
    || update.subagentGoal !== undefined
    || update.insertAfter !== undefined
}

function mergeCheckpointInput(
  base: BlueprintCheckpointInput,
  update: BlueprintCheckpointUpdateInput,
): BlueprintCheckpointInput {
  let plannedActions = base.plannedActions
  let planItems = base.planItems

  if (update.planItems !== undefined) {
    planItems = update.planItems
    plannedActions = update.plannedActions ?? update.planItems.map((planItem) => planItem.action)
  } else if (update.plannedActions !== undefined) {
    plannedActions = update.plannedActions
    planItems = undefined
  }

  return {
    id: base.id,
    title: update.title ?? base.title,
    ...(plannedActions !== undefined ? { plannedActions } : {}),
    ...(planItems ? { planItems } : {}),
    validation: update.validation ?? base.validation,
    ...(update.dependsOn !== undefined
      ? (update.dependsOn.length > 0 ? { dependsOn: update.dependsOn } : {})
      : (base.dependsOn && base.dependsOn.length > 0 ? { dependsOn: base.dependsOn } : {})),
    ...(update.relatedCheckpointIds !== undefined
      ? (update.relatedCheckpointIds.length > 0 ? { relatedCheckpointIds: update.relatedCheckpointIds } : {})
      : (base.relatedCheckpointIds && base.relatedCheckpointIds.length > 0
        ? { relatedCheckpointIds: base.relatedCheckpointIds }
        : {})),
    ...(update.executionMode !== undefined
      ? { executionMode: update.executionMode }
      : (base.executionMode ? { executionMode: base.executionMode } : {})),
    ...(update.subagentGoal !== undefined
      ? { subagentGoal: update.subagentGoal }
      : (base.subagentGoal ? { subagentGoal: base.subagentGoal } : {})),
  }
}

function toBlueprintCheckpoint(input: BlueprintCheckpointInput): BlueprintCheckpoint {
  const planItems = toBlueprintPlanItems(input)
  return {
    id: input.id,
    title: input.title,
    plannedActions: input.plannedActions && input.plannedActions.length > 0
      ? input.plannedActions
      : planItems.map((item) => item.action),
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

// ═══════════════════════════════════════════════════════════
// Blueprint Navigation Helpers
// ═══════════════════════════════════════════════════════════

function countDoneCheckpoints(blueprint: ExecutionBlueprint): number {
  return blueprint.checkpoints.filter((checkpoint) => checkpoint.status === 'done').length
}

function countDonePlanItems(checkpoint: BlueprintCheckpoint): number {
  return checkpoint.planItems.filter((planItem) => planItem.status === 'done').length
}

function countCompletedPlanItemsByAction(blueprint: ExecutionBlueprint, action: string): number {
  return blueprint.checkpoints.reduce((count, checkpoint) => {
    return count + checkpoint.planItems.filter((planItem) => planItem.status === 'done' && planItem.action === action).length
  }, 0)
}

function countSuccessfulActionExecutions(patchLog: PatchEntry[], action: string): number {
  return patchLog.filter((entry) => entry.action === action).length
}

function findNextPendingPlanItem(checkpoint: BlueprintCheckpoint): BlueprintPlanItem | undefined {
  return checkpoint.planItems.find((planItem) => planItem.status === 'pending')
}

function findPlanItemById(blueprint: ExecutionBlueprint, planItemId: string): BlueprintPlanItem | undefined {
  for (const checkpoint of blueprint.checkpoints) {
    const planItem = checkpoint.planItems.find((item) => item.id === planItemId)
    if (planItem) return planItem
  }
  return undefined
}

function getPendingCheckpointDependencyIds(
  blueprint: ExecutionBlueprint,
  checkpoint: BlueprintCheckpoint,
): string[] {
  return (checkpoint.dependsOn ?? []).filter((dependencyId) => {
    const dependencyCheckpoint = blueprint.checkpoints.find((item) => item.id === dependencyId)
    return dependencyCheckpoint?.status !== 'done'
  })
}

function getPendingPlanItemDependencyIds(
  blueprint: ExecutionBlueprint,
  planItem: BlueprintPlanItem,
): string[] {
  return (planItem.dependsOn ?? []).filter((dependencyId) => {
    const dependencyPlanItem = findPlanItemById(blueprint, dependencyId)
    return dependencyPlanItem?.status !== 'done'
  })
}

function findNextReadyPlanItem(
  blueprint: ExecutionBlueprint,
  checkpoint: BlueprintCheckpoint,
): BlueprintPlanItem | undefined {
  return checkpoint.planItems.find(
    (planItem) => planItem.status === 'pending' && getPendingPlanItemDependencyIds(blueprint, planItem).length === 0,
  )
}

function syncCheckpointStatus(checkpoint: BlueprintCheckpoint): void {
  checkpoint.status = checkpoint.planItems.every((planItem) => planItem.status === 'done') ? 'done' : 'pending'
}

function findNextPendingCheckpoint(blueprint: ExecutionBlueprint): BlueprintCheckpoint | undefined {
  return blueprint.checkpoints.find((checkpoint) => checkpoint.status === 'pending')
}

function findNextReadyCheckpoint(blueprint: ExecutionBlueprint): BlueprintCheckpoint | undefined {
  return blueprint.checkpoints.find(
    (checkpoint) => checkpoint.status === 'pending' && getPendingCheckpointDependencyIds(blueprint, checkpoint).length === 0,
  )
}

function normalizeBlueprintPointers(blueprint: ExecutionBlueprint): void {
  for (const checkpoint of blueprint.checkpoints) {
    syncCheckpointStatus(checkpoint)
  }

  const nextReadyCheckpoint = findNextReadyCheckpoint(blueprint)
  const nextPendingCheckpoint = findNextPendingCheckpoint(blueprint)
  const activeCheckpoint = nextReadyCheckpoint ?? nextPendingCheckpoint ?? blueprint.checkpoints[blueprint.checkpoints.length - 1]

  blueprint.currentCheckpointId = activeCheckpoint?.id ?? ''
  blueprint.currentPlanItemId = activeCheckpoint
    ? (findNextReadyPlanItem(blueprint, activeCheckpoint)?.id ?? findNextPendingPlanItem(activeCheckpoint)?.id ?? '')
    : ''
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

function detectDependencyCycle<TNode extends { id: string; dependsOn?: string[] }>(
  nodes: TNode[],
  label: string,
): string | null {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const path: string[] = []

  const visit = (graphNodeId: string): string | null => {
    if (visited.has(graphNodeId)) return null
    if (visiting.has(graphNodeId)) {
      const cycleStart = path.indexOf(graphNodeId)
      const cycle = cycleStart >= 0 ? [...path.slice(cycleStart), graphNodeId] : [graphNodeId, graphNodeId]
      return `${label} 依赖存在循环: ${cycle.join(' -> ')}`
    }

    visiting.add(graphNodeId)
    path.push(graphNodeId)
    const node = nodeMap.get(graphNodeId)
    for (const dependencyId of node?.dependsOn ?? []) {
      const error = visit(dependencyId)
      if (error) return error
    }
    path.pop()
    visiting.delete(graphNodeId)
    visited.add(graphNodeId)
    return null
  }

  for (const node of nodes) {
    const error = visit(node.id)
    if (error) return error
  }

  return null
}

function validateBlueprintIntegrity(checkpoints: BlueprintCheckpoint[]): string | null {
  if (checkpoints.length === 0) {
    return 'blueprint 至少保留一个 checkpoint'
  }

  const checkpointIds = checkpoints.map((checkpoint) => checkpoint.id)
  const checkpointIdSet = new Set<string>()
  for (const checkpointId of checkpointIds) {
    if (checkpointIdSet.has(checkpointId)) {
      return `checkpoint id 重复: ${checkpointId}`
    }
    checkpointIdSet.add(checkpointId)
  }

  const planItemIdSet = new Set<string>()
  for (const checkpoint of checkpoints) {
    for (const planItem of checkpoint.planItems) {
      if (planItemIdSet.has(planItem.id)) {
        return `plan item id 重复: ${planItem.id}`
      }
      planItemIdSet.add(planItem.id)
    }
  }

  for (const checkpoint of checkpoints) {
    for (const dependencyId of checkpoint.dependsOn ?? []) {
      if (!checkpointIdSet.has(dependencyId)) {
        return `checkpoint ${checkpoint.id} 依赖了不存在的 checkpoint: ${dependencyId}`
      }
    }

    for (const relatedId of checkpoint.relatedCheckpointIds ?? []) {
      if (!checkpointIdSet.has(relatedId)) {
        return `checkpoint ${checkpoint.id} 关联了不存在的 checkpoint: ${relatedId}`
      }
    }

    for (const planItem of checkpoint.planItems) {
      for (const dependencyId of planItem.dependsOn ?? []) {
        if (!planItemIdSet.has(dependencyId)) {
          return `plan item ${planItem.id} 依赖了不存在的 plan item: ${dependencyId}`
        }
      }

      for (const relatedId of planItem.relatedPlanItemIds ?? []) {
        if (!planItemIdSet.has(relatedId)) {
          return `plan item ${planItem.id} 关联了不存在的 plan item: ${relatedId}`
        }
      }
    }
  }

  const checkpointCycleError = detectDependencyCycle(checkpoints, 'checkpoint')
  if (checkpointCycleError) return checkpointCycleError

  const allPlanItems = checkpoints.flatMap((checkpoint) => checkpoint.planItems)
  const planItemCycleError = detectDependencyCycle(allPlanItems, 'plan item')
  if (planItemCycleError) return planItemCycleError

  return null
}

function snapshotBlueprintStructure(blueprint: ExecutionBlueprint): string {
  return JSON.stringify({
    checkpoints: blueprint.checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      title: checkpoint.title,
      plannedActions: checkpoint.plannedActions,
      validation: checkpoint.validation,
      status: checkpoint.status,
      dependsOn: checkpoint.dependsOn ?? [],
      relatedCheckpointIds: checkpoint.relatedCheckpointIds ?? [],
      executionMode: checkpoint.executionMode ?? 'inline',
      subagentGoal: checkpoint.subagentGoal ?? null,
      planItems: checkpoint.planItems.map((planItem) => ({
        id: planItem.id,
        title: planItem.title,
        action: planItem.action,
        status: planItem.status,
        dependsOn: planItem.dependsOn ?? [],
        relatedPlanItemIds: planItem.relatedPlanItemIds ?? [],
        executionMode: planItem.executionMode ?? 'inline',
        subagentGoal: planItem.subagentGoal ?? null,
      })),
    })),
    openQuestions: blueprint.openQuestions,
  })
}

// ═══════════════════════════════════════════════════════════
// FC Call Hint Helpers (修复提示生成)
// ═══════════════════════════════════════════════════════════

function formatFunctionCallHint(action: string, requestId: string, params: unknown): string {
  return [
    `requestId: ${requestId}`,
    `下一步直接调用 ${action.replace(/\./g, '_')}(${JSON.stringify(params, null, 2)})`,
  ].join('\n')
}

function buildBlueprintDescribeFix(requestId = 'retry-blueprint-describe'): string {
  return formatFunctionCallHint(BLUEPRINT_DESCRIBE_ACTION, requestId, {})
}

function buildActionSpecFix(action: string, requestId = 'retry-action-spec'): string {
  return formatFunctionCallHint(STILLS_ACTION_SPEC_ACTION, requestId, { action })
}

function buildPlanItemAdvanceFix(planItemId: string, note = '动作执行完成', requestId = 'retry-plan-item-advance'): string {
  return formatFunctionCallHint('blueprint.item.advance', requestId, {
    completedPlanItemId: planItemId,
    note,
  })
}

function buildCheckpointAdvanceFix(
  checkpointId: string,
  note = 'checkpoint 已完成',
  requestId = 'retry-checkpoint-advance',
): string {
  return formatFunctionCallHint(BLUEPRINT_ADVANCE_ACTION, requestId, {
    completedCheckpointId: checkpointId,
    note,
  })
}

// ═══════════════════════════════════════════════════════════
// Stills: Lifecycle (5)
// ═══════════════════════════════════════════════════════════

// ─── blueprint.create ──────────────────────────────────────

export const blueprintCreate: StillDefinition<BlueprintCreateParams, unknown> = {
  action: BLUEPRINT_CREATE_ACTION,
  type: 'request',
  description: '根据用户目标生成执行蓝图与 checkpoints',
  guard: guardNone,
  usageRules: [
    '一次会话只创建一个初始 blueprint；已有 blueprint 时不要重复 create，而是改用 blueprint.revise。',
    '每个 checkpoint 必须能落到真实的 still 动作，不能写 datatable.create×5 之类的聚合占位符。',
    '同一动作如果要执行多次，请改用 planItems 显式展开，并给每次动作独立 title。',
    'dependsOn / relatedCheckpointIds / relatedPlanItemIds 只能引用同一蓝图内存在的 ID。',
  ],
  paramsSchema: {
    title: 'string — 蓝图标题',
    requirements: 'string — 需求描述',
    checkpoints: 'Array<{ id, title, plannedActions, planItems?, validation, dependsOn?, relatedCheckpointIds?, executionMode?, subagentGoal? }>',
    openQuestions: 'string[]? — 未决问题',
  },
  resultSchema: {
    status: '"ok"',
    blueprintVersion: '1',
    userGoal: 'string',
    checkpointCount: 'number',
    currentCheckpointId: 'string',
    currentPlanItemId: 'string',
    openQuestions: 'string[]',
    hint: 'string — 当前应该执行的 checkpoint 提示',
  },
  example: {
    title: '订单系统数据建模',
    requirements: '...',
    checkpoints: [
      {
        id: 'cp1',
        title: '初始化 DataSet',
        plannedActions: [DATASET_BOOTSTRAP_ACTION],
        validation: 'session.describe',
        executionMode: 'inline',
      },
      {
        id: 'cp2',
        title: '创建核心表结构',
        plannedActions: [DATATABLE_CREATE_ACTION, RELATION_ADD_ACTION],
        validation: '表与关系齐备',
        dependsOn: ['cp1'],
        relatedCheckpointIds: ['cp3'],
        executionMode: 'subagent',
        subagentGoal: '补齐业务主表和关联表的结构与关系声明',
      },
    ],
  },
  failureModes: [
    {
      code: 'BLUEPRINT_EXISTS',
      when: '当前会话已经创建过 blueprint，又再次调用 blueprint.create',
      fix: '改用 blueprint.revise 修订，或先 dataset.reset 后重新创建',
    },
    {
      code: 'INVALID_BLUEPRINT',
      when: 'checkpoint / plan item 的 ID、依赖或关联关系不完整，或出现悬空引用',
      fix: '先修正结构，再重新提交 blueprint.create',
    },
  ],
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
    const state = getBlueprintState(session)
    if (state.data !== null) {
      return {
        ok: false,
        code: 'BLUEPRINT_EXISTS',
        msg: 'Blueprint 已存在',
        fix: '如需修改请用 blueprint.revise，如需重建请先 dataset.reset',
      }
    }

    const checkpoints = params.checkpoints.map(toBlueprintCheckpoint)
    const integrityError = validateBlueprintIntegrity(checkpoints)
    if (integrityError) {
      return {
        ok: false,
        code: 'INVALID_BLUEPRINT',
        msg: integrityError,
        fix: '请修正 checkpoint / plan item 的 ID、依赖和关联关系后重试',
      }
    }
    const firstCheckpoint = checkpoints[0]

    state.data = {
      version: 1,
      userGoal: params.title,
      currentCheckpointId: firstCheckpoint?.id ?? '',
      currentPlanItemId: firstCheckpoint?.planItems[0]?.id ?? '',
      openQuestions: params.openQuestions ?? [],
      checkpoints,
    }

    normalizeBlueprintPointers(state.data)
    syncPhase(state)

    const activeCheckpoint = state.data.checkpoints.find(
      (checkpoint) => checkpoint.id === state.data?.currentCheckpointId,
    )

    return {
      ok: true,
      data: {
        status: 'ok',
        blueprintVersion: 1,
        userGoal: params.title,
        checkpointCount: checkpoints.length,
        currentCheckpointId: state.data.currentCheckpointId,
        currentPlanItemId: state.data.currentPlanItemId,
        openQuestions: state.data.openQuestions,
        hint: `蓝图已就绪，当前 checkpoint: ${activeCheckpoint?.id ?? ''}${activeCheckpoint ? `（${activeCheckpoint.title}）` : ''}`,
      },
      summary: `创建蓝图：${checkpoints.length} 个 checkpoints`,
    }
  },
}

// ─── blueprint.describe ────────────────────────────────────

export const blueprintDescribe: StillDefinition<Record<string, never>, unknown> = {
  action: BLUEPRINT_DESCRIBE_ACTION,
  type: 'describe',
  description: '返回当前蓝图、当前 checkpoint、未决问题',
  guard: guardBlueprint,
  guardDescription: guardBlueprintDesc,
  paramsSchema: {},
  example: {},
  validate: () => null,
  execute: (session: IStillSession): StillResult => {
    const required = requireBP(session)
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
        phase: required.state.phase,
        currentCheckpointId: blueprint.currentCheckpointId,
        currentPlanItemId: blueprint.currentPlanItemId,
        currentCheckpointTitle: currentCheckpoint?.title ?? null,
        currentCheckpoint: currentCheckpoint
          ? {
              id: currentCheckpoint.id,
              title: currentCheckpoint.title,
              plannedActions: currentCheckpoint.plannedActions,
              validation: currentCheckpoint.validation,
              ready: getPendingCheckpointDependencyIds(blueprint, currentCheckpoint).length === 0,
              pendingDependencyIds: getPendingCheckpointDependencyIds(blueprint, currentCheckpoint),
              dependsOn: currentCheckpoint.dependsOn ?? [],
              relatedCheckpointIds: currentCheckpoint.relatedCheckpointIds ?? [],
              executionMode: currentCheckpoint.executionMode ?? 'inline',
              subagentGoal: currentCheckpoint.subagentGoal ?? null,
              currentPlanItemId: findNextReadyPlanItem(blueprint, currentCheckpoint)?.id
                ?? findNextPendingPlanItem(currentCheckpoint)?.id
                ?? null,
              planItems: currentCheckpoint.planItems.map((planItem) => ({
                id: planItem.id,
                title: planItem.title,
                action: planItem.action,
                status: planItem.status,
                note: planItem.note ?? null,
                ready: getPendingPlanItemDependencyIds(blueprint, planItem).length === 0,
                pendingDependencyIds: getPendingPlanItemDependencyIds(blueprint, planItem),
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
          ready: getPendingCheckpointDependencyIds(blueprint, checkpoint).length === 0,
          pendingDependencyIds: getPendingCheckpointDependencyIds(blueprint, checkpoint),
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
            ready: getPendingPlanItemDependencyIds(blueprint, planItem).length === 0,
            pendingDependencyIds: getPendingPlanItemDependencyIds(blueprint, planItem),
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

// ─── blueprint.advance ─────────────────────────────────────

export const blueprintAdvance: StillDefinition<BlueprintAdvanceParams, unknown> = {
  action: BLUEPRINT_ADVANCE_ACTION,
  type: 'request',
  description: '标记当前 checkpoint 完成并推进下一步',
  guard: guardBlueprint,
  guardDescription: guardBlueprintDesc,
  usageRules: [
    'checkpoint 只能在其 dependsOn 全部完成后推进。',
    'checkpoint 下所有 plan item 都必须先通过 blueprint.item.advance 完成，再允许 blueprint.advance 收尾。',
  ],
  paramsSchema: {
    completedCheckpointId: 'string — 要标记完成的 checkpoint ID',
    note: 'string? — 完成备注',
  },
  example: { completedCheckpointId: 'cp1', note: 'dataset.bootstrap 成功' },
  failureModes: [
    {
      code: 'CHECKPOINT_DEPENDENCIES_PENDING',
      when: 'checkpoint 依赖的前置 checkpoint 尚未完成',
      fix: '先推进前置 checkpoint，再回到当前 checkpoint',
    },
    {
      code: 'CHECKPOINT_HAS_PENDING_PLAN_ITEMS',
      when: 'checkpoint 内仍有 plan item 未完成，却试图直接整体推进',
      fix: '逐个完成并推进 plan item，全部 done 后再调用 blueprint.advance',
    },
  ],
  validate: (params) => {
    if (!isNonEmptyString(params.completedCheckpointId)) return missingParam('completedCheckpointId')
    return null
  },
  execute: (session: IStillSession, params: BlueprintAdvanceParams): StillResult => {
    const required = requireBP(session)
    if ('error' in required) return required.error

    const { state, blueprint } = required
    const checkpoint = blueprint.checkpoints.find(
      (current) => current.id === params.completedCheckpointId,
    )
    if (!checkpoint) {
      return {
        ok: false,
        code: 'CHECKPOINT_NOT_FOUND',
        msg: `未找到 checkpoint: ${params.completedCheckpointId}`,
        fix: `请先查询当前蓝图，再使用正确的 checkpoint ID：\n${buildBlueprintDescribeFix('retry-checkpoint-describe')}`,
      }
    }

    const pendingCheckpointDependencies = getPendingCheckpointDependencyIds(blueprint, checkpoint)
    if (pendingCheckpointDependencies.length > 0) {
      return {
        ok: false,
        code: 'CHECKPOINT_DEPENDENCIES_PENDING',
        msg: `checkpoint ${params.completedCheckpointId} 仍依赖未完成的 checkpoint: ${pendingCheckpointDependencies.join(', ')}`,
        fix: `请先查看依赖阻塞并完成前置 checkpoint，再回到当前项：\n${buildBlueprintDescribeFix('retry-checkpoint-dependencies')}`,
      }
    }

    const pendingPlanItems = checkpoint.planItems.filter((planItem) => planItem.status !== 'done')
    if (pendingPlanItems.length > 0) {
      const nextReadyPlanItem = findNextReadyPlanItem(blueprint, checkpoint)
      return {
        ok: false,
        code: 'CHECKPOINT_HAS_PENDING_PLAN_ITEMS',
        msg: `checkpoint ${params.completedCheckpointId} 仍有 ${pendingPlanItems.length} 个未完成的 plan item，不能直接推进`,
        fix: nextReadyPlanItem
          ? `请先完成当前可执行的 plan item，再收尾 checkpoint：\n${buildPlanItemAdvanceFix(nextReadyPlanItem.id, `${nextReadyPlanItem.action} 已完成`, `retry-${nextReadyPlanItem.id}`)}\n\n全部 plan item 完成后，再执行：\n${buildCheckpointAdvanceFix(params.completedCheckpointId, 'checkpoint 收尾完成', `retry-${params.completedCheckpointId}`)}`
          : `请先执行 blueprint.describe，查看仍阻塞的 plan item 及其依赖关系：\n${buildBlueprintDescribeFix('retry-checkpoint-pending-items')}`,
      }
    }

    checkpoint.status = 'done'
    if (params.note) checkpoint.note = params.note

    normalizeBlueprintPointers(blueprint)
    syncPhase(state)

    const nextCheckpoint = blueprint.checkpoints.find(
      (current) => current.id === blueprint.currentCheckpointId,
    )
    const nextPlanItem = nextCheckpoint
      ? (findNextReadyPlanItem(blueprint, nextCheckpoint) ?? findNextPendingPlanItem(nextCheckpoint))
      : undefined

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

// ─── blueprint.item.advance ────────────────────────────────

export const blueprintItemAdvance: StillDefinition<BlueprintItemAdvanceParams, unknown> = {
  action: BLUEPRINT_ITEM_ADVANCE_ACTION,
  type: 'request',
  description: '标记单个 plan item 完成，并在必要时自动完成对应 checkpoint',
  guard: guardBlueprint,
  guardDescription: guardBlueprintDesc,
  usageRules: [
    '如果所属 checkpoint 的 dependsOn 尚未完成，不能提前推进其中的 plan item。',
    'plan item 自己声明了 dependsOn 时，必须先完成这些前置 plan item。',
    'request 型 plan item 只有在对应动作成功执行后，才能标记为 done。',
    '同一 action 在蓝图里重复出现时，每次推进都要对应一次新的成功执行，不能复用旧成功记录。',
  ],
  paramsSchema: {
    completedPlanItemId: 'string — 要标记完成的 plan item ID',
    checkpointId: 'string? — 所属 checkpoint ID；不传则自动查找',
    note: 'string? — 完成备注',
  },
  resultSchema: {
    status: '"ok"',
    completedPlanItemId: 'string',
    completedCheckpointId: 'string',
    checkpointCompleted: 'boolean',
    checkpointProgress: 'string',
    nextCheckpointId: 'string | null',
    nextCheckpointTitle: 'string | null',
    nextPlanItemId: 'string | null',
    nextPlanItemTitle: 'string | null',
    nextPlanItemAction: 'string | null',
    hint: 'string',
  },
  example: { completedPlanItemId: 'cp2.item1', note: 'datatable.create 已完成' },
  failureModes: [
    {
      code: 'CHECKPOINT_NOT_FOUND',
      when: 'checkpointId 不存在，或系统无法根据 completedPlanItemId 定位所属 checkpoint',
      fix: '先 blueprint.describe 确认 checkpoint / plan item ID',
    },
    {
      code: 'PLAN_ITEM_NOT_FOUND',
      when: 'completedPlanItemId 不存在于目标 checkpoint 中',
      fix: '先 blueprint.describe 确认正确的 plan item ID',
    },
    {
      code: 'PLAN_ITEM_NOT_EXECUTED',
      when: 'request 型 plan item 对应动作还没有足够的成功执行记录，就试图直接推进',
      fix: '先成功执行该 plan item.action，再调用 blueprint.item.advance',
    },
    {
      code: 'PLAN_ITEM_DEPENDENCIES_PENDING',
      when: 'plan item 自身声明的 dependsOn 还没完成，就试图提前推进',
      fix: '先完成该 plan item 的前置项，再推进当前项',
    },
    {
      code: 'CHECKPOINT_DEPENDENCIES_PENDING',
      when: '所属 checkpoint 的前置 checkpoint 还没完成，就试图推进当前 checkpoint 内的 plan item',
      fix: '先完成前置 checkpoint，再回到当前 checkpoint 的 plan item',
    },
  ],
  validate: (params) => {
    if (!isNonEmptyString(params.completedPlanItemId)) return missingParam('completedPlanItemId')
    if (params.checkpointId !== undefined && !isNonEmptyString(params.checkpointId)) return 'checkpointId 必须是非空字符串'
    return null
  },
  execute: (session: IStillSession, params: BlueprintItemAdvanceParams): StillResult => {
    const required = requireBP(session)
    if ('error' in required) return required.error

    const { state, blueprint } = required
    const checkpoint = params.checkpointId
      ? blueprint.checkpoints.find((current) => current.id === params.checkpointId)
      : blueprint.checkpoints.find((current) => current.planItems.some((item) => item.id === params.completedPlanItemId))

    if (!checkpoint) {
      return {
        ok: false,
        code: 'CHECKPOINT_NOT_FOUND',
        msg: `未找到 checkpoint: ${params.checkpointId ?? 'auto-locate'}`,
        fix: `请先查询当前蓝图，再使用正确的 checkpoint / plan item ID：\n${buildBlueprintDescribeFix('retry-plan-item-checkpoint-describe')}`,
      }
    }

    const planItem = checkpoint.planItems.find((current) => current.id === params.completedPlanItemId)
    if (!planItem) {
      return {
        ok: false,
        code: 'PLAN_ITEM_NOT_FOUND',
        msg: `未找到 plan item: ${params.completedPlanItemId}`,
        fix: `请先查询当前蓝图，再使用正确的 plan item ID：\n${buildBlueprintDescribeFix('retry-plan-item-describe')}`,
      }
    }

    const pendingCheckpointDependencies = getPendingCheckpointDependencyIds(blueprint, checkpoint)
    if (pendingCheckpointDependencies.length > 0) {
      return {
        ok: false,
        code: 'CHECKPOINT_DEPENDENCIES_PENDING',
        msg: `checkpoint ${checkpoint.id} 仍依赖未完成的 checkpoint: ${pendingCheckpointDependencies.join(', ')}`,
        fix: `请先查看依赖阻塞并完成前置 checkpoint，再回到当前 plan item：\n${buildBlueprintDescribeFix('retry-plan-item-checkpoint-dependencies')}`,
      }
    }

    const pendingPlanItemDependencies = getPendingPlanItemDependencyIds(blueprint, planItem)
    if (pendingPlanItemDependencies.length > 0) {
      return {
        ok: false,
        code: 'PLAN_ITEM_DEPENDENCIES_PENDING',
        msg: `plan item ${planItem.id} 仍依赖未完成的 plan item: ${pendingPlanItemDependencies.join(', ')}`,
        fix: `请先查看 plan item 依赖，再按依赖顺序推进：\n${buildBlueprintDescribeFix('retry-plan-item-dependencies')}`,
      }
    }

    const actionStill = getStill(planItem.action)
    if (actionStill?.type === 'request') {
      const completedPlanItems = countCompletedPlanItemsByAction(blueprint, planItem.action)
      const successfulExecutions = countSuccessfulActionExecutions(session.patchLog, planItem.action)
      if (successfulExecutions <= completedPlanItems) {
        return {
          ok: false,
          code: 'PLAN_ITEM_NOT_EXECUTED',
          msg: `plan item ${planItem.id} 对应动作 ${planItem.action} 尚未成功执行，不能标记完成`,
          fix: `请先查看 ${planItem.action} 的参数规格并成功执行该动作，然后再推进当前 plan item：\n${buildActionSpecFix(planItem.action, `retry-${planItem.action.replace(/\./g, '-')}-spec`)}\n\n动作成功后再执行：\n${buildPlanItemAdvanceFix(planItem.id, `${planItem.action} 已完成`, `retry-${planItem.id}`)}`,
        }
      }
    }

    planItem.status = 'done'
    if (params.note) planItem.note = params.note

    syncCheckpointStatus(checkpoint)
    if (checkpoint.status === 'done' && !checkpoint.note && params.note) {
      checkpoint.note = `由 plan item 推进完成：${params.note}`
    }

    normalizeBlueprintPointers(blueprint)
    syncPhase(state)

    const nextCheckpoint = blueprint.checkpoints.find(
      (current) => current.id === blueprint.currentCheckpointId,
    )
    const nextPlanItem = nextCheckpoint
      ? (findNextReadyPlanItem(blueprint, nextCheckpoint) ?? findNextPendingPlanItem(nextCheckpoint))
      : undefined

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

// ─── blueprint.revise ──────────────────────────────────────

export const blueprintRevise: StillDefinition<BlueprintReviseParams, unknown> = {
  action: BLUEPRINT_REVISE_ACTION,
  type: 'request',
  description: '根据执行反馈修订 blueprint',
  guard: guardBlueprint,
  guardDescription: guardBlueprintDesc,
  usageRules: [
    '只修订还未执行的 pending checkpoint；已完成历史节点不要直接改写。',
    'updateCheckpoints 用于修改既有 pending checkpoint 的 title / plannedActions / planItems / dependsOn / validation，也可用 insertAfter 调整顺序。',
    'plannedActions / planItems.action 必须都是已注册 still；重复动作请改用 planItems 展开，不要再写 datatable.create×5 一类聚合动作。',
    '如果只是口头说明 reason 而没有真实结构变化，会返回 NO_BLUEPRINT_CHANGE。',
  ],
  paramsSchema: {
    reason: 'string — 修订原因',
    addCheckpoints: 'Array<{ id, title, plannedActions, validation, dependsOn?, relatedCheckpointIds?, executionMode?, subagentGoal?, insertAfter? }>? — 新增 checkpoints',
    updateCheckpoints: 'Array<{ id, title?, plannedActions?, planItems?, validation?, dependsOn?, relatedCheckpointIds?, executionMode?, subagentGoal?, insertAfter? }>? — 修改现有 pending checkpoint',
    removeCheckpointIds: 'string[]? — 移除的 checkpoint IDs',
    updateOpenQuestions: 'string[]? — 更新的未决问题',
  },
  resultSchema: {
    status: '"ok"',
    reason: 'string',
    checkpointCount: 'number',
    currentCheckpointId: 'string',
    currentPlanItemId: 'string',
  },
  example: {
    reason: '发现需要额外的字典表',
    updateCheckpoints: [
      {
        id: 'cp2',
        plannedActions: [DATATABLE_CREATE_ACTION, RELATION_ADD_ACTION, SCHEMA_LOCK_ACTION],
        validation: '核心表、关系与锁定全部完成',
      },
    ],
    addCheckpoints: [
      {
        id: 'cp3',
        title: '字典表',
        plannedActions: [DATATABLE_CREATE_ACTION],
        validation: '字典表建成',
        insertAfter: 'cp2',
        dependsOn: ['cp2'],
        executionMode: 'subagent',
        subagentGoal: '补齐字典表结构与初始数据入口',
      },
    ],
  },
  failureModes: [
    {
      code: 'CHECKPOINT_NOT_FOUND',
      when: 'removeCheckpointIds 或 updateCheckpoints 引用了不存在的 checkpoint ID',
      fix: '先 blueprint.describe 确认 ID，再修订 blueprint',
    },
    {
      code: 'CHECKPOINT_NOT_EDITABLE',
      when: '试图直接改写已经执行过的 checkpoint',
      fix: '不要改写历史节点；为补救动作新增后续 checkpoint，或在尚未执行前修订该节点',
    },
    {
      code: 'INVALID_BLUEPRINT',
      when: '修订后的 checkpoint 依赖、关联、插入位置或 plan item 结构不合法',
      fix: '修正依赖关系和插入位置，确保修订后的 blueprint 仍然闭合',
    },
    {
      code: 'NO_BLUEPRINT_CHANGE',
      when: '提供了 reason，但没有产生任何真实结构变更',
      fix: '补充 addCheckpoints / updateCheckpoints / removeCheckpointIds / updateOpenQuestions 中的实际修改',
    },
  ],
  validate: (params) => {
    if (!isNonEmptyString(params.reason)) return missingParam('reason')

    if (params.addCheckpoints !== undefined) {
      if (!Array.isArray(params.addCheckpoints)) return 'addCheckpoints 必须是数组'
      for (const [index, checkpoint] of params.addCheckpoints.entries()) {
        const error = validateCheckpointInput(checkpoint, index)
        if (error) return error
      }
    }

    if (params.updateCheckpoints !== undefined) {
      if (!Array.isArray(params.updateCheckpoints)) return 'updateCheckpoints 必须是数组'
      for (const [index, checkpoint] of params.updateCheckpoints.entries()) {
        const error = validateCheckpointUpdateInput(checkpoint, index)
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
    const required = requireBP(session)
    if ('error' in required) return required.error

    const { state, blueprint } = required
    const beforeSnapshot = snapshotBlueprintStructure(blueprint)
    const nextCheckpoints = blueprint.checkpoints.map((checkpoint) => ({
      ...checkpoint,
      planItems: checkpoint.planItems.map((planItem) => ({ ...planItem })),
    }))

    if (params.removeCheckpointIds) {
      const checkpointIdsToRemove = params.removeCheckpointIds
      const missingCheckpointIds = checkpointIdsToRemove.filter(
        (checkpointId) => !nextCheckpoints.some((checkpoint) => checkpoint.id === checkpointId),
      )
      if (missingCheckpointIds.length > 0) {
        return {
          ok: false,
          code: 'CHECKPOINT_NOT_FOUND',
          msg: `未找到 checkpoint: ${missingCheckpointIds.join(', ')}`,
          fix: '请先 blueprint.describe 确认可移除的 checkpoint ID',
        }
      }

      for (let index = nextCheckpoints.length - 1; index >= 0; index--) {
        const checkpoint = nextCheckpoints[index]
        if (checkpoint && checkpointIdsToRemove.includes(checkpoint.id)) {
          nextCheckpoints.splice(index, 1)
        }
      }
    }

    if (params.addCheckpoints) {
      for (const checkpointInput of params.addCheckpoints) {
        if (checkpointInput.insertAfter && !nextCheckpoints.some((checkpoint) => checkpoint.id === checkpointInput.insertAfter)) {
          return {
            ok: false,
            code: 'INVALID_BLUEPRINT',
            msg: `insertAfter 指向不存在的 checkpoint: ${checkpointInput.insertAfter}`,
            fix: '请先 blueprint.describe 确认插入位置，或省略 insertAfter 追加到末尾',
          }
        }
        const checkpoint = toBlueprintCheckpoint(checkpointInput)
        insertCheckpoint(nextCheckpoints, checkpoint, checkpointInput.insertAfter)
      }
    }

    if (params.updateCheckpoints) {
      for (const [index, checkpointUpdate] of params.updateCheckpoints.entries()) {
        const checkpointIndex = nextCheckpoints.findIndex((checkpoint) => checkpoint.id === checkpointUpdate.id)
        if (checkpointIndex < 0) {
          return {
            ok: false,
            code: 'CHECKPOINT_NOT_FOUND',
            msg: `未找到 checkpoint: ${checkpointUpdate.id}`,
            fix: `请先查询当前蓝图，再使用正确的 checkpoint ID：\n${buildBlueprintDescribeFix('retry-revise-checkpoint-describe')}`,
          }
        }

        const currentCheckpoint = nextCheckpoints[checkpointIndex]
        if (!currentCheckpoint) {
          return {
            ok: false,
            code: 'CHECKPOINT_NOT_FOUND',
            msg: `未找到 checkpoint: ${checkpointUpdate.id}`,
            fix: `请先查询当前蓝图，再使用正确的 checkpoint ID：\n${buildBlueprintDescribeFix('retry-revise-checkpoint-describe-2')}`,
          }
        }

        if (currentCheckpoint.status === 'done' || currentCheckpoint.planItems.some((planItem) => planItem.status === 'done')) {
          return {
            ok: false,
            code: 'CHECKPOINT_NOT_EDITABLE',
            msg: `checkpoint ${checkpointUpdate.id} 已执行，不能直接改写`,
            fix: '请新增后续 checkpoint 描述补救动作，而不是修改已完成节点',
          }
        }

        if (checkpointUpdate.insertAfter === checkpointUpdate.id) {
          return {
            ok: false,
            code: 'INVALID_BLUEPRINT',
            msg: `checkpoint ${checkpointUpdate.id} 不能 insertAfter 自己`,
            fix: '请改成其他 checkpoint ID，或省略 insertAfter 保持原位置',
          }
        }

        const mergedCheckpointInput = mergeCheckpointInput(
          toBlueprintCheckpointInput(currentCheckpoint),
          checkpointUpdate,
        )
        const mergedError = validateCheckpointInput(mergedCheckpointInput, index)
        if (mergedError) {
          return {
            ok: false,
            code: 'INVALID_BLUEPRINT',
            msg: mergedError.replace(`checkpoint[${index}]`, `updateCheckpoints[${index}]`),
            fix: '请修正 updateCheckpoints 的 title / plannedActions / planItems / dependsOn / validation 后重试',
          }
        }

        const mergedCheckpoint = toBlueprintCheckpoint(mergedCheckpointInput)
        if (currentCheckpoint.note) {
          mergedCheckpoint.note = currentCheckpoint.note
        }

        nextCheckpoints.splice(checkpointIndex, 1)
        if (checkpointUpdate.insertAfter) {
          if (!nextCheckpoints.some((checkpoint) => checkpoint.id === checkpointUpdate.insertAfter)) {
            return {
              ok: false,
              code: 'INVALID_BLUEPRINT',
              msg: `insertAfter 指向不存在的 checkpoint: ${checkpointUpdate.insertAfter}`,
              fix: '请先 blueprint.describe 确认插入位置，或省略 insertAfter 保持原位置',
            }
          }
          insertCheckpoint(nextCheckpoints, mergedCheckpoint, checkpointUpdate.insertAfter)
        } else {
          nextCheckpoints.splice(checkpointIndex, 0, mergedCheckpoint)
        }
      }
    }

    const integrityError = validateBlueprintIntegrity(nextCheckpoints)
    if (integrityError) {
      return {
        ok: false,
        code: 'INVALID_BLUEPRINT',
        msg: integrityError,
        fix: '请修正 checkpoint / plan item 的 ID、依赖和关联关系后重试',
      }
    }

    blueprint.checkpoints = nextCheckpoints

    if (params.updateOpenQuestions) {
      blueprint.openQuestions = params.updateOpenQuestions
    }

    const afterSnapshot = snapshotBlueprintStructure({
      ...blueprint,
      checkpoints: nextCheckpoints,
      openQuestions: params.updateOpenQuestions ?? blueprint.openQuestions,
    })
    if (beforeSnapshot === afterSnapshot) {
      return {
        ok: false,
        code: 'NO_BLUEPRINT_CHANGE',
        msg: '本次 blueprint.revise 没有产生任何实际结构变更',
        fix: '请提供 addCheckpoints、removeCheckpointIds、updateOpenQuestions，或先 blueprint.describe 后给出可执行的修订',
      }
    }

    blueprint.lastReflection = params.reason
    normalizeBlueprintPointers(blueprint)
    syncPhase(state)

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

// ═══════════════════════════════════════════════════════════
// Stills: Verification (2) — 验证下沉到 still，脚本层只做编排
// ═══════════════════════════════════════════════════════════

interface CoverageIssue {
  scope: string
  check: string
  passed: boolean
  detail?: string
}

/**
 * 收集蓝图结构完整性问题（仅限蓝图域自身关注点）：
 * - 蓝图 checkpoints 完成率
 * - plan items 完成率
 * - 依赖链完整性
 *
 * patchLog 执行覆盖、下游域 phase 协调由会话层（session.describe）负责。
 * 蓝图域只输出计划，不监控执行。
 */
function collectBlueprintIssues(blueprint: ExecutionBlueprint): CoverageIssue[] {
  const issues: CoverageIssue[] = []

  // ── 1. Checkpoint 完成率 ──
  const pendingCheckpoints = blueprint.checkpoints.filter((cp) => cp.status === 'pending')
  issues.push({
    scope: 'blueprint',
    check: '所有 checkpoints 已完成',
    passed: pendingCheckpoints.length === 0,
    ...(pendingCheckpoints.length > 0
      ? { detail: `${pendingCheckpoints.length} 个未完成: ${pendingCheckpoints.map((cp) => cp.id).join(', ')}` }
      : {}),
  })

  // ── 2. Plan item 完成率 ──
  const allPlanItems = blueprint.checkpoints.flatMap((cp) => cp.planItems)
  const pendingItems = allPlanItems.filter((item) => item.status === 'pending')
  issues.push({
    scope: 'blueprint',
    check: '所有 plan items 已完成',
    passed: pendingItems.length === 0,
    ...(pendingItems.length > 0
      ? { detail: `${pendingItems.length} 个未完成: ${pendingItems.map((item) => item.id).join(', ')}` }
      : {}),
  })

  // ── 3. 依赖链无悬空引用 ──
  const checkpointIds = new Set(blueprint.checkpoints.map((cp) => cp.id))
  const planItemIds = new Set(allPlanItems.map((item) => item.id))

  for (const cp of blueprint.checkpoints) {
    for (const depId of cp.dependsOn ?? []) {
      if (!checkpointIds.has(depId)) {
        issues.push({
          scope: 'blueprint',
          check: `checkpoint ${cp.id} 依赖链完整`,
          passed: false,
          detail: `依赖 ${depId} 不存在`,
        })
      }
    }
    for (const item of cp.planItems) {
      for (const depId of item.dependsOn ?? []) {
        if (!planItemIds.has(depId)) {
          issues.push({
            scope: 'blueprint',
            check: `plan item ${item.id} 依赖链完整`,
            passed: false,
            detail: `依赖 ${depId} 不存在`,
          })
        }
      }
    }
  }

  return issues
}

// ─── blueprint.validateCoverage ────────────────────────────

export const blueprintValidateCoverage: StillDefinition<Record<string, never>, unknown> = {
  action: BLUEPRINT_VALIDATE_COVERAGE_ACTION,
  type: 'describe',
  description: '检查蓝图结构完整度：checkpoints/planItems 完成率 + 依赖链完整性',
  guard: guardBlueprint,
  guardDescription: guardBlueprintDesc,
  usageRules: [
    '蓝图域只检查"计划本身是否完整"，不监控执行覆盖。',
    'patchLog 执行覆盖由会话层 session.describe 负责。',
    'DataSet 数据正确性由 dataset.validate 负责。',
  ],
  paramsSchema: {},
  resultSchema: {
    valid: 'boolean — 全部检查通过',
    score: '{ total, passed } — 检查通过率',
    issues: 'CoverageIssue[] — { scope, check, passed, detail? }',
  },
  example: {},
  failureModes: [
    {
      code: 'NO_BLUEPRINT',
      when: '蓝图尚未创建',
      fix: '先 blueprint.create',
    },
  ],
  validate: () => null,
  execute: (session: IStillSession): StillResult => {
    const required = requireBP(session)
    if ('error' in required) return required.error

    const issues = collectBlueprintIssues(required.blueprint)
    const passed = issues.filter((i) => i.passed).length
    const total = issues.length
    const valid = issues.every((i) => i.passed)

    return {
      ok: true,
      data: {
        valid,
        score: { total, passed },
        issues,
        failedIssues: issues.filter((i) => !i.passed),
        hint: valid
          ? '蓝图执行覆盖完整，可以继续 dataset.export'
          : `共 ${total - passed} 项未通过，请修复后重新验证`,
      },
      summary: valid
        ? `覆盖度验证通过：${total} 项检查，0 个问题`
        : `覆盖度验证未通过：${total - passed}/${total} 个问题`,
    }
  },
}

// ─── blueprint.selfCheck ───────────────────────────────────

export const blueprintSelfCheck: StillDefinition<Record<string, never>, unknown> = {
  action: BLUEPRINT_SELF_CHECK_ACTION,
  type: 'describe',
  description: '蓝图结构审计：返回 checkpoint/planItem 进度清单 + 依赖图 + 问题列表',
  guard: guardBlueprint,
  guardDescription: guardBlueprintDesc,
  usageRules: [
    '蓝图域自检：只审计蓝图自身结构（进度/依赖/完整性）。',
    '执行追踪（patchLog）由会话层 session.describe 负责。',
    'DataSet 内部校验请调用 dataset.validate。',
  ],
  paramsSchema: {},
  resultSchema: {
    blueprint: '{ progress, phase, userGoal, pendingCheckpoints, pendingPlanItems }',
    issues: 'string[]',
  },
  example: {},
  validate: () => null,
  execute: (session: IStillSession): StillResult => {
    const required = requireBP(session)
    if ('error' in required) return required.error

    const blueprint = required.blueprint
    const bpPhase = required.state.phase
    const doneCount = countDoneCheckpoints(blueprint)
    const issues: string[] = []

    // ── 蓝图自身结构审计 ──
    const pendingCheckpoints = blueprint.checkpoints
      .filter((cp) => cp.status === 'pending')
      .map((cp) => ({
        id: cp.id,
        title: cp.title,
        pendingItems: cp.planItems.filter((item) => item.status === 'pending').length,
        totalItems: cp.planItems.length,
      }))

    const pendingPlanItems = blueprint.checkpoints.flatMap(
      (cp) => cp.planItems.filter((item) => item.status === 'pending').map((item) => ({
        id: item.id,
        action: item.action,
        checkpointId: cp.id,
      })),
    )

    if (pendingCheckpoints.length > 0) {
      issues.push(`${pendingCheckpoints.length} 个 checkpoint 未完成`)
    }
    if (pendingPlanItems.length > 0) {
      issues.push(`${pendingPlanItems.length} 个 plan item 未完成`)
    }

    // 依赖完整性
    const structureIssues = collectBlueprintIssues(blueprint)
    const failedStructureIssues = structureIssues.filter((i) => !i.passed)
    for (const issue of failedStructureIssues) {
      issues.push(issue.detail ?? issue.check)
    }

    return {
      ok: true,
      data: {
        blueprint: {
          userGoal: blueprint.userGoal,
          phase: bpPhase,
          progress: `${doneCount}/${blueprint.checkpoints.length}`,
          pendingCheckpoints,
          pendingPlanItems,
        },
        issues,
        issueCount: issues.length,
        hint: issues.length === 0
          ? '蓝图自检通过'
          : `发现 ${issues.length} 个问题，请修复后重新审计`,
      },
      summary: issues.length === 0
        ? '自检通过'
        : `自检发现 ${issues.length} 个问题`,
    }
  },
}

// ═══════════════════════════════════════════════════════════
// Domain Provider
// ═══════════════════════════════════════════════════════════

const lifecycleStills = [
  blueprintCreate,
  blueprintDescribe,
  blueprintAdvance,
  blueprintItemAdvance,
  blueprintRevise,
]

const verificationStills = [
  blueprintValidateCoverage,
  blueprintSelfCheck,
]

const allBlueprintStills = [
  ...lifecycleStills,
  ...verificationStills,
] as unknown as StillDefinition[]

/** Blueprint 域 — 7 个蓝图编排 + 验证 action */
export const blueprintDomain: DomainProvider<BlueprintDomainState> = {
  name: 'blueprint',
  roleHint: '蓝图编排层——管理执行计划、推进 checkpoint、验证覆盖度与自检',
  stills: allBlueprintStills,
  createState: createBlueprintState,
}
