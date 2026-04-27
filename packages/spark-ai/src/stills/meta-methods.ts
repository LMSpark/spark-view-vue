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
} from '../core/stills/types'
import type {
  ExecutionBlueprint,
  BlueprintExecutionMode,
} from '../business/project-planning/stills/blueprint-types'
import { noGuard } from '../core/stills/types'
import { readSessionBlueprint } from '../business/project-planning/stills/blueprint-session'
import { getAllStills, getStill } from '../core/stills/dispatcher'
import {
  missingParam,
  isNonEmptyString,
  buildExecutionTraceSummary,
} from '../core/stills/meta-common-utils'
import { getActiveDataSetTool, getEditState } from '../business/page-design/stills/edit/edit-lifecycle-stills'
import { getDomain } from '../core/stills/domain'
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
  QUERY_COMPONENT_CATALOG_ACTION,
  QUERY_COMPONENT_GUIDE_ACTION,
  INTERACTION_ASK_ACTION,
} from '../core/stills/action-names'
import { functionNameToAction } from '../core/fc-schema'

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

/** 单个 still 动作在目录列表中的摘要形态。 */
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

/** 执行蓝图的精简摘要。 */
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

/** session.describe 中的域摘要形态。 */
interface DomainStateSummary {
  phase: string
  initialized: boolean
  roleHint?: string
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
  category?: unknown
  /** 兼容旧入口：组件 type 或 *。 */
  type?: unknown
  /** 兼容旧入口：组件 type、分类或 *。 */
  componentType?: unknown
}

/**
 * catalog.guide 动作的参数结构。
 *
 * 精确匹配组件 type，返回单组件完整配置指南（含必填/可选分组、最小示例、fail-fast 自检）。
 */
interface CatalogGuideParams {
  /** 必填：精确匹配的组件 type，如 "r-table"。 */
  type?: unknown
  /** 兼容旧入口：精确匹配的组件 type，如 "r-table"。 */
  componentType?: unknown
}

interface InteractionAskOption {
  id: string
  label: string
  value?: unknown
  description?: string
}

interface InteractionAskQuestion {
  id: string
  prompt: string
  type: 'single' | 'multi'
  options: InteractionAskOption[]
  recommendedOptionIds: string[]
}

interface InteractionAskParams {
  title: string
  reason?: string
  questions: InteractionAskQuestion[]
}

// =========================================================
// 三、基础工具函数与通用判定
// =========================================================

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

function normalizeCatalogCategoryName(category: string): string | null {
  const normalized = category.trim()
  if (normalized.length === 0) return null
  if (normalized === '*') return '*'
  if (normalized === 'layout' || normalized === 'layouts') return 'container'
  return normalized
}

function normalizeCatalogQueryCategories(categoryParam: unknown): string[] | null {
  if (categoryParam === undefined) return []
  if (typeof categoryParam === 'string') {
    const category = normalizeCatalogCategoryName(categoryParam)
    if (category === '*') return []
    return category === null ? null : [category]
  }
  if (Array.isArray(categoryParam)) {
    const categories: string[] = []
    for (const item of categoryParam) {
      const normalized = normalizeCatalogQueryCategories(item)
      if (normalized === null) return null
      categories.push(...normalized)
    }
    return categories
  }
  if (typeof categoryParam === 'object' && categoryParam !== null && 'category' in categoryParam) {
    return normalizeCatalogQueryCategories((categoryParam as Record<string, unknown>)['category'])
  }
  return null
}

function normalizeCatalogText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeCatalogGuideType(params: unknown): string | null {
  const direct = normalizeCatalogText(params)
  if (direct !== null) return direct
  if (!isRecord(params)) return null
  return normalizeCatalogText(params['type']) ?? normalizeCatalogText(params['componentType'])
}

function normalizeCatalogQueryRequest(params: unknown): { categoryParam: unknown; componentType: string | null } | null {
  if (params === undefined || params === null) {
    return { categoryParam: undefined, componentType: null }
  }
  if (typeof params === 'string') {
    return { categoryParam: undefined, componentType: normalizeCatalogText(params) }
  }
  if (Array.isArray(params)) {
    return { categoryParam: params, componentType: null }
  }
  if (!isRecord(params)) return null

  const componentType = normalizeCatalogText(params['componentType']) ?? normalizeCatalogText(params['type'])
  if (componentType !== null) {
    return { categoryParam: undefined, componentType }
  }
  return { categoryParam: params['category'], componentType: null }
}

function buildCatalogGuideResult(type: string): StillResult {
  const guide = projectComponentConfigGuide(STATIC_COMPONENT_CATALOG, type)
  if (guide === null) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      msg: `组件 "${type}" 不在目录中`,
      fix: '请先用 queryComponentCatalog({ componentType: "*" }) 或 catalog.query 查看可用组件列表，确认 type 后再调用 queryComponentGuide({ type }) 或 catalog.guide',
    }
  }
  return {
    ok: true,
    data: guide,
    summary: `${type} 配置指南：${guide.requiredProps.length} 必填属性，${guide.optionalProps.length} 可选属性`,
  }
}

/** 判断某个域是否已经挂载了有效数据。 */
function hasDomainData(domainState: SessionDomainState<string>): boolean {
  return 'data' in domainState && domainState.data !== null
}

// =========================================================
// 四、动作目录构建
// =========================================================

/** 从全局 still 注册表构建目录摘要列表。 */
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

/** 把执行蓝图压缩为摘要视图。 */
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

/** 汇总会话中所有域的运行状态及角色提示。 */
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateInteractionAskParams(params: InteractionAskParams): string | null {
  if (!isRecord(params)) return 'interaction.ask 参数必须是对象'
  if (!isNonEmptyString(params.title)) return missingParam('title')
  if (!Array.isArray(params.questions) || params.questions.length === 0) return 'questions 必须是非空数组'

  for (const [questionIndex, question] of params.questions.entries()) {
    const prefix = `questions[${questionIndex}]`
    if (!isRecord(question)) return `${prefix} 必须是对象`
    const rawQuestion: Record<string, unknown> = question
    const questionType = rawQuestion['type']
    const rawOptions = rawQuestion['options']
    const rawRecommendedOptionIds = rawQuestion['recommendedOptionIds']
    if (!isNonEmptyString(rawQuestion['id'])) return `${prefix}.id 必须是非空字符串`
    if (!isNonEmptyString(rawQuestion['prompt'])) return `${prefix}.prompt 必须是非空字符串`
    if (questionType !== 'single' && questionType !== 'multi') return `${prefix}.type 必须是 single 或 multi`
    if (!Array.isArray(rawOptions) || rawOptions.length < 2) return `${prefix}.options 至少提供 2 个备选项`
    if (!Array.isArray(rawRecommendedOptionIds) || rawRecommendedOptionIds.length === 0) return `${prefix}.recommendedOptionIds 必须提供推荐选项`
    if (questionType === 'single' && rawRecommendedOptionIds.length !== 1) return `${prefix}.recommendedOptionIds 单选题必须且只能推荐 1 个选项`

    const optionIds = new Set<string>()
    for (const [optionIndex, option] of rawOptions.entries()) {
      const optionPrefix = `${prefix}.options[${optionIndex}]`
      if (!isRecord(option)) return `${optionPrefix} 必须是对象`
      const optionId = option['id']
      if (!isNonEmptyString(optionId)) return `${optionPrefix}.id 必须是非空字符串`
      if (!isNonEmptyString(option['label'])) return `${optionPrefix}.label 必须是非空字符串`
      if (optionIds.has(optionId)) return `${prefix}.options 存在重复 id: ${optionId}`
      optionIds.add(optionId)
    }

    for (const recommendedId of rawRecommendedOptionIds) {
      if (!isNonEmptyString(recommendedId)) return `${prefix}.recommendedOptionIds 只能包含非空字符串`
      if (!optionIds.has(recommendedId)) return `${prefix}.recommendedOptionIds 包含不存在的选项: ${recommendedId}`
    }
  }

  return null
}

// =========================================================
// 八、interaction.ask — LLM 反问请求
// =========================================================

export const interactionAsk: StillDefinition<InteractionAskParams, InteractionAskParams> = {
  action: INTERACTION_ASK_ACTION,
  type: 'describe',
  description: '向用户发起结构化反问；必须提供完整备选项与推荐选项，前端会渲染为可点击回答',
  guard: noGuard,
  usageRules: [
    '仅当关键业务事实无法从当前上下文或只读动作判定时调用。',
    '每个问题必须提供完整备选项；如存在开放场景，应提供“其他/自定义”选项。',
    '每个问题必须提供 recommendedOptionIds；推荐项只能来自 options[].id。',
    '调用后停止继续写入或尝试，等待用户点击选项回答。',
  ],
  paramsSchema: {
    kind: 'object',
    properties: {
      title: 'string — 反问主题，简短说明本次需要确认什么',
      questions: {
        kind: 'array',
        note: '问题列表；为保证点击即回答，优先一次只问 1 个关键问题',
        items: {
          kind: 'object',
          properties: {
            id: 'string — 问题稳定 id，如 scope、layout、fields',
            prompt: 'string — 面向用户的问题文本',
            type: { kind: 'enum', enum: ['single', 'multi'], note: 'single=单选；multi=多选' },
            options: {
              kind: 'array',
              note: '完整备选项，至少 2 项；需要开放输入时提供 other/custom 选项',
              items: {
                kind: 'object',
                properties: {
                  id: 'string — 选项稳定 id',
                  label: 'string — 展示给用户的选项名称',
                },
                optional: {
                  value: 'string — 选项值；未提供时使用 id',
                  description: 'string? — 选项说明或适用场景',
                },
              },
            },
            recommendedOptionIds: {
              kind: 'array',
              note: '推荐选项 id；single 必须 1 个，multi 可多个',
              items: 'string — options[].id 中的值',
            },
          },
        },
      },
    },
    optional: {
      reason: 'string? — 为什么需要用户确认；写清缺失事实，不要泛泛描述',
    },
  },
  resultSchema: {
    title: 'string',
    reason: 'string?',
    questions: 'Array<{ id; prompt; type; options; recommendedOptionIds }>',
  },
  example: {
    title: '确认订单管理页面范围',
    reason: '当前需求未说明订单状态和售后是否纳入本页，继续生成会影响表结构与页面布局。',
    questions: [
      {
        id: 'order-scope',
        prompt: '订单管理页面本次应覆盖哪个业务范围？',
        type: 'single',
        options: [
          { id: 'basic', label: '基础订单列表', value: 'basic', description: '只包含订单查询、状态展示和详情查看' },
          { id: 'workflow', label: '订单处理流程', value: 'workflow', description: '包含接单、发货、完成等流程动作' },
          { id: 'after-sales', label: '订单与售后联动', value: 'after-sales', description: '包含退款、退货、售后状态' },
          { id: 'analytics', label: '订单看板与统计', value: 'analytics', description: '突出汇总指标和趋势分析' },
          { id: 'custom', label: '其他/自定义', value: 'custom', description: '由用户补充具体范围' },
        ],
        recommendedOptionIds: ['workflow'],
      },
    ],
  },
  validate: validateInteractionAskParams,
  execute: (_session, params): StillResult<InteractionAskParams> => ({
    ok: true,
    data: params,
    summary: `等待用户回答反问：${params.title}（${params.questions.length} 题）`,
  }),
}

// =========================================================
// 九、stills.capabilities — 动作目录枚举
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
// 十、stills.actionSpec — 动作规格精查
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
// 十一、session.describe — 会话全局状态汇总
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
  description: '组件目录：无参数或 * 返回全量列表；指定 category 返回分类列表；兼容 type/componentType 查询单组件指南。',
  guard: noGuard,
  paramsSchema: {
    kind: 'object',
    optional: {
      category: 'container | field | group | meta | layout | layouts | * — 分类或全量目录',
      type: 'string? — 兼容旧调用：组件 type，如 r-table；传 * 返回全量目录',
      componentType: 'string? — 兼容 queryComponentCatalog：组件 type、分类或 *',
    },
  },
  example: { category: 'field' },
  validate: () => null,
  execute: (session: IStillSession, params: CatalogQueryParams): StillResult => {
    const normalizedRequest = normalizeCatalogQueryRequest(params)

    if (normalizedRequest === null) {
      return {
        ok: false,
        code: 'INVALID_PARAMS',
        msg: 'catalog.query 参数必须是对象、字符串、字符串数组或空值',
        fix: '传 {} 或 { category:"container" }；旧调用可传 { componentType:"*" } 或 { componentType:"r-table" }',
      }
    }

    const categoryParam = normalizedRequest.categoryParam
    const queryCategories = normalizeCatalogQueryCategories(categoryParam)

    if (queryCategories === null || (Array.isArray(categoryParam) && queryCategories.length === 0)) {
      return {
        ok: false,
        code: 'INVALID_PARAMS',
        msg: 'category 必须是非空字符串，或非空字符串数组',
        fix: '仅支持 container | field | group | meta；多分类可传 category:["container","field"]',
      }
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

    if (normalizedRequest.componentType !== null) {
      const componentType = normalizedRequest.componentType
      const normalizedCategory = normalizeCatalogCategoryName(componentType)
      if (normalizedCategory === '*') {
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
      }
      if (normalizedCategory !== null) {
        const registryKey = resolveCatalogRegistryKey(normalizedCategory)
        if (registryKey !== null) {
          const types = catalog.registry[registryKey]
          const list = types.map((t) => ({
            type: t,
            description: catalog.components[t]?.description ?? '',
          }))
          return {
            ok: true,
            data: { category: normalizedCategory, count: list.length, components: list },
            summary: `${normalizedCategory}: ${list.length} 组件`,
          }
        }
      }
      if (catalog.components[componentType] !== undefined) {
        return buildCatalogGuideResult(componentType)
      }
      return {
        ok: false,
        code: 'INVALID_CATEGORY',
        msg: `非法 category/type: ${componentType}`,
        fix: '传 * 查全量；传 container | field | group | meta 查分类；传真实组件 type（如 r-table）查配置指南。',
      }
    }

    // 模式 1：按 category 过滤，返回该分类的组件类型列表（轻量）。
    if (queryCategories.length > 0) {
      const normalizedCategories = [...new Set(queryCategories)]
      const groups: Array<{ category: string; count: number; components: Array<{ type: string; description: string }> }> = []

      for (const category of normalizedCategories) {
        const registryKey = resolveCatalogRegistryKey(category)
        if (registryKey === null) {
          return {
            ok: false,
            code: 'INVALID_CATEGORY',
            msg: `非法 category: ${category}`,
            fix: '仅支持 container | field | group | meta',
          }
        }

        const types = catalog.registry[registryKey]
        const list = types.map((t) => ({
          type: t,
          description: catalog.components[t]?.description ?? '',
        }))
        groups.push({ category, count: list.length, components: list })
      }

      const only = groups[0]
      if (groups.length === 1 && only !== undefined) {
        return {
          ok: true,
          data: { category: only.category, count: only.count, components: only.components },
          summary: `${only.category}: ${only.count} 组件`,
        }
      }

      const mergedCount = groups.reduce((sum, item) => sum + item.count, 0)
      return {
        ok: true,
        data: {
          categories: groups.map((item) => item.category),
          count: mergedCount,
          groups,
        },
        summary: `categories(${groups.map((item) => item.category).join(',')}): ${mergedCount} 组件`,
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
  description: '单组件配置指南：返回指定 type/componentType 的 props 分组、最小示例与 fail-fast 自检清单。',
  guard: noGuard,
  paramsSchema: {
    kind: 'object',
    properties: {
      type: 'string — 组件类型，如 "r-table"',
    },
    optional: {
      componentType: 'string? — 兼容旧调用的组件类型字段，如 "r-table"',
    },
  },
  example: { type: 'r-table' },
  validate: (params) => {
    if (normalizeCatalogGuideType(params) === null) return missingParam('type')
    return null
  },
  execute: (_session: IStillSession, params: CatalogGuideParams): StillResult => {
    const type = normalizeCatalogGuideType(params)
    return type === null
      ? { ok: false, code: 'INVALID_PARAMS', msg: missingParam('type'), fix: '请传 { type:"r-table" } 或 { componentType:"r-table" }' }
      : buildCatalogGuideResult(type)
  },
}

export const queryComponentCatalog: StillDefinition<CatalogQueryParams, unknown> = {
  action: QUERY_COMPONENT_CATALOG_ACTION,
  type: 'describe',
  description: '兼容 FC 入口：查询组件目录或单组件配置。componentType="*" 返回全量，componentType=分类返回分类，componentType=组件 type 返回配置指南。',
  guard: noGuard,
  paramsSchema: {
    kind: 'object',
    optional: {
      componentType: 'string? — * | container | field | group | meta | 组件 type（如 r-table）',
      category: 'string? — container | field | group | meta | layout | layouts | *',
      type: 'string? — 组件 type 或分类，兼容旧调用',
    },
  },
  example: { componentType: '*' },
  validate: () => null,
  execute: (session, params) => catalogQuery.execute(session, params),
}

export const queryComponentGuide: StillDefinition<CatalogGuideParams, unknown> = {
  action: QUERY_COMPONENT_GUIDE_ACTION,
  type: 'describe',
  description: '兼容 FC 入口：查询单组件配置指南，等价于 catalog.guide。支持 type 或 componentType。',
  guard: noGuard,
  paramsSchema: {
    kind: 'object',
    properties: {
      type: 'string — 组件类型，如 "r-table"',
    },
    optional: {
      componentType: 'string? — 兼容旧调用的组件类型字段，如 "r-table"',
    },
  },
  example: { type: 'r-table' },
  validate: catalogGuide.validate,
  execute: (_session, params) => {
    const type = normalizeCatalogGuideType(params)
    return type === null
      ? { ok: false, code: 'INVALID_PARAMS', msg: missingParam('type'), fix: '请传 { type:"r-table" } 或 { componentType:"r-table" }' }
      : buildCatalogGuideResult(type)
  },
}
