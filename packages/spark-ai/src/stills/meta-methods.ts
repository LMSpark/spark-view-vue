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
  SessionDomainState,
  StillDefinition,
  StillResult,
  IStillSession,
  ExecutionBlueprint,
  BlueprintExecutionMode,
} from './types'
import { noGuard, readSessionBlueprint } from './types'
import { getAllStills, getStill } from './dispatcher'
import { getActiveDataSetTool, getEditState } from './edit/edit-state'
import { getDomain } from './domain'
import {
  projectComponentDirectory,
  projectComponentSpec,
  projectComponentConfigGuide,
} from '../catalog/catalog-projections'
import type { IDataSetMetadata } from '@spark-view/spark-data'
import componentCatalogJson from '../catalog/component-catalog.json'
import type { ComponentCatalog } from '../catalog/types'
import type { StillsCatalogRegistry } from '../catalog/stills-catalog-types'
import {
  STILLS_CAPABILITIES_ACTION,
  STILLS_ACTION_SPEC_ACTION,
  DATATABLE_CREATE_ACTION,
  SESSION_DESCRIBE_ACTION,
  CATALOG_QUERY_ACTION,
  CATALOG_GUIDE_ACTION,
} from './action-names'
import { functionNameToAction } from '../fc-schema'

// =========================================================
// 二、静态目录依赖与内部类型定义
// =========================================================

/**
 * 构建期直接注入的完整组件目录（rich catalog）。
 *
 * 与 session.catalog 的区别：
 * - 这里读取的是 packages/spark-ai/src/catalog/component-catalog.json，
 *   包含完整组件规格，适合 stills.actionSpec / session.describe 这类“元查询”。
 * - session.catalog 是运行时挂到会话上的轻量 Stills Catalog，
 *   更适合 catalog.query 这种按列表/分类读取的查询场景。
 *
 * 这层常量的目的，是把“静态完整目录”的使用边界集中收口，避免后续代码里散落
 * `componentCatalog as ComponentCatalog` 这种重复断言写法。
 */
const STATIC_COMPONENT_CATALOG: ComponentCatalog = componentCatalogJson as ComponentCatalog

/**
 * 单个 still 动作在目录列表中的摘要形态。
 *
 * 只保留 LLM 调用时最常查阅的字段，完整规格请用 stills.actionSpec 精查。
 */
interface ActionCatalogItem {
  /** still 动作唯一名称，如 datatable.create。 */
  action: string
  /** 动作类型，如 request / describe。 */
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
 * 目录模式通过参数是否存在来区分：
 *  - 无参数  → 全量列表
 *  - category → 分类列表
 *
 * 若需要查询单组件的详细配置规格，请改用 catalog.guide。
 */
interface CatalogQueryParams {
  /** 可选：按分类过滤（container | field | group | meta）。 */
  category?: string
}

/**
 * catalog.guide 动作的参数结构。
 *
 * 精确匹配组件 type，返回单组件完整配置指南（含必填/可选分组、最小示例、fail-fast 自检）。
 */
interface CatalogGuideParams {
  /** 必填：精确匹配的组件 type，如 "r-table"。 */
  type: string
}

/**
 * session.describe 中对单个域的摘要视图。
 *
 * 只保留会话级监控最关心的三项信息：当前 phase、是否已初始化、以及该域的职责提示。
 */
interface DomainStateSummary {
  /** 域当前阶段，例如 idle / ready / error。 */
  phase: string
  /** 该域是否已有可用数据。 */
  initialized: boolean
  /** 可选：域职责提示，用于给 LLM 补足角色边界。 */
  roleHint?: string
}

// =========================================================
// 三、基础工具函数与通用判定
// =========================================================

/** 生成"缺少参数"标准错误文案，用于 validate 返回值。 */
function missingParam(name: string): string {
  return `缺少 ${name} 参数`
}

/** 判断值是否为非空字符串（类型守卫），用于参数存在性检查。 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** 将 catalog.query 的 category 参数映射到 registry key。 */
function resolveCatalogRegistryKey(category: string): keyof StillsCatalogRegistry | null {
  switch (category) {
    case 'container':
      return 'containers'
    case 'field':
      return 'fields'
    case 'group':
      return 'groups'
    case 'meta':
      return 'meta'
    default:
      return null
  }
}

/**
 * 判断某个域是否已经挂载了有效数据。
 *
 * session.describe 需要把 phase 与“是否真的初始化完成”区分开，
 * 因此这里不能只看 phase，还需要检查 data 是否存在。
 */
function hasDomainData(domainState: SessionDomainState<string>): boolean {
  return 'data' in domainState && domainState.data !== null
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

// =========================================================
// 五、蓝图摘要与数据集统计
// =========================================================

/**
 * 统计当前 DataSet 中所有表的字段总数。
 *
 * 用于 session.describe 中的数据集概览，DataSet 未初始化时返回 0。
 */
function countTotalColumns(session: IStillSession): number {
  const dataset = getEffectiveDatasetSnapshot(session)
  if (dataset === null) return 0

  return Object.values(dataset.tables).reduce((sum, table) => sum + table.columns.length, 0)
}

function getEffectiveDatasetSnapshot(session: IStillSession): IDataSetMetadata | null {
  if (session.domains['edit']) {
    const editState = getEditState(session)
    const tool = getActiveDataSetTool(editState)
    return tool ? tool.toJson() : null
  }

  return null
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

/**
 * 汇总会话中所有域的运行状态，并同时收集角色提示。
 *
 * 这是 session.describe 的核心聚合步骤之一：
 * - roles 用于拼接顶层 role 文案；
 * - domainsSummary 用于按域返回 phase / initialized / roleHint。
 */
function buildDomainsSummary(session: IStillSession): {
  roles: string[]
  domainsSummary: Record<string, DomainStateSummary>
} {
  const roles: string[] = []
  const domainsSummary: Record<string, DomainStateSummary> = {}

  for (const [domainName, domainState] of Object.entries(session.domains)) {
    const domainDef = getDomain(domainName)
    if (domainDef?.roleHint) roles.push(domainDef.roleHint)

    domainsSummary[domainName] = {
      phase: domainState.phase,
      initialized: hasDomainData(domainState),
      ...(domainDef?.roleHint ? { roleHint: domainDef.roleHint } : {}),
    }
  }

  return { roles, domainsSummary }
}

/**
 * 汇总 patchLog 中各动作的执行次数。
 *
 * session.describe 不是逐条返回 patchLog 明细，而是把它压缩成聚合计数，
 * 便于 LLM 快速判断“最近都执行过哪些动作、频率如何”。
 */
function buildExecutionTraceSummary(session: IStillSession): {
  totalActions: number
  actionCounts: Record<string, number>
} {
  const actionCounts: Record<string, number> = {}

  for (const entry of session.patchLog) {
    actionCounts[entry.action] = (actionCounts[entry.action] ?? 0) + 1
  }

  return {
    totalActions: session.patchLog.length,
    actionCounts,
  }
}

/**
 * 构造 DataSet 的轻量摘要。
 *
 * 这里只返回会话总览所需的概览字段，不回传完整 DataSet JSON，
 * 以避免 session.describe 输出过大。
 */
function buildDatasetSummary(session: IStillSession, dataset: IDataSetMetadata | null) {
  if (dataset === null) return null

  return {
    dataSetName: dataset.dataSetName,
    tables: Object.keys(dataset.tables).length,
    totalColumns: countTotalColumns(session),
    relations: dataset.tableRelations?.length ?? 0,
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
  datasetSnapshot: IDataSetMetadata | null,
  blueprintSummary: BlueprintSummary | null,
): string {
  // 阶段 1：尚无执行蓝图，先建立全局计划。
  if (readSessionBlueprint(session) === null) {
    return 'stills.capabilities → 了解可用动作，然后 blueprint.create → 创建蓝图'
  }

  // 阶段 2：蓝图存在但 DataSet 尚未初始化，需要先执行建模动作。
  if (datasetSnapshot === null) {
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
// 七、静态组件目录辅助（stills.actionSpec / session.describe）
// =========================================================

/**
 * 从静态完整目录里按 type 查询组件规格。
 *
 * 这个查询与 catalog.query 不同：
 * - 这里走的是完整 component-catalog.json；
 * - 目的是拿到更完整的 props / emits / binding 等规格信息。
 */
function getStaticComponentSpec(componentType: string) {
  return projectComponentSpec(STATIC_COMPONENT_CATALOG, componentType)
}

/**
 * 为 session.describe 构建组件目录入口摘要。
 *
 * 这里返回的是“目录入口”而不是全量组件详情，重点是给会话全局状态一个稳定的入口，
 * 并附带 catalog.query 的最小精查示例。
 */
function buildStaticComponentsDirectorySummary() {
  return {
    ...projectComponentDirectory(STATIC_COMPONENT_CATALOG),
    queryGuideExample: 'catalog.guide {"type":"r-table"}',
  }
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
  action: STILLS_CAPABILITIES_ACTION,
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
// 九、stills.actionSpec — 动作规格精查
// =========================================================

/**
 * stills.actionSpec
 *
 * 返回指定 still 动作的完整规格。
 *
 * 查询优先级：
 *  1. 先在 still 注册表中精确匹配 action 名称。
 *  2. 若未命中但命中组件 type，明确返回“组件应走 catalog.query”的引导错误。
 *  3. 两者均未命中，返回 UNKNOWN_ACTION 错误。
 */
export const stillsActionSpec: StillDefinition<ActionSpecParams, unknown> = {
  action: STILLS_ACTION_SPEC_ACTION,
  type: 'describe',
  description: '返回指定 still 动作的详细规格（组件定义请使用 catalog.query）',
  guard: noGuard,
  paramsSchema: { action: 'string — still 动作名' },
  example: { action: DATATABLE_CREATE_ACTION },
  validate: (params) => {
    if (!isNonEmptyString(params.action)) return missingParam('action')
    return null
  },
  execute: (_session: IStillSession, params: ActionSpecParams): StillResult => {
    const canonicalAction = functionNameToAction(params.action)
    const still = getStill(params.action) ?? getStill(canonicalAction)
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

    // 若未命中 still 动作，但命中组件 type，则显式引导改走 catalog.query。
    const componentSpec = getStaticComponentSpec(params.action)
    if (componentSpec !== null) {
      const specType = componentSpec.type
      return {
        ok: false,
        code: 'COMPONENT_QUERY_REQUIRED',
        msg: `${specType} 是组件 type，不是 still 动作名`,
        fix: `请改用 catalog.query 查询组件定义：catalog.query {"type":"${specType}"}。动作能力参数请继续使用 stills.actionSpec（action 传真实动作名）。`,
      }
    }

    // 未命中任何 still 动作，返回统一错误并引导下一步。
    return {
      ok: false,
      code: 'UNKNOWN_ACTION',
      msg: `未知动作: ${params.action}`,
      fix: '请先查 stills.capabilities 获取动作列表；FC 下划线函数名与点号动作名都可用于 stills.actionSpec；组件定义请使用 catalog.query。',
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
  action: SESSION_DESCRIBE_ACTION,
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
    const dataset = getEffectiveDatasetSnapshot(session)
    const blueprintSummary = buildBlueprintSummary(readSessionBlueprint(session))
    const componentsDirectory = buildStaticComponentsDirectorySummary()

    // 步骤 1：统一收口域摘要聚合，避免 execute 内部堆叠过多会话遍历逻辑。
    const { roles, domainsSummary } = buildDomainsSummary(session)

    // 步骤 2：聚合 patchLog 执行痕迹，便于观察动作调用频率。
    const executionTrace = buildExecutionTraceSummary(session)

    // 步骤 3：DataSet 摘要，未初始化时输出 null（LLM 可据此判断是否需要初始化）。
    const datasetSummary = buildDatasetSummary(session, dataset)

    // 步骤 4：基于当前所有域状态推导推荐下一步，帮助 LLM 直接获得行动建议。
    const nextStep = inferNextStep(session, dataset, blueprintSummary)

    return {
      ok: true,
      data: {
        // role：将所有域的 roleHint 合并为一句描述，无则降级为通用角色。
        role: roles.length > 0 ? roles.join('；') : '通用 Stills 助手',
        domains: domainsSummary,
        executionTrace,
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
// 十一、catalog.query — 渲染器组件目录（Directory）
// =========================================================

/**
 * catalog.query
 *
 * 纯目录查询（Component Directory）——返回可用组件列表，不含单组件配置指南。
 *
 *  模式 1（分类）: 指定 category → 返回该分类的组件列表（type + description）
 *  模式 2（全量）: 无参数 → 返回所有组件的轻量列表（type + category + description）
 *
 * 使用场景：
 *  - 选型阶段：了解有哪些组件可用，按分类浏览。
 *  - 确定目标 type 后，调用 catalog.guide 获取该组件的完整配置指南。
 *
 * 注意：catalog 由构建期生成，运行时只读；查询严格依赖 session.catalog。
 */
export const catalogQuery: StillDefinition<CatalogQueryParams, unknown> = {
  action: CATALOG_QUERY_ACTION,
  type: 'describe',
  description: '组件目录：无参数返回全量列表；指定 category 返回分类列表。按 type 查配置指南请用 catalog.guide。',
  guard: noGuard,
  paramsSchema: { category: '可选，container|field|group|meta' },
  example: { category: 'field' },
  validate: () => null,
  execute: (session: IStillSession, params: CatalogQueryParams): StillResult => {
    const queryCategory = isNonEmptyString(params.category) ? params.category : null

    if (params.category !== undefined && queryCategory === null) {
      return { ok: false, code: 'INVALID_PARAMS', msg: 'category 必须是非空字符串', fix: '仅支持 container | field | group | meta' }
    }

    if (session.catalog === null) {
      return {
        ok: false,
        code: 'NO_CATALOG',
        msg: 'Stills Catalog 未加载',
        fix: '请确认 createSession 时已注入 catalog',
      }
    }

    const catalog = session.catalog

    // 模式 1：按 category 过滤，返回该分类的组件类型列表（轻量）。
    if (queryCategory !== null) {
      const registryKey = resolveCatalogRegistryKey(queryCategory)
      if (registryKey === null) {
        return { ok: false, code: 'INVALID_CATEGORY', msg: `非法 category: ${queryCategory}`, fix: '仅支持 container | field | group | meta' }
      }

      const types = catalog.registry[registryKey]
      const list = types.map((t) => ({
        type: t,
        description: catalog.components[t]?.description ?? '',
      }))
      return {
        ok: true,
        data: { category: queryCategory, count: list.length, components: list },
        summary: `${queryCategory}: ${list.length} 组件`,
      }
    }

    // 模式 2：无参数时返回全量轻量列表（type + category + description），适合做快速概览。
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

// =========================================================
// 十二、catalog.guide — 单组件配置指南（Component Config Guide）
// =========================================================

/**
 * catalog.guide
 *
 * 按 type 精查单组件，返回完整配置指南（Component Config Guide）：
 *  - 必填 / 可选属性分组（requiredProps / optionalProps）
 *  - 事件使用指南（eventGuide）
 *  - 数据绑定能力摘要（bindingGuide）
 *  - 根字段路径（rootFieldPaths）
 *  - 最小安全配置示例（minimalConfig）
 *  - fail-fast 自检清单（failFastChecks）
 *
 * 使用场景：
 *  - 用 catalog.query 确定目标组件 type 后，调用本动作获取配置指南。
 *  - 构建 rule.json / SparkNode 前，依据 minimalConfig 与 failFastChecks 自检。
 *
 * 与 catalog.query 的区别：
 *  - catalog.query → 组件目录（Directory）：了解有哪些组件可用
 *  - catalog.guide → 组件配置指南（Config Guide）：了解如何配置某个组件
 */
export const catalogGuide: StillDefinition<CatalogGuideParams, unknown> = {
  action: CATALOG_GUIDE_ACTION,
  type: 'describe',
  description: '单组件配置指南：返回指定 type 的 props 分组、最小示例与 fail-fast 自检清单。',
  guard: noGuard,
  paramsSchema: { type: '必填，组件类型，如 "r-table"' },
  example: { type: 'r-table' },
  validate: (params) => {
    if (!isNonEmptyString(params.type)) return missingParam('type')
    return null
  },
  execute: (_session: IStillSession, params: CatalogGuideParams): StillResult => {
    const guide = projectComponentConfigGuide(STATIC_COMPONENT_CATALOG, params.type)
    if (guide === null) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        msg: `组件 "${params.type}" 不在目录中`,
        fix: '请先用 catalog.query 查看可用组件列表，确认 type 后再调用 catalog.guide',
      }
    }
    return {
      ok: true,
      data: guide,
      summary: `${params.type} 配置指南：${guide.requiredProps.length} 必填属性，${guide.optionalProps.length} 可选属性`,
    }
  },
}
