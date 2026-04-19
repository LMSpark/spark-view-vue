/**
 * Meta Methods — Still 系统元动作集
 *
 * 本文件专注于 still 系统的"自描述能力"，不参与实际建模，职责分为三类：
 *
 *  1. 动作目录枚举（stills.capabilities）  — 让 LLM 快速了解可用动作全集
 *  2. 动作/组件规格查询（stills.actionSpec）— 按名称精查单个 still 或渲染器组件
 *  3. 会话全局状态汇总（session.describe） — 聚合所有域的 phase/health 与执行追踪
 *  4. 组件目录查询（catalog.query）         — 按 type / category 查渲染器组件列表
 *
 * 约束：
 *  - 本文件所有 still 均为"只读/描述型"，不产生状态变更。
 *  - 元动作不依赖具体域状态（dataset / blueprint 仅用于摘要展示）。
 *  - 组件规格由构建期生成的 component-catalog.json 驱动，不在运行时动态生成。
 */

// =========================================================
// 一、导入
// =========================================================

import type {
  DomainState,
  StillDefinition,
  StillResult,
  IStillSession,
  ExecutionBlueprint,
  BlueprintExecutionMode,
} from './types'
import { noGuard, readSessionBlueprint } from './types'
import { getAllStills, getStill } from './dispatcher'
import { getDataSetState } from './dataset-domain'
import { getEditState } from './edit-domain'
import { getDomain } from './domain'
import {
  projectFcDirectory,
  projectFcSpec,
} from '../catalog/catalog-projections'
import componentCatalog from '../catalog/component-catalog.json'
import type { ComponentCatalog } from '../catalog/types'
import type { StillsCatalogRegistry } from '../catalog/stills-catalog-types'

// =========================================================
// 二、内部类型定义（仅本模块使用）
// =========================================================

/**
 * 单个 still 动作在目录列表中的摘要形态。
 *
 * 只保留 LLM 调用时最常查阅的字段，完整规格请用 stills.actionSpec 精查。
 */
interface ActionCatalogItem {
  /** still 动作唯一名称，如 datatable.create。 */
  action: string
  /** 动作类型，如 create / update / describe。 */
  type: string
  /** 动作一句话说明。 */
  description: string
  /** 可选：执行前置条件说明（guard）。 */
  guard?: string
  /** 可选：使用规则要点列表。 */
  rules?: string[]
  /** 可选：可能返回的失败码列表，用于错误处理。 */
  failureCodes?: string[]
  /** 可选：参数格式，key→描述。 */
  params?: Record<string, unknown>
  /** 可选：最小调用示例。 */
  example?: Record<string, unknown>
}

/**
 * 执行蓝图的精简摘要，用于 session.describe 中展示蓝图进度。
 *
 * 只暴露 LLM 推断"下一步"所需的关键信息，完整蓝图结构由 blueprint.selfCheck 提供。
 */
interface BlueprintSummary {
  /** 用户原始目标描述。 */
  userGoal: string
  /** 当前正在推进的 checkpoint id。 */
  currentCheckpointId: string
  /** 当前 checkpoint 标题，无则为 null。 */
  currentCheckpointTitle: string | null
  /** 当前 checkpoint 的计划动作列表（按序）。 */
  currentCheckpointPlannedActions: string[]
  /** 当前 checkpoint 所依赖的其他 checkpoint id 列表。 */
  currentCheckpointDependsOn: string[]
  /** 当前 checkpoint 建议执行模式（如 subagent）。 */
  currentExecutionMode: BlueprintExecutionMode | null
  /** 蓝图中 checkpoint 总数。 */
  totalCheckpoints: number
  /** 已完成（status === 'done'）的 checkpoint 数量。 */
  completedCheckpoints: number
  /** 蓝图中尚未解决的开放问题列表。 */
  openQuestions: string[]
}

/**
 * stills.actionSpec 动作的参数结构。
 *
 * action 同时支持 still 动作名和渲染器组件 type，两者共用一个入口。
 */
interface ActionSpecParams {
  /** still 动作名（如 datatable.create）或组件 type（如 r-table）。 */
  action: string
}

/**
 * catalog.query 动作的参数结构。
 *
 * 三种查询模式通过参数是否存在来区分，详见动作实现。
 */
interface CatalogQueryParams {
  /** 可选：精确匹配组件 type，返回单组件完整规格。 */
  type?: string
  /** 可选：按分类过滤（container | field | group | meta）。 */
  category?: string
}

// =========================================================
// 三、基础工具函数
// =========================================================

/** 生成"缺少参数"标准错误文案，用于 validate 返回值。 */
function missingParam(name: string): string {
  return `缺少 ${name} 参数`
}

/** 判断值是否为非空字符串（类型守卫），用于参数存在性检查。 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

// =========================================================
// 四、动作目录构建
// =========================================================

/**
 * 从全局 still 注册表构建目录摘要列表。
 *
 * 只将 LLM 常用字段投影出来，规避暴露内部实现细节（如 execute 函数）。
 * 可选字段（guard / rules / failureCodes / params / example）仅在有值时输出，
 * 保持输出精简，降低 LLM 上下文占用。
 */
function buildActionCatalog(): ActionCatalogItem[] {
  const actions: ActionCatalogItem[] = []

  for (const [, still] of getAllStills()) {
    actions.push({
      action: still.action,
      type: still.type,
      description: still.description,
      // 仅在有 guard 描述时输出，避免空字段干扰 LLM。
      ...(still.guardDescription ? { guard: still.guardDescription } : {}),
      ...(still.usageRules && still.usageRules.length > 0 ? { rules: still.usageRules } : {}),
      // failureCodes 只取 code 字符串，完整模式由 stills.actionSpec 精查。
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

// =========================================================
// 五、蓝图摘要与数据集统计
// =========================================================

/**
 * 统计当前 DataSet 中所有表的字段总数。
 *
 * 用于 session.describe 中的数据集概览，DataSet 未初始化时返回 0。
 */
function countTotalColumns(session: IStillSession): number {
  const dataset = getEffectiveDatasetState(session).data
  if (dataset === null) return 0

  return Object.values(dataset.tables).reduce((sum, table) => sum + table.columns.length, 0)
}

function getEffectiveDatasetState(session: IStillSession): DomainState {
  const datasetDomain = session.domains['dataset']
  if (datasetDomain) {
    return getDataSetState(session)
  }

  const editDomain = session.domains['edit']
  if (editDomain) {
    const editState = getEditState(session)
    return {
      data: editState.datasetEdit ? editState.datasetEdit.toJson() : null,
      phase: editState.phase,
    }
  }

  return { data: null, phase: 'idle' }
}

/**
 * 把执行蓝图（ExecutionBlueprint）压缩为摘要视图。
 *
 * 摘要只保留 LLM 推断当前状态所需的最少字段，
 * 不包含每个 checkpoint 的完整动作列表，完整蓝图请用 blueprint.selfCheck。
 *
 * @returns 摘要对象，蓝图为 null 时返回 null。
 */
function buildBlueprintSummary(blueprint: ExecutionBlueprint | null): BlueprintSummary | null {
  if (blueprint === null) return null

  // 在 checkpoints 列表中定位当前 checkpoint，用于提取 title、plannedActions 等字段。
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

// =========================================================
// 六、推荐步骤推导
// =========================================================

/**
 * 根据当前会话状态推导"推荐下一步"文案。
 *
 * 推导优先级：
 *  1. 尚无蓝图 → 先了解能力 + 创建蓝图
 *  2. 有蓝图但 DataSet 为空 → 按蓝图执行初始化
 *  3. 蓝图进行中 → 提示当前 checkpoint 的优先动作 / subagent 建议 / 依赖项
 *  4. 蓝图已全部完成 → 执行验证与导出
 *  5. 其他兜底 → 引导查看 session.describe
 */
function inferNextStep(
  session: IStillSession,
  datasetState: DomainState,
  blueprintSummary: BlueprintSummary | null,
): string {
  // 阶段 1：尚无执行蓝图，先建立全局计划。
  if (readSessionBlueprint(session) === null) {
    return 'stills.capabilities → 了解可用动作，然后 blueprint.create → 创建蓝图'
  }

  // 阶段 2：蓝图存在但 DataSet 尚未初始化，需要先执行建模动作。
  if (datasetState.data === null) {
    return '按蓝图执行初始化动作'
  }

  // 阶段 3：蓝图进行中，提示当前 checkpoint 的执行建议。
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

  // 阶段 4：所有 checkpoint 已完成，进入验证收尾阶段。
  if (blueprintSummary !== null && blueprintSummary.completedCheckpoints === blueprintSummary.totalCheckpoints) {
    return '所有 checkpoint 已完成，执行验证与导出'
  }

  // 兜底：无法推断时引导用户自查。
  return '查看 session.describe 确认状态后继续'
}

// =========================================================
// 七、组件规格工具函数（stills.actionSpec 专用）
// =========================================================

/**
 * 生成"查询结果为组件规格而非 still 动作"的使用说明。
 *
 * 当 LLM 以组件 type 调用 stills.actionSpec 时，返回的规格结构与 still 不同，
 * 这里给出引导提示，避免 LLM 混淆两种规格格式。
 */
function buildComponentSpecUsageRules(componentType: string): string[] {
  return [
    '当前返回的是组件配置规格，不是 still 动作执行规格。',
    '如需查动作参数，请继续用 stills.capabilities 或 stills.actionSpec 查询真正的 still action。',
    `可直接复用当前参数格式继续精查其他组件：stills.actionSpec {"action":"${componentType}"}`,
  ]
}

// =========================================================
// 八、stills.capabilities — 动作目录枚举
// =========================================================

/**
 * stills.capabilities
 *
 * 返回当前系统所有已注册 still 动作的摘要目录，是 LLM 了解能力边界的入口。
 *
 * 场景：
 *  - 会话开始时快速浏览所有动作（总览）。
 *  - 判断某个目标是否可执行前的前置查询。
 *
 * 输出结构：
 *  - actions[]  : 按注册顺序排列的动作摘要列表。
 *  - total      : 动作总数（用于确认是否加载完整）。
 *  - hint       : 引导说明（规格精查入口 stills.actionSpec）。
 */
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
        // hint 引导 LLM 利用 stills.actionSpec 做进一步精查，避免单次上下文过大。
        hint: '每个动作的 params 即参数格式，example 即最小示例；rules / failureCodes 是关键约束。高风险动作可用 stills.actionSpec 查完整规格。',
      },
      summary: `返回 ${actions.length} 个可用动作（含参数格式与示例）`,
    }
  },
}

// =========================================================
// 九、stills.actionSpec — 动作/组件规格精查
// =========================================================

/**
 * stills.actionSpec
 *
 * 返回指定 still 动作或渲染器组件 type 的完整规格。
 *
 * 查询优先级：
 *  1. 先在 still 注册表中精确匹配 action 名称。
 *  2. 若未命中，在 component-catalog 中按 type 匹配组件。
 *  3. 两者均未命中，返回 UNKNOWN_ACTION 错误。
 *
 * 注意：
 *  still 规格 和 组件规格 的数据结构不同（subjectKind 字段用于区分），
 *  调用方不应假定返回格式完全一致。
 */
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

    const componentSpec = projectFcSpec(componentCatalog as ComponentCatalog, params.action)
    if (componentSpec !== null) {
      const specType = componentSpec.type
      return {
        ok: true,
        data: {
          action: specType,
          subjectKind: 'component',
          type: 'component',
          componentType: specType,
          category: componentSpec.category,
          description: componentSpec.description,
          props: componentSpec.props,
          emits: componentSpec.emits,
          rootFields: componentSpec.rootFields ?? [],
          binding: componentSpec.binding ?? null,
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

    // still 与组件均未命中，返回统一错误并引导下一步。
    return {
      ok: false,
      code: 'UNKNOWN_ACTION',
      msg: `未知动作或组件: ${params.action}`,
      fix: '请先查 session.describe 获取组件目录，或查 stills.capabilities 获取动作列表',
    }
  },
}

// =========================================================
// 十、session.describe — 会话全局状态汇总
// =========================================================

/**
 * session.describe
 *
 * 聚合当前会话所有域的运行状态，包括：
 *  - 域状态总览（phase / initialized / roleHint）
 *  - 执行追踪（patchLog 中各动作执行次数）
 *  - 渲染器组件目录入口
 *  - DataSet 概览（表数、字段数、关系数）
 *  - 蓝图进度摘要
 *  - 推荐下一步文案（由 inferNextStep 推导）
 *
 * 使用场景：
 *  - LLM 或调试工具快速了解当前会话的整体健康状态。
 *  - 推断接下来应执行的动作（nextStep 字段）。
 *
 * 约束：
 *  - 只做聚合展示，不做任何域状态变更。
 *  - 各域深度自检请调用对应域 still（blueprint.selfCheck / dataset.validate）。
 */
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
    const datasetState = getEffectiveDatasetState(session)
    const dataset = datasetState.data
    const blueprintSummary = buildBlueprintSummary(readSessionBlueprint(session))
    const componentsDirectory = {
      ...projectFcDirectory(componentCatalog as ComponentCatalog),
      querySpecExample: 'stills.actionSpec {"action":"r-table"}',
    }

    // 步骤 1：聚合所有已注册域的角色描述与运行状态。
    // roleHint 由各域定义（getDomain），用于向 LLM 说明该域的职责边界。
    const roles: string[] = []
    const domainsSummary: Record<string, { phase: string; initialized: boolean; roleHint?: string }> = {}
    for (const [domainName, domainState] of Object.entries(session.domains)) {
      const domainDef = getDomain(domainName)
      if (domainDef?.roleHint) roles.push(domainDef.roleHint)
      domainsSummary[domainName] = {
        phase: domainState.phase,
        // initialized 为 true 表示该域已完成初始化（data !== null）。
        initialized: domainState.data !== null,
        ...(domainDef?.roleHint ? { roleHint: domainDef.roleHint } : {}),
      }
    }

    // 步骤 2：按动作名聚合 patchLog 执行次数，用于追踪各动作的调用频率。
    const actionCounts: Record<string, number> = {}
    for (const entry of session.patchLog) {
      actionCounts[entry.action] = (actionCounts[entry.action] ?? 0) + 1
    }

    // 步骤 3：DataSet 摘要，未初始化时输出 null（LLM 可据此判断是否需要初始化）。
    const datasetSummary = dataset
      ? {
          dataSetName: dataset.dataSetName,
          tables: Object.keys(dataset.tables).length,
          totalColumns: countTotalColumns(session),
          relations: dataset.tableRelations?.length ?? 0,
        }
      : null

    // 步骤 4：基于当前所有域状态推导推荐下一步，帮助 LLM 直接获得行动建议。
    const nextStep = inferNextStep(session, datasetState, blueprintSummary)

    return {
      ok: true,
      data: {
        // role：将所有域的 roleHint 合并为一句描述，无则降级为通用角色。
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

// =========================================================
// 十一、catalog.query — 渲染器组件目录查询
// =========================================================

/**
 * catalog.query
 *
 * 根据参数组合以三种模式查询渲染器组件目录：
 *
 *  模式 1（精查）: 指定 type → 返回单组件完整规格（props + emits + rootFields + binding + nestingRule）
 *  模式 2（分类）: 指定 category → 返回该分类的组件列表（type + description）
 *  模式 3（全量）: 无参数 → 返回所有组件的轻量列表（type + category + description）
 *
 * 使用场景：
 *  - 构建 rule.json 前确认组件 props 格式。
 *  - 列举某类组件（如所有 field）选择合适类型。
 *  - 在 session.describe 返回的目录基础上做进一步精查。
 *
 * 注意：catalog 由构建期生成，运行时只读；若 session.catalog 为 null，
 *  说明构建产物未正确注入，这是部署问题而非运行时问题。
 */
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
        msg: 'Stills Catalog 未加载',
        fix: '请确认构建时已生成组件目录',
      }
    }
    const catalog = session.catalog

    // 模式 1：按 type 精查单组件，返回完整 API 规格（props / emits / rootFields / binding / nestingRule）。
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

    // 模式 2：按 category 过滤，返回该分类的组件类型列表（轻量）。
    if (isNonEmptyString(params.category)) {
      const registryKey = params.category as keyof StillsCatalogRegistry
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

    // 模式 3：无参数时返回全量轻量列表（type + category + description），适合做快速概览。
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
