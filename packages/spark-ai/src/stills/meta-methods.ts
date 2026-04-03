/**
 * Meta Methods
 *
 * 这个文件提供 still 系统自己的元动作，不参与实际建模：
 * 1. 枚举当前已注册的 still 动作；
 * 2. 查询单个动作的规格；
 * 3. 汇总当前会话状态。
 */

import type {
  StillDefinition,
  StillResult,
  IStillSession,
  ExecutionBlueprint,
  BlueprintExecutionMode,
} from './types'
import { noGuard } from './types'
import { getAllStills, getStill } from './dispatcher'
import { getDataSetSlot } from './dataset-domain'
import { getDomain } from './domain'

// ═══════════════════════════════════════════════════════════
// helper
// ═══════════════════════════════════════════════════════════

interface ActionCatalogItem {
  action: string
  type: string
  description: string
  guard?: string
  params?: Record<string, unknown>
  example?: Record<string, unknown>
}

interface BlueprintSummary {
  userGoal: string
  currentCheckpointId: string
  currentCheckpointTitle: string | null
  currentCheckpointPlannedActions: string[]
  currentCheckpointDependsOn: string[]
  currentExecutionMode: BlueprintExecutionMode | null
  totalCheckpoints: number
  completedCheckpoints: number
  openQuestions: string[]
}

function missingParam(name: string): string {
  return `缺少 ${name} 参数`
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function buildActionCatalog(): ActionCatalogItem[] {
  const actions: ActionCatalogItem[] = []

  for (const [, still] of getAllStills()) {
    actions.push({
      action: still.action,
      type: still.type,
      description: still.description,
      ...(still.guardDescription ? { guard: still.guardDescription } : {}),
      ...(still.paramsSchema && Object.keys(still.paramsSchema).length > 0
        ? { params: still.paramsSchema }
        : {}),
      ...(still.example && Object.keys(still.example).length > 0
        ? { example: still.example }
        : {}),
    })
  }

  return actions
}

function countTotalColumns(session: IStillSession): number {
  const dataset = getDataSetSlot(session).dataset
  if (dataset === null) return 0

  return Object.values(dataset.tables).reduce((sum, table) => sum + table.columns.length, 0)
}

function buildBlueprintSummary(blueprint: ExecutionBlueprint | null): BlueprintSummary | null {
  if (blueprint === null) return null

  const currentCheckpoint = blueprint.checkpoints.find(
    (checkpoint) => checkpoint.id === blueprint.currentCheckpointId,
  )

  return {
    userGoal: blueprint.userGoal,
    currentCheckpointId: blueprint.currentCheckpointId,
    currentCheckpointTitle: currentCheckpoint?.title ?? null,
    currentCheckpointPlannedActions: currentCheckpoint?.plannedActions ?? [],
    currentCheckpointDependsOn: currentCheckpoint?.dependsOn ?? [],
    currentExecutionMode: currentCheckpoint?.executionMode ?? null,
    totalCheckpoints: blueprint.checkpoints.length,
    completedCheckpoints: blueprint.checkpoints.filter((checkpoint) => checkpoint.status === 'done').length,
    openQuestions: blueprint.openQuestions,
  }
}

/** 根据当前会话状态推导推荐下一步。 */
function inferNextStep(
  session: IStillSession,
  slot: { dataset: unknown; schemaLocked: boolean },
  blueprintSummary: BlueprintSummary | null,
): string {
  if (session.blueprint === null) {
    return 'stills.capabilities → 了解可用动作，然后 blueprint.create → 创建蓝图'
  }
  if (slot.dataset === null) {
    return '按蓝图执行初始化动作'
  }
  if (blueprintSummary !== null && blueprintSummary.completedCheckpoints < blueprintSummary.totalCheckpoints) {
    const primaryAction = blueprintSummary.currentCheckpointPlannedActions[0]
    const dependencyHint = blueprintSummary.currentCheckpointDependsOn.length > 0
      ? `，依赖 ${blueprintSummary.currentCheckpointDependsOn.join(', ')}`
      : ''
    const executionHint = blueprintSummary.currentExecutionMode === 'subagent'
      ? '，当前项建议拆给子代理执行'
      : primaryAction
        ? `，优先动作 ${primaryAction}`
        : ''
    return `继续推进蓝图 checkpoint（${blueprintSummary.completedCheckpoints}/${blueprintSummary.totalCheckpoints}）${executionHint}${dependencyHint}`
  }
  if (blueprintSummary !== null && blueprintSummary.completedCheckpoints === blueprintSummary.totalCheckpoints) {
    return '所有 checkpoint 已完成，执行验证与导出'
  }
  return '查看 session.describe 确认状态后继续'
}

// ═══════════════════════════════════════════════════════════
// stills.capabilities
// ═══════════════════════════════════════════════════════════

export const stillsCapabilities: StillDefinition<Record<string, never>, unknown> = {
  action: 'stills.capabilities',
  type: 'describe',
  description: '返回当前可用动作目录，按命名空间分组',
  guard: noGuard,
  paramsSchema: {},
  example: {},
  validate: () => null,
  execute: (): StillResult => {
    const actions = buildActionCatalog()

    return {
      ok: true,
      data: {
        actions,
        total: actions.length,
        hint: '每个动作的 params 即参数格式，example 即最小示例。可用 stills.actionSpec 查更详细说明。',
      },
      summary: `返回 ${actions.length} 个可用动作（含参数格式与示例）`,
    }
  },
}

// ═══════════════════════════════════════════════════════════
// stills.actionSpec
// ═══════════════════════════════════════════════════════════

interface ActionSpecParams {
  action: string
}

export const stillsActionSpec: StillDefinition<ActionSpecParams, unknown> = {
  action: 'stills.actionSpec',
  type: 'describe',
  description: '返回指定动作的参数规格、guard、示例',
  guard: noGuard,
  paramsSchema: { action: 'string — 动作名' },
  example: { action: 'datatable.create' },
  validate: (params) => {
    if (!isNonEmptyString(params.action)) return missingParam('action')
    return null
  },
  execute: (_session: IStillSession, params: ActionSpecParams): StillResult => {
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
        guard: still.guardDescription ?? null,
        paramsSchema: still.paramsSchema ?? null,
        resultSchema: still.resultSchema ?? null,
        example: still.example ?? null,
      },
      summary: `返回动作 ${still.action} 的规格`,
    }
  },
}

// ═══════════════════════════════════════════════════════════
// session.describe
// ═══════════════════════════════════════════════════════════

export const sessionDescribe: StillDefinition<Record<string, never>, unknown> = {
  action: 'session.describe',
  type: 'describe',
  description: '返回当前角色、状态、推荐下一步',
  guard: noGuard,
  paramsSchema: {},
  example: {},
  validate: () => null,
  execute: (session: IStillSession): StillResult => {
    const slot = getDataSetSlot(session)
    const dataset = slot.dataset
    const blueprintSummary = buildBlueprintSummary(session.blueprint)

    // 聚合所有已注册域的 roleHint
    const roles: string[] = []
    const datasetDomain = getDomain('dataset')
    if (datasetDomain?.roleHint) {
      roles.push(datasetDomain.roleHint)
    }

    const datasetSummary = dataset
      ? {
          dataSetName: dataset.dataSetName,
          tables: Object.keys(dataset.tables).length,
          totalColumns: countTotalColumns(session),
          relations: dataset.tableRelations?.length ?? 0,
        }
      : null

    // 推荐下一步 — 基于当前状态推导
    const nextStep = inferNextStep(session, slot, blueprintSummary)

    return {
      ok: true,
      data: {
        role: roles.length > 0 ? roles.join('；') : '通用 Stills 助手',
        currentStep: slot.currentStep,
        schemaLocked: slot.schemaLocked,
        dataset: datasetSummary,
        blueprint: blueprintSummary,
        patchCount: session.patchLog.length,
        nextStep,
      },
      summary: '返回当前会话状态',
    }
  },
}
