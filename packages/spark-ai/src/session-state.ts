// ── 设计会话持久化状态（design-session.json）──────────────────────────────
//
// 文件位置：与 rule.json / pagedata.json / script.js / style.css 同级
// 持久化层：由后端 PageConfig API 读写（PUT/GET /{pageId}/design-session.json）
// 生命周期：伴随页面配置存在，跨会话保留

import type { ProposalType } from './design-session'

// ── 双 Pass 阶段定义 ─────────────────────────────────────────────────────────

/** Pass A 步骤（数据建模通道） */
export type PassAStep = 'A1' | 'A2' | 'A3' | 'A4'
/** Pass B 步骤（UI 设计通道） */
export type PassBStep = 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6'
/** 所有步骤 */
export type DesignStep = PassAStep | PassBStep

/**
 * 步骤元信息（用于提示词与 UI 展示）
 */
export interface StepMeta {
  id: DesignStep
  pass: 'A' | 'B'
  label: string
  /** 该步骤通常产出的提案类型 */
  produces: ProposalType[]
}

/** 步骤注册表 */
export const STEP_REGISTRY: StepMeta[] = [
  // Pass A: 需求 → 技能扫描 → 数据建模 → 名册锁定
  { id: 'A1', pass: 'A', label: '需求摸底',   produces: [] },
  { id: 'A2', pass: 'A', label: '技能扫描',   produces: [] },
  { id: 'A3', pass: 'A', label: '数据建模',   produces: ['data-model'] },
  { id: 'A4', pass: 'A', label: '名册A锁定',  produces: ['data-model'] },
  // Pass B: 视图规划 → UI 设计 → 交互 → API → 样式 → 全量校验
  { id: 'B1', pass: 'B', label: '视图规划',   produces: ['view-plan'] },
  { id: 'B2', pass: 'B', label: 'UI 设计',    produces: ['ui-structure'] },
  { id: 'B3', pass: 'B', label: '交互设计',   produces: ['interaction'] },
  { id: 'B4', pass: 'B', label: 'API 配置',   produces: ['api-config'] },
  { id: 'B5', pass: 'B', label: '样式打磨',   produces: ['style'] },
  { id: 'B6', pass: 'B', label: '全量校验',   produces: [] },
]

// ── 名册（Registry）─────────────────────────────────────────────────────────

/** 列定义（名册A — DataRegistry 内） */
export interface RegistryColumn {
  name: string
  type: string
  computeExpression?: string
  isPrimaryKey?: boolean
}

/** 关系定义（名册A — DataRegistry 内） */
export interface RegistryRelation {
  childTable: string
  parentField: string
  childField: string
}

/** 表定义（名册A — DataRegistry 内） */
export interface RegistryTable {
  columns: RegistryColumn[]
  relations: RegistryRelation[]
  /** 视图级聚合配置（仅字段名 → 聚合类型） */
  aggregates?: Record<string, { type: string; field?: string }>
}

/**
 * 名册A — 数据注册表（Pass A 产出）
 *
 * 记录所有 data-model 提案确认后的表/列/关系。
 * Pass A 完成后 lockedAt 非空，表示名册已锁定。
 * 软锁定策略：Pass B 阶段可修改名册A，但需级联校验所有 Pass B 提案。
 */
export interface DataRegistry {
  tables: Record<string, RegistryTable>
  lockedAt: string | null
}

/** 视图条目（名册B — ViewRegistry 内） */
export interface RegistryView {
  tableName: string
  viewId: string
  purpose: string
  origin: 'auto-default' | 'planned'
}

/**
 * 名册B-1 — 视图注册表（Pass B1 产出）
 *
 * 记录所有 view-plan 提案确认后的视图定义。
 */
export interface ViewRegistry {
  views: Record<string, RegistryView>
}

/**
 * 名册B-2 — UI 注册表（Pass B2+ 产出，持续追加）
 *
 * 跟踪 UI 设计中声明引用的组件 ID、脚本函数名和 CSS 类名，
 * 用于全量校验（B6）时检测死引用和遗漏。
 */
export interface UIRegistry {
  /** rule.json 中声明的组件 id */
  componentIds: string[]
  /** script.js 中定义 / meta.behavior.on 中引用的函数名 */
  functionNames: string[]
  /** style.css 中定义的 class 名 */
  cssClassesDefined: string[]
  /** rule.json 中引用的 class 名 */
  cssClassesReferenced: string[]
}

// ── 已采纳提案快照 ──────────────────────────────────────────────────────────

/** 已采纳提案摘要（持久化用，轻量化存储） */
export interface AcceptedProposalSnapshot {
  id: string
  type: ProposalType
  title: string
  content: string
  step: DesignStep
  acceptedAt: string
}

// ── 持久化根结构 ──────────────────────────────────────────────────────────────

/**
 * 持久化设计会话状态
 *
 * 存储为 `design-session.json`，与 rule.json / pagedata.json 同级。
 * 跨会话保留，AI 可基于历史决策继续迭代。
 */
export interface PersistedDesignSession {
  /** 格式版本号（用于后续迁移） */
  version: 1
  /** 当前所在通道 */
  currentPass: 'A' | 'B'
  /** 当前步骤 */
  currentStep: DesignStep
  /** 名册A — 数据注册表 */
  dataRegistry: DataRegistry
  /** 名册B-1 — 视图注册表 */
  viewRegistry: ViewRegistry
  /** 名册B-2 — UI 注册表 */
  uiRegistry: UIRegistry
  /** 已采纳的提案快照列表 */
  acceptedProposals: AcceptedProposalSnapshot[]
  /**
   * 依赖图（字段级 → 引用该字段的提案 ID 列表）
   *
   * 用于级联校验：修改名册A中的字段时，检查哪些 Pass B 提案受影响。
   * key 格式：`TableName.columnName` 或 `TableName@viewId`
   */
  dependencyGraph: Record<string, string[]>
}

// ── 工厂函数 ──────────────────────────────────────────────────────────────────

/** 创建空白设计会话 */
export function createEmptySession(): PersistedDesignSession {
  return {
    version: 1,
    currentPass: 'A',
    currentStep: 'A1',
    dataRegistry: { tables: {}, lockedAt: null },
    viewRegistry: { views: {} },
    uiRegistry: {
      componentIds: [],
      functionNames: [],
      cssClassesDefined: [],
      cssClassesReferenced: [],
    },
    acceptedProposals: [],
    dependencyGraph: {},
  }
}

// ── 名册操作辅助 ──────────────────────────────────────────────────────────────

/** 检查名册A是否已锁定 */
export function isDataRegistryLocked(session: PersistedDesignSession): boolean {
  return session.dataRegistry.lockedAt !== null
}

/** 获取名册A中所有表名 */
export function getRegisteredTableNames(session: PersistedDesignSession): string[] {
  return Object.keys(session.dataRegistry.tables)
}

/** 获取名册A中指定表的所有列名 */
export function getRegisteredColumnNames(
  session: PersistedDesignSession,
  tableName: string,
): string[] {
  const table = session.dataRegistry.tables[tableName]
  if (!table) return []
  return table.columns.map((c) => c.name)
}

/** 获取名册B中所有视图 key */
export function getRegisteredViewKeys(session: PersistedDesignSession): string[] {
  return Object.keys(session.viewRegistry.views)
}

/**
 * 查询依赖图：给定一个字段 key，返回所有引用它的提案 ID
 *
 * @param session 当前会话
 * @param fieldKey 字段 key（如 `Orders.amount` 或 `Orders@grid`）
 */
export function getDependentProposals(
  session: PersistedDesignSession,
  fieldKey: string,
): string[] {
  return session.dependencyGraph[fieldKey] ?? []
}

// ── 步骤推进 ──────────────────────────────────────────────────────────────────

/** 步骤顺序（用于推进判断） */
const STEP_ORDER: DesignStep[] = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6']

/**
 * 推进到下一个步骤
 *
 * @returns 新步骤 ID；如果已在最后步骤则返回 null
 */
export function advanceStep(session: PersistedDesignSession): DesignStep | null {
  const idx = STEP_ORDER.indexOf(session.currentStep)
  if (idx < 0 || idx >= STEP_ORDER.length - 1) return null
  const next = STEP_ORDER[idx + 1]
  if (!next) return null
  session.currentStep = next
  session.currentPass = next.startsWith('A') ? 'A' : 'B'
  return next
}

/**
 * 检查是否允许推进到指定步骤
 *
 * 规则：
 * - 不允许倒退（除非目标在同一 pass 内的已完成步骤）
 * - 进入 Pass B 前名册A 必须锁定（A4 完成即锁定）
 */
export function canAdvanceTo(session: PersistedDesignSession, target: DesignStep): boolean {
  const currentIdx = STEP_ORDER.indexOf(session.currentStep)
  const targetIdx = STEP_ORDER.indexOf(target)
  if (targetIdx < 0 || currentIdx < 0) return false
  // 不允许倒退
  if (targetIdx <= currentIdx) return false
  // 进入 Pass B 需要名册A 锁定
  if (target.startsWith('B') && !isDataRegistryLocked(session)) return false
  return true
}

// ── 名册A 写入操作 ──────────────────────────────────────────────────────────

/**
 * 注册一张表到名册A
 *
 * 如果表已存在则合并（列追加/覆盖同名列，关系追加）
 */
export function registerTable(
  session: PersistedDesignSession,
  tableName: string,
  table: RegistryTable,
): void {
  const existing = session.dataRegistry.tables[tableName]
  if (!existing) {
    session.dataRegistry.tables[tableName] = table
    return
  }
  // 合并列（同名覆盖，新列追加）
  const colMap = new Map(existing.columns.map((c) => [c.name, c]))
  for (const col of table.columns) {
    colMap.set(col.name, col)
  }
  existing.columns = [...colMap.values()]
  // 追加关系（去重：相同 childTable+parentField+childField 视为重复）
  const relKeys = new Set(
    existing.relations.map((r) => `${r.childTable}:${r.parentField}:${r.childField}`),
  )
  for (const rel of table.relations) {
    const key = `${rel.childTable}:${rel.parentField}:${rel.childField}`
    if (!relKeys.has(key)) {
      existing.relations.push(rel)
      relKeys.add(key)
    }
  }
  // 合并聚合
  if (table.aggregates) {
    existing.aggregates = { ...existing.aggregates, ...table.aggregates }
  }
}

/**
 * 锁定名册A（A4 步骤完成时调用）
 *
 * @returns 是否成功锁定（已锁定时返回 false）
 */
export function lockDataRegistry(session: PersistedDesignSession): boolean {
  if (session.dataRegistry.lockedAt !== null) return false
  session.dataRegistry.lockedAt = new Date().toISOString()
  return true
}

// ── 名册B 写入操作 ──────────────────────────────────────────────────────────

/** 注册一个视图到名册B-1 */
export function registerView(
  session: PersistedDesignSession,
  viewKey: string,
  view: RegistryView,
): void {
  session.viewRegistry.views[viewKey] = view
}

/** 追加 UI 注册信息到名册B-2（去重） */
export function appendUIRegistry(
  session: PersistedDesignSession,
  patch: Partial<UIRegistry>,
): void {
  const ui = session.uiRegistry
  if (patch.componentIds) {
    for (const id of patch.componentIds) {
      if (!ui.componentIds.includes(id)) ui.componentIds.push(id)
    }
  }
  if (patch.functionNames) {
    for (const fn of patch.functionNames) {
      if (!ui.functionNames.includes(fn)) ui.functionNames.push(fn)
    }
  }
  if (patch.cssClassesDefined) {
    for (const cls of patch.cssClassesDefined) {
      if (!ui.cssClassesDefined.includes(cls)) ui.cssClassesDefined.push(cls)
    }
  }
  if (patch.cssClassesReferenced) {
    for (const cls of patch.cssClassesReferenced) {
      if (!ui.cssClassesReferenced.includes(cls)) ui.cssClassesReferenced.push(cls)
    }
  }
}

// ── 提案记录 ──────────────────────────────────────────────────────────────────

/** 记录一个已采纳的提案快照 */
export function recordAcceptedProposal(
  session: PersistedDesignSession,
  proposal: AcceptedProposalSnapshot,
): void {
  // 同 ID 去重（覆盖旧版本）
  const idx = session.acceptedProposals.findIndex((p) => p.id === proposal.id)
  if (idx >= 0) {
    session.acceptedProposals[idx] = proposal
  } else {
    session.acceptedProposals.push(proposal)
  }
}

// ── 依赖图操作 ────────────────────────────────────────────────────────────────

/** 在依赖图中注册：fieldKey → proposalId */
export function addDependency(
  session: PersistedDesignSession,
  fieldKey: string,
  proposalId: string,
): void {
  const list = session.dependencyGraph[fieldKey] ?? []
  if (!list.includes(proposalId)) {
    list.push(proposalId)
  }
  session.dependencyGraph[fieldKey] = list
}

/** 从依赖图中移除某个提案的所有引用 */
export function removeDependency(
  session: PersistedDesignSession,
  proposalId: string,
): void {
  for (const key of Object.keys(session.dependencyGraph)) {
    const deps = session.dependencyGraph[key]
    if (!deps) continue
    const filtered = deps.filter((id) => id !== proposalId)
    session.dependencyGraph[key] = filtered
    if (filtered.length === 0) {
      // 使用解构移除空键（遵守 no-dynamic-delete 规则）
      const { [key]: _, ...rest } = session.dependencyGraph
      session.dependencyGraph = rest as Record<string, string[]>
    }
  }
}

// ── 级联校验（软锁定核心） ──────────────────────────────────────────────────

/** 级联影响描述 */
export interface CascadeImpact {
  proposalId: string
  proposalTitle: string
  proposalType: ProposalType
  affectedFields: string[]
}

/**
 * 级联校验：检查名册A变更对 Pass B 提案的影响
 *
 * 调用场景：名册A锁定后（Pass B 阶段），用户修改了 data-model。
 * 检查所有已采纳的 Pass B 提案是否引用了被变更的字段。
 *
 * @param session 当前会话
 * @param changedTableName 被修改的表名
 * @param removedColumns 被删除的列名（新增列不产生影响）
 * @returns 受影响的提案列表
 */
export function checkCascadeImpact(
  session: PersistedDesignSession,
  changedTableName: string,
  removedColumns: string[],
): CascadeImpact[] {
  const impacts: CascadeImpact[] = []

  // 收集所有受影响的依赖 key
  const affectedKeys: string[] = []
  for (const col of removedColumns) {
    affectedKeys.push(`${changedTableName}.${col}`)
  }
  // 表级 key（表结构变更影响所有引用该表的视图）
  affectedKeys.push(`${changedTableName}@*`)

  // 查找受影响的提案
  const affectedProposalIds = new Set<string>()
  const proposalFieldMap = new Map<string, string[]>()

  for (const key of affectedKeys) {
    // 精确匹配
    const directDeps = session.dependencyGraph[key] ?? []
    for (const pid of directDeps) {
      affectedProposalIds.add(pid)
      const fields = proposalFieldMap.get(pid) ?? []
      fields.push(key)
      proposalFieldMap.set(pid, fields)
    }
  }

  // 同时扫描依赖图中以 `changedTableName.` 或 `changedTableName@` 开头的 key
  for (const [graphKey, pids] of Object.entries(session.dependencyGraph)) {
    if (graphKey.startsWith(`${changedTableName}.`) || graphKey.startsWith(`${changedTableName}@`)) {
      for (const pid of pids) {
        affectedProposalIds.add(pid)
        const fields = proposalFieldMap.get(pid) ?? []
        if (!fields.includes(graphKey)) fields.push(graphKey)
        proposalFieldMap.set(pid, fields)
      }
    }
  }

  // 构建影响列表
  for (const pid of affectedProposalIds) {
    const proposal = session.acceptedProposals.find((p) => p.id === pid)
    if (!proposal) continue
    // 仅报告 Pass B 提案
    const step = STEP_REGISTRY.find((s) => s.id === proposal.step)
    if (step?.pass !== 'B') continue
    impacts.push({
      proposalId: pid,
      proposalTitle: proposal.title,
      proposalType: proposal.type,
      affectedFields: proposalFieldMap.get(pid) ?? [],
    })
  }

  return impacts
}

/**
 * 生成级联通知文本（供 AI 消息使用）
 */
export function formatCascadeNotification(
  changedTableName: string,
  changeDescription: string,
  impacts: CascadeImpact[],
): string {
  if (impacts.length === 0) {
    return `✅ 名册A 变更（${changeDescription}），无 Pass B 提案受影响。`
  }
  const lines = [
    `⚠️ 名册A 变更（表 ${changedTableName} ${changeDescription}），以下 Pass B 提案可能受影响：`,
  ]
  for (const impact of impacts) {
    lines.push(`- ${impact.proposalType}「${impact.proposalTitle}」— 涉及字段：${impact.affectedFields.join(', ')}`)
  }
  lines.push('请确认是否需要更新上述提案。')
  return lines.join('\n')
}

// ── 提案 → 会话自动写入（核心闭环）─────────────────────────────────────────

/** applyProposalToSession 的结果 */
export interface ApplyResult {
  /** 入册的表名列表（data-model 时使用） */
  registeredTables: string[]
  /** 入册的视图 key 列表（view-plan 时使用） */
  registeredViews: string[]
  /** 添加的依赖 key → proposalId 映射数 */
  dependenciesAdded: number
  /** 级联影响（仅名册A锁定后修改 data-model 时触发） */
  cascadeImpacts: CascadeImpact[]
}

/**
 * 当提案被采纳时，自动解析内容并写入会话名册 + 依赖图
 *
 * 支持的提案类型：
 * - `data-model` → registerTable + 依赖图（列级）
 * - `view-plan` → registerView + 依赖图（视图级）
 * - `ui-structure` → appendUIRegistry(componentIds, cssClassesReferenced) + 依赖图（字段级）
 * - `interaction` → appendUIRegistry(functionNames)
 * - `style` → appendUIRegistry(cssClassesDefined)
 *
 * @returns ApplyResult 描述写入了什么，以及是否触发级联影响
 */
export function applyProposalToSession(
  session: PersistedDesignSession,
  proposal: AcceptedProposalSnapshot,
): ApplyResult {
  const result: ApplyResult = {
    registeredTables: [],
    registeredViews: [],
    dependenciesAdded: 0,
    cascadeImpacts: [],
  }

  // 先记录提案本身
  recordAcceptedProposal(session, proposal)

  switch (proposal.type) {
    case 'data-model':
      applyDataModel(session, proposal, result)
      break
    case 'view-plan':
      applyViewPlan(session, proposal, result)
      break
    case 'ui-structure':
      applyUiStructure(session, proposal, result)
      break
    case 'interaction':
      applyInteraction(session, proposal, result)
      break
    case 'style':
      applyStyle(session, proposal, result)
      break
    case 'api-config':
    case 'db-schema':
    case 'dict-entry':
    case 'function-plan':
    case 'navigation':
      // 这些提案类型当前仅记录，不需要名册写入
      break
  }

  return result
}

/** 解析 data-model JSON 并注册表 */
function applyDataModel(
  session: PersistedDesignSession,
  proposal: AcceptedProposalSnapshot,
  result: ApplyResult,
): void {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(proposal.content) as Record<string, unknown>
  } catch {
    return
  }

  // 记录锁定前的旧列名（用于级联校验）
  const wasLocked = isDataRegistryLocked(session)
  const oldColumnsByTable = new Map<string, Set<string>>()

  // 收集需要处理的表定义
  const tableEntries: Array<[string, unknown]> = []

  // 格式1: { tables: { Orders: {...}, Items: {...} } }
  const tables = parsed['tables'] as Record<string, unknown> | undefined
  if (tables && typeof tables === 'object') {
    for (const [name, def] of Object.entries(tables)) {
      tableEntries.push([name, def])
    }
  }
  // 格式2: { tableName: 'Orders', columns: [...] }
  if (typeof parsed['tableName'] === 'string') {
    tableEntries.push([parsed['tableName'], parsed])
  }

  for (const [tableName, def] of tableEntries) {
    // 如果锁定状态，记录旧列名用于级联
    if (wasLocked) {
      const oldCols = new Set(getRegisteredColumnNames(session, tableName))
      oldColumnsByTable.set(tableName, oldCols)
    }

    const tableDef = parseTableDef(def)
    if (tableDef) {
      if (wasLocked) {
        // 锁定后替换整个表定义（不合并），确保删除列能被级联检测发现
        session.dataRegistry.tables[tableName] = tableDef
      } else {
        registerTable(session, tableName, tableDef)
      }
      result.registeredTables.push(tableName)

      // 建立列级依赖
      for (const col of tableDef.columns) {
        addDependency(session, `${tableName}.${col.name}`, proposal.id)
        result.dependenciesAdded++
      }
    }
  }

  // 名册A 锁定后修改 → 级联校验
  if (wasLocked) {
    for (const [tableName, oldCols] of oldColumnsByTable) {
      const newCols = new Set(getRegisteredColumnNames(session, tableName))
      const removedCols = [...oldCols].filter((c) => !newCols.has(c))
      if (removedCols.length > 0) {
        const impacts = checkCascadeImpact(session, tableName, removedCols)
        result.cascadeImpacts.push(...impacts)
      }
    }
  }
}

/** 从 JSON 解析 RegistryTable 定义 */
function parseTableDef(raw: unknown): RegistryTable | null {
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>

  const columns: RegistryColumn[] = []
  const rawCols = obj['columns']
  if (Array.isArray(rawCols)) {
    for (const c of rawCols) {
      if (typeof c === 'object' && c !== null) {
        const col = c as Record<string, unknown>
        if (typeof col['name'] === 'string') {
          columns.push({
            name: col['name'],
            type: typeof col['type'] === 'string' ? col['type'] : 'string',
            ...(typeof col['computeExpression'] === 'string' ? { computeExpression: col['computeExpression'] } : {}),
            ...(col['isPrimaryKey'] === true ? { isPrimaryKey: true } : {}),
          })
        }
      }
    }
  }

  const relations: RegistryRelation[] = []
  const rawRels = obj['relations']
  if (Array.isArray(rawRels)) {
    for (const r of rawRels) {
      if (typeof r === 'object' && r !== null) {
        const rel = r as Record<string, unknown>
        if (typeof rel['childTable'] === 'string' &&
            typeof rel['parentField'] === 'string' &&
            typeof rel['childField'] === 'string') {
          relations.push({
            childTable: rel['childTable'],
            parentField: rel['parentField'],
            childField: rel['childField'],
          })
        }
      }
    }
  }

  const aggregates: Record<string, { type: string; field?: string }> = {}
  const rawAgg = obj['aggregates']
  if (typeof rawAgg === 'object' && rawAgg !== null) {
    for (const [key, val] of Object.entries(rawAgg as Record<string, unknown>)) {
      if (typeof val === 'object' && val !== null) {
        const aggDef = val as Record<string, unknown>
        if (typeof aggDef['type'] === 'string') {
          aggregates[key] = {
            type: aggDef['type'],
            ...(typeof aggDef['field'] === 'string' ? { field: aggDef['field'] } : {}),
          }
        }
      }
    }
  }

  // 零列表定义无意义，拒绝注册
  if (columns.length === 0) return null

  return {
    columns,
    relations,
    ...(Object.keys(aggregates).length > 0 ? { aggregates } : {}),
  }
}

/** 解析 view-plan Markdown 表格并注册视图 */
function applyViewPlan(
  session: PersistedDesignSession,
  proposal: AcceptedProposalSnapshot,
  result: ApplyResult,
): void {
  const lines = proposal.content.split('\n')
  let headerCols: string[] = []
  let headerParsed = false

  for (const line of lines) {
    if (!line.startsWith('|')) continue
    if (/^\|[\s:-]+\|/.test(line)) continue

    const cells = line.split('|').map((c) => c.trim()).filter(Boolean)
    if (cells.length < 3) continue

    if (!headerParsed) {
      headerParsed = true
      headerCols = cells
      continue
    }

    // 按列名定位字段
    const getCol = (names: string[]): string | undefined => {
      const idx = headerCols.findIndex((h) => names.includes(h))
      return idx >= 0 ? cells[idx] : undefined
    }

    const tableName = getCol(['表名', 'tableName', 'tablename', 'table', 'Table'])
    const viewId = getCol(['viewId', 'viewid', 'ViewId', 'view_id'])
    const purpose = getCol(['用途', 'purpose', 'Purpose', '说明', 'description'])
    const origin = getCol(['来源', 'origin', 'Origin', '来源类型'])
    const viewKey = getCol(['视图 key', '视图key', 'key', 'Key', 'viewKey'])

    if (!tableName || !viewId) continue

    const resolvedKey = viewKey ?? `${tableName}@${viewId}`
    const resolvedOrigin: 'auto-default' | 'planned' =
      origin === 'auto-default' ? 'auto-default' : 'planned'

    registerView(session, resolvedKey, {
      tableName,
      viewId,
      purpose: purpose ?? '',
      origin: resolvedOrigin,
    })
    result.registeredViews.push(resolvedKey)

    // 视图级依赖
    addDependency(session, `${tableName}@${viewId}`, proposal.id)
    result.dependenciesAdded++
  }
}

/** 解析 ui-structure JSON 并提取组件 ID / CSS 引用 / 字段依赖 */
function applyUiStructure(
  session: PersistedDesignSession,
  proposal: AcceptedProposalSnapshot,
  result: ApplyResult,
): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(proposal.content)
  } catch {
    return
  }

  const nodes = Array.isArray(parsed) ? parsed : [parsed]
  const componentIds: string[] = []
  const cssClassesReferenced: string[] = []

  walkUiNodes(nodes, session, proposal.id, result, componentIds, cssClassesReferenced)

  appendUIRegistry(session, { componentIds, cssClassesReferenced })
}

function walkUiNodes(
  nodes: unknown[],
  session: PersistedDesignSession,
  proposalId: string,
  result: ApplyResult,
  componentIds: string[],
  cssClasses: string[],
): void {
  for (const node of nodes) {
    if (typeof node !== 'object' || node === null) continue
    const n = node as Record<string, unknown>

    // 收集 id
    if (typeof n['id'] === 'string') {
      componentIds.push(n['id'])
    }

    // 收集 class（props.class 或顶层 class）
    const cls = (n['props'] as Record<string, unknown> | undefined)?.['class'] ?? n['class']
    if (typeof cls === 'string') {
      for (const c of cls.split(/\s+/).filter(Boolean)) {
        cssClasses.push(c)
      }
    }

    // 提取 dataKey → 建立字段级依赖
    const dk = extractNodeDataKey(n)
    if (dk) {
      const atIdx = dk.indexOf('@')
      const tableName = atIdx >= 0 ? dk.slice(0, atIdx) : dk
      if (!tableName.startsWith('#')) {
        // field 字段 → 列级依赖
        const fieldName = typeof n['field'] === 'string' ? n['field'] : null
        if (fieldName) {
          addDependency(session, `${tableName}.${fieldName}`, proposalId)
          result.dependenciesAdded++
        }
      }
    }

    // 递归
    if (Array.isArray(n['children'])) {
      walkUiNodes(n['children'] as unknown[], session, proposalId, result, componentIds, cssClasses)
    }
  }
}

function extractNodeDataKey(n: Record<string, unknown>): string | null {
  if (typeof n['dataKey'] === 'string') return n['dataKey']
  const meta = n['meta'] as Record<string, unknown> | undefined
  const data = meta?.['data'] as Record<string, unknown> | undefined
  if (typeof data?.['dataKey'] === 'string') return data['dataKey']
  return null
}

/** 解析 interaction 脚本并提取函数名 */
function applyInteraction(
  session: PersistedDesignSession,
  proposal: AcceptedProposalSnapshot,
  _result: ApplyResult,
): void {
  const funcRegex = /\bfunction\s+([a-zA-Z_$][\w$]*)\s*\(/g
  let match: RegExpExecArray | null
  const functionNames: string[] = []
  while ((match = funcRegex.exec(proposal.content)) !== null) {
    if (match[1]) functionNames.push(match[1])
  }
  if (functionNames.length > 0) {
    appendUIRegistry(session, { functionNames })
  }
}

/** 解析 style CSS 并提取定义的类名 */
function applyStyle(
  session: PersistedDesignSession,
  proposal: AcceptedProposalSnapshot,
  _result: ApplyResult,
): void {
  // 提取 CSS 类选择器定义（.class-name { ... }）
  const classRegex = /\.([a-zA-Z_][\w-]*)\s*[{,]/g
  let match: RegExpExecArray | null
  const cssClassesDefined: string[] = []
  while ((match = classRegex.exec(proposal.content)) !== null) {
    const cls = match[1]
    if (!cls) continue
    // 排除常见伪类/伪元素
    if (!cls.startsWith('el-') && !cls.startsWith('is-')) {
      cssClassesDefined.push(cls)
    }
  }
  if (cssClassesDefined.length > 0) {
    appendUIRegistry(session, { cssClassesDefined })
  }
}

// ── 会话上下文提示词（动态注入当前名册状态）───────────────────────────────────

/**
 * 构建会话上下文摘要（注入 AI 系统提示词尾部）
 *
 * 功能：让 AI 感知当前设计会话的进度和名册内容，做出上下文感知的决策。
 * 在空白会话下返回最小化提示；名册有内容时返回结构化摘要。
 */
export function buildSessionContextPrompt(session: PersistedDesignSession): string {
  const sections: string[] = []
  sections.push(`## 当前设计会话状态`)
  sections.push(`- **通道**: Pass ${session.currentPass}`)
  sections.push(`- **步骤**: ${session.currentStep}（${STEP_REGISTRY.find((s) => s.id === session.currentStep)?.label ?? ''}）`)

  // 名册A 摘要
  const tableNames = getRegisteredTableNames(session)
  if (tableNames.length > 0) {
    sections.push('')
    sections.push(`### 名册A — DataRegistry${session.dataRegistry.lockedAt !== null ? ' 🔒 已锁定' : ''}`)
    for (const tn of tableNames) {
      const t = session.dataRegistry.tables[tn]
      if (!t) continue
      const cols = t.columns.map((c) => {
        let s = `${c.name}: ${c.type}`
        if (c.isPrimaryKey === true) s += ' (PK)'
        if (c.computeExpression) s += ` = \`${c.computeExpression}\``
        return s
      })
      sections.push(`- **${tn}**: ${cols.join(', ')}`)
      if (t.relations.length > 0) {
        for (const r of t.relations) {
          sections.push(`  - → ${r.childTable} (${r.parentField} → ${r.childField})`)
        }
      }
    }
  } else {
    sections.push(`- **名册A**: 空（尚未建模）`)
  }

  // 名册B 摘要
  const viewKeys = getRegisteredViewKeys(session)
  if (viewKeys.length > 0) {
    sections.push('')
    sections.push(`### 名册B-1 — ViewRegistry`)
    for (const vk of viewKeys) {
      const v = session.viewRegistry.views[vk]
      if (!v) continue
      sections.push(`- ${vk}: ${v.purpose}（${v.origin}）`)
    }
  }

  const ui = session.uiRegistry
  const hasUI = ui.componentIds.length > 0 || ui.functionNames.length > 0 ||
                ui.cssClassesDefined.length > 0 || ui.cssClassesReferenced.length > 0
  if (hasUI) {
    sections.push('')
    sections.push(`### 名册B-2 — UIRegistry`)
    if (ui.componentIds.length > 0) sections.push(`- 组件 ID: ${ui.componentIds.join(', ')}`)
    if (ui.functionNames.length > 0) sections.push(`- 函数名: ${ui.functionNames.join(', ')}`)
    if (ui.cssClassesDefined.length > 0) sections.push(`- CSS 定义: ${ui.cssClassesDefined.join(', ')}`)
    if (ui.cssClassesReferenced.length > 0) sections.push(`- CSS 引用: ${ui.cssClassesReferenced.join(', ')}`)
  }

  // 已采纳提案列表
  if (session.acceptedProposals.length > 0) {
    sections.push('')
    sections.push(`### 已采纳提案（${session.acceptedProposals.length}个）`)
    for (const p of session.acceptedProposals) {
      sections.push(`- [${p.step}] ${p.type}「${p.title}」`)
    }
  }

  return sections.join('\n')
}

// ── 序列化 / 反序列化（持久化到 design-session.json）────────────────────────

/**
 * 序列化会话为 JSON 字符串（用于写入 design-session.json）
 *
 * 输出经过整理，确保可读性和可 diff 性。
 */
export function serializeSession(session: PersistedDesignSession): string {
  return JSON.stringify(session, null, 2)
}

/**
 * 从 JSON 字符串反序列化会话
 *
 * 包含版本检查和基本结构校验。
 *
 * @throws 解析失败或版本不兼容时抛出错误（fail-fast）
 */
export function deserializeSession(json: string): PersistedDesignSession {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (e) {
    throw new Error(`design-session.json 解析失败: ${e instanceof Error ? e.message : String(e)}`)
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new Error('design-session.json 格式错误: 根节点必须是对象')
  }

  const obj = raw as Record<string, unknown>

  // 版本检查
  if (obj['version'] !== 1) {
    throw new Error(`design-session.json 版本不兼容: 期望 1，实际 ${String(obj['version'])}`)
  }

  // 结构校验（关键字段存在性）
  const requiredKeys = ['currentPass', 'currentStep', 'dataRegistry', 'viewRegistry', 'uiRegistry', 'acceptedProposals', 'dependencyGraph']
  for (const key of requiredKeys) {
    if (!(key in obj)) {
      throw new Error(`design-session.json 缺少必要字段: ${key}`)
    }
  }

  // 名册A 基本结构
  const drRaw = obj['dataRegistry']
  if (typeof drRaw !== 'object' || drRaw === null || !('tables' in drRaw)) {
    throw new Error('design-session.json dataRegistry 结构无效')
  }

  return raw as PersistedDesignSession
}

// ── 全量校验（B6 步骤使用）─────────────────────────────────────────────────

/** 全量校验问题项 */
export interface FullValidationIssue {
  severity: 'error' | 'warning'
  category: 'dead-reference' | 'missing-definition' | 'orphan-view' | 'unused-function' | 'css-mismatch'
  message: string
}

/**
 * 全量校验：交叉比对名册A / 名册B，检测死引用和遗漏
 *
 * 仅用于 B6 步骤（全量校验阶段），检查：
 * 1. UIRegistry 引用的 CSS 类是否都有定义
 * 2. UIRegistry 定义的 CSS 类是否都被引用
 * 3. ViewRegistry 中的视图是否引用了存在的表
 * 4. 无依赖关系的孤立视图
 */
export function runFullValidation(session: PersistedDesignSession): FullValidationIssue[] {
  const issues: FullValidationIssue[] = []
  const tableNames = new Set(getRegisteredTableNames(session))
  const ui = session.uiRegistry

  // 1. CSS 引用但未定义（两端均为裸类名，无 '.' 前缀）
  const definedClasses = new Set(ui.cssClassesDefined.map((c) => c.startsWith('.') ? c.slice(1) : c))
  for (const ref of ui.cssClassesReferenced) {
    const normalized = ref.startsWith('.') ? ref.slice(1) : ref
    if (!definedClasses.has(normalized) && !isExternalCssClass(normalized)) {
      issues.push({
        severity: 'warning',
        category: 'css-mismatch',
        message: `CSS 类 ${ref} 在 rule.json 中引用但未在 style.css 中定义`,
      })
    }
  }

  // 2. CSS 定义但未引用
  const referencedClasses = new Set(
    ui.cssClassesReferenced.map((c) => c.startsWith('.') ? c.slice(1) : c),
  )
  for (const def of ui.cssClassesDefined) {
    const normalizedDef = def.startsWith('.') ? def.slice(1) : def
    if (!referencedClasses.has(normalizedDef)) {
      issues.push({
        severity: 'warning',
        category: 'css-mismatch',
        message: `CSS 类 ${def} 在 style.css 中定义但未被 rule.json 引用`,
      })
    }
  }

  // 3. ViewRegistry 引用不存在的表
  for (const [vk, view] of Object.entries(session.viewRegistry.views)) {
    if (!tableNames.has(view.tableName)) {
      issues.push({
        severity: 'error',
        category: 'dead-reference',
        message: `视图 ${vk} 引用的表「${view.tableName}」不在名册A 中`,
      })
    }
  }

  // 4. 孤立视图（名册B有视图定义但依赖图中无引用）
  const viewKeysInDeps = new Set<string>()
  for (const key of Object.keys(session.dependencyGraph)) {
    if (key.includes('@')) viewKeysInDeps.add(key)
  }
  for (const vk of Object.keys(session.viewRegistry.views)) {
    const view = session.viewRegistry.views[vk]
    if (!view) continue
    const depKey = `${view.tableName}@${view.viewId}`
    if (!viewKeysInDeps.has(depKey) && session.acceptedProposals.length > 2) {
      issues.push({
        severity: 'warning',
        category: 'orphan-view',
        message: `视图 ${vk} 已规划但无 UI 或脚本引用`,
      })
    }
  }

  return issues
}

/** 判断是否为外部 CSS 类（框架组件类，不需要定义） */
function isExternalCssClass(cls: string): boolean {
  // Element Plus / VXE 等已知前缀（cls 为裸类名，无 '.' 前缀）
  return cls.startsWith('el-') || cls.startsWith('vxe-') || cls.startsWith('is-')
}
