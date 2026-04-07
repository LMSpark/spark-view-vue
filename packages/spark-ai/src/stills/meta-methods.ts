/**
 * Meta Methods
 *
 * 这个文件提供 still 系统自己的元动作，不参与实际建模：
 * 1. 枚举当前已注册的 still 动作；
 * 2. 查询单个动作的规格；
 * 3. 汇总当前会话状态。
 */

import type {
  DomainState,
  StillDefinition,
  StillResult,
  IStillSession,
  ExecutionBlueprint,
  BlueprintExecutionMode,
} from './types'
import { noGuard } from './types'
import { getAllStills, getStill } from './dispatcher'
import { getDataSetState } from './dataset-domain'
import { getDomain } from './domain'
import {
  COMPONENT_DIRECTORY_DESCRIBE,
  getComponentSpec,
} from '../catalog/component-props-catalog'
import type { SapCatalogRegistry } from '../catalog/sap-catalog-types'

// ═══════════════════════════════════════════════════════════
// helper
// ═══════════════════════════════════════════════════════════

interface ActionCatalogItem {
  action: string
  type: string
  description: string
  guard?: string
  rules?: string[]
  failureCodes?: string[]
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
      ...(still.usageRules && still.usageRules.length > 0 ? { rules: still.usageRules } : {}),
      ...(still.failureModes && still.failureModes.length > 0
        ? { failureCodes: still.failureModes.map((failureMode) => failureMode.code) }
        : {}),
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
  const dataset = getDataSetState(session).data
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
  datasetState: DomainState,
  blueprintSummary: BlueprintSummary | null,
): string {
  if (session.blueprint === null) {
    return 'stills.capabilities → 了解可用动作，然后 blueprint.create → 创建蓝图'
  }
  if (datasetState.data === null) {
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
        hint: '每个动作的 params 即参数格式，example 即最小示例；rules / failureCodes 是关键约束。高风险动作可用 stills.actionSpec 查完整规格。',
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

function buildComponentSpecUsageRules(componentType: string): string[] {
  return [
    '当前返回的是组件配置规格，不是 still 动作执行规格。',
    '如需查动作参数，请继续用 stills.capabilities 或 stills.actionSpec 查询真正的 still action。',
    `可直接复用当前参数格式继续精查其他组件：stills.actionSpec {"action":"${componentType}"}`,
  ]
}

export const stillsActionSpec: StillDefinition<ActionSpecParams, unknown> = {
  action: 'stills.actionSpec',
  type: 'describe',
  description: '返回指定 still 动作或组件 type 的详细规格',
  guard: noGuard,
  paramsSchema: { action: 'string — still 动作名或组件 type' },
  example: { action: 'datatable.create' },
  validate: (params) => {
    if (!isNonEmptyString(params.action)) return missingParam('action')
    return null
  },
  execute: (_session: IStillSession, params: ActionSpecParams): StillResult => {
    const still = getStill(params.action)
    if (still) {
      return {
        ok: true,
        data: {
          action: still.action,
          subjectKind: 'still',
          type: still.type,
          description: still.description,
          guard: still.guardDescription ?? null,
          usageRules: still.usageRules ?? [],
          paramsSchema: still.paramsSchema ?? null,
          resultSchema: still.resultSchema ?? null,
          example: still.example ?? null,
          failureModes: still.failureModes ?? [],
        },
        summary: `返回动作 ${still.action} 的规格`,
      }
    }

    const componentSpec = getComponentSpec(params.action)
    if (componentSpec !== null) {
      const specType = componentSpec['type'] as string
      return {
        ok: true,
        data: {
          action: specType,
          subjectKind: 'component',
          type: 'component',
          componentType: specType,
          category: componentSpec['category'],
          description: componentSpec['description'],
          props: componentSpec['props'],
          emits: componentSpec['emits'] ?? [],
          rootFields: componentSpec['rootFields'] ?? [],
          binding: componentSpec['binding'] ?? null,
          notes: componentSpec['notes'] ?? null,
          guard: null,
          usageRules: buildComponentSpecUsageRules(specType),
          paramsSchema: null,
          resultSchema: null,
          example: { action: specType },
          failureModes: [],
        },
        summary: `返回组件 ${specType} 的规格`,
      }
    }

    return {
      ok: false,
      code: 'UNKNOWN_ACTION',
      msg: `未知动作或组件: ${params.action}`,
      fix: '请先查 session.describe 获取组件目录，或查 stills.capabilities 获取动作列表',
    }
  },
}

// ═══════════════════════════════════════════════════════════
// session.describe
// ═══════════════════════════════════════════════════════════

export const sessionDescribe: StillDefinition<Record<string, never>, unknown> = {
  action: 'session.describe',
  type: 'describe',
  description: '会话全局监控：返回所有域状态、执行追踪（patchLog）、推荐下一步',
  guard: noGuard,
  usageRules: [
    '会话层负责全局监控：聚合所有域的 phase/health，追踪 patchLog 执行进度。',
    '各域自检请调用域自身 still（blueprint.selfCheck / dataset.validate）。',
    '蓝图域只输出计划，会话层监控计划执行。',
  ],
  paramsSchema: {},
  example: {},
  validate: () => null,
  execute: (session: IStillSession): StillResult => {
    const datasetState = getDataSetState(session)
    const dataset = datasetState.data
    const blueprintSummary = buildBlueprintSummary(session.blueprint)
    const componentsDirectory = {
      ...COMPONENT_DIRECTORY_DESCRIBE,
      querySpecExample: 'stills.actionSpec {"action":"r-table"}',
    }

    // ── 聚合所有已注册域的角色与状态 ──
    const roles: string[] = []
    const domainsSummary: Record<string, { phase: string; initialized: boolean; roleHint?: string }> = {}
    for (const [domainName, domainState] of Object.entries(session.domains)) {
      const domainDef = getDomain(domainName)
      if (domainDef?.roleHint) roles.push(domainDef.roleHint)
      domainsSummary[domainName] = {
        phase: domainState.phase,
        initialized: domainState.data !== null,
        ...(domainDef?.roleHint ? { roleHint: domainDef.roleHint } : {}),
      }
    }

    // ── 执行追踪（patchLog）── 会话层全局职责 ──
    const actionCounts: Record<string, number> = {}
    for (const entry of session.patchLog) {
      actionCounts[entry.action] = (actionCounts[entry.action] ?? 0) + 1
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
    const nextStep = inferNextStep(session, datasetState, blueprintSummary)

    return {
      ok: true,
      data: {
        role: roles.length > 0 ? roles.join('；') : '通用 Stills 助手',
        domains: domainsSummary,
        executionTrace: {
          totalActions: session.patchLog.length,
          actionCounts,
        },
        components: componentsDirectory,
        dataset: datasetSummary,
        blueprint: blueprintSummary,
        nextStep,
      },
      summary: '返回会话全局状态（含域状态 + 组件目录 + 执行追踪）',
    }
  },
}

// ═══════════════════════════════════════════════════════════
// catalog.query
// ═══════════════════════════════════════════════════════════

interface CatalogQueryParams {
  type?: string
  category?: string
}

export const catalogQuery: StillDefinition<CatalogQueryParams, unknown> = {
  action: 'catalog.query',
  type: 'describe',
  description: '查询可用组件目录。无参数返回全量列表；指定 type 返回单组件详情；指定 category 返回分类列表。',
  guard: noGuard,
  paramsSchema: { type: '可选，组件类型', category: '可选，container|field|group|meta' },
  example: { category: 'field' },
  validate: () => null,
  execute: (session: IStillSession, params: CatalogQueryParams): StillResult => {
    if (session.catalog === null) {
      return {
        ok: false,
        code: 'NO_CATALOG',
        msg: 'SAP Catalog 未加载',
        fix: '请确认构建时已生成并上传 sap-catalog.json',
      }
    }
    const catalog = session.catalog

    // 模式 1: 单组件详情（返回完整 API：props + emits + rootFields + binding + nestingRule）
    if (isNonEmptyString(params.type)) {
      const entry = catalog.components[params.type]
      if (entry === undefined) {
        return { ok: false, code: 'NOT_FOUND', msg: `组件 "${params.type}" 不在目录中`, fix: '请用 catalog.query 查看可用组件列表' }
      }
      const parts = [`${entry.props.length} props`]
      if (entry.emits && entry.emits.length > 0) parts.push(`${entry.emits.length} emits`)
      if (entry.rootFields && entry.rootFields.length > 0) parts.push(`${entry.rootFields.length} rootFields`)
      if (entry.nestingRule) parts.push('有嵌套规则')
      return {
        ok: true,
        data: { type: params.type, ...entry },
        summary: `${params.type} (${entry.category}): ${parts.join(', ')}`,
      }
    }

    // 模式 2: 按 category 过滤
    if (isNonEmptyString(params.category)) {
      const registryKey = params.category as keyof SapCatalogRegistry
      const types = catalog.registry[registryKey]
      const list = types.map((t) => ({
        type: t,
        description: catalog.components[t]?.description ?? '',
      }))
      return {
        ok: true,
        data: { category: params.category, count: list.length, components: list },
        summary: `${params.category}: ${list.length} 组件`,
      }
    }

    // 模式 3: 全量列表
    const list = Object.entries(catalog.components).map(([type, e]) => ({
      type,
      category: e.category,
      description: e.description,
    }))
    return {
      ok: true,
      data: { total: list.length, components: list },
      summary: `共 ${list.length} 个可用组件`,
    }
  },
}
