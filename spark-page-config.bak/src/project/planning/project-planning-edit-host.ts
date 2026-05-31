/**
 * Project planning edit host.
 *
 * 这一层只处理"用户需求 → 项目模块/页面节点策划"。
 * 输出是项目导航节点与 description 需求沉淀，不包含 rule/pagedata/script/style。
 */

import { deepClone } from '@spark-view/spark-utils'

import type {
  AppNavRoot,
  ChildPlacement,
  NavNode,
} from '../../page-model/navigation/nav-model'
import {
  defaultNavIconByKind,
  normalizeNavRoot,
} from '../../page-model/navigation/nav-editing'
import {
  canProjectNodeContainChild,
  type ProjectPlanningNodeKind,
  type ProjectPlanningParentKind,
} from '../node/project-node-model'
import type { ProjectPlanningSnapshot } from './project-planning-model'

// ── 命令类型与常量 ─────────────────────────────────────────

/** 策划应用模式：merge 保留已有节点只增改，replace 清空后重建。 */
export type ProjectPlanningApplyMode = 'merge' | 'replace'

/** AI 输出的单个策划节点：描述将要创建的模块、页面或子页面。 */
export type ProjectPlanningNodePlan = {
  nodeId: string
  parentNodeId?: string | null
  title: string
  nodeKind: ProjectPlanningNodeKind
  description: string
  pageId?: string
  icon?: string
  order?: number
  childPlacement?: ChildPlacement
}

/** AI 策划命令：包含项目需求和策划节点列表，由 AI 模块输出。 */
export type ProjectPlanningApplyCommand = {
  projectRequirement?: string
  mode?: ProjectPlanningApplyMode
  nodes: readonly ProjectPlanningNodePlan[]
}

/** 策划应用到导航根的结果：包含新导航树、变更统计和警告。 */
export type ProjectPlanningNavigationApplyResult = {
  root: AppNavRoot
  mode: ProjectPlanningApplyMode
  nodeCount: number
  moduleCount: number
  pageCount: number
  createdNodeIds: readonly string[]
  updatedNodeIds: readonly string[]
  changedNodeIds: readonly string[]
  warnings: readonly string[]
}

/** 合并导航结果与项目策划快照的最终返回类型。 */
export type ProjectPlanningApplyResult = Omit<ProjectPlanningNavigationApplyResult, 'root'> & {
  projectPlanning: ProjectPlanningSnapshot
}

/** 策划编辑宿主契约：提供策划快照读取与命令应用两个能力。 */
export type ProjectPlanningEditHost = {
  readProjectPlanning(): ProjectPlanningSnapshot
  applyProjectPlanning(command: ProjectPlanningApplyCommand): ProjectPlanningApplyResult | Promise<ProjectPlanningApplyResult>
}

/** 应用到导航根的全参数选项：包含当前导航根和策划命令。 */
export type ProjectPlanningRootApplyOptions = {
  root: AppNavRoot
  command: ProjectPlanningApplyCommand
}

type FlatNodeRow = {
  node: NavNode
  pid: string | null
  index: number
}

type NormalizedPlanningNodePlan = {
  nodeId: string
  parentNodeId: string | null
  title: string
  nodeKind: ProjectPlanningNodeKind
  description: string
  pageId: string
  icon: string | undefined
  order: number | undefined
  childPlacement: ChildPlacement | undefined
}

const PROJECT_PLANNING_NODE_KINDS = new Set<ProjectPlanningNodeKind>(['module', 'page', 'sub-page'])
const PROJECT_PLANNING_MODES = new Set<ProjectPlanningApplyMode>(['merge', 'replace'])
const PLANNING_CHILD_PLACEMENTS = new Set<ChildPlacement>(['header', 'sidebar', 'parent', 'flat'])

// ── 策划结果应用到导航树 ─────────────────────────────────

/**
 * 将 AI 策划输出应用到导航树根节点。
 *
 * merge 模式：保留已有节点，只增改策划中指定的节点。
 * replace 模式：仅保留 toolbar / user-menu 根子节点，其余按策划重建。
 *
 * 执行校验：父节点 kind 必须能容纳子节点 kind（module 可含 page/page/sub-page，page 可含 sub-page）；
 * 同时检测循环引用并拒绝非法 childPlacement。
 */
export function applyProjectPlanningCommandToRoot(
  options: ProjectPlanningRootApplyOptions,
): ProjectPlanningNavigationApplyResult {
  const mode = normalizeApplyMode(options.command.mode)
  const plans = normalizeProjectPlanningNodePlans(options.command.nodes)
  const currentRoot = normalizeNavRoot(deepClone(options.root))
  const currentRows = flattenRootRows(currentRoot)
  const nextRows = createInitialRows(currentRows, mode)
  const rowsById = new Map<string, FlatNodeRow>(nextRows.map(row => [row.node.id, row]))
  const createdNodeIds: string[] = []
  const updatedNodeIds: string[] = []

  plans.forEach((plan, index) => {
    const existing = rowsById.get(plan.nodeId) ?? null
    const nextNode = createPlannedNavNode(plan, existing?.node ?? null, index)
    const nextRow: FlatNodeRow = {
      node: nextNode,
      pid: plan.parentNodeId,
      index: existing?.index ?? currentRows.length + index,
    }
    if (existing === null) {
      createdNodeIds.push(plan.nodeId)
    } else if (hasPlanningRowChanged(existing, nextRow)) {
      updatedNodeIds.push(plan.nodeId)
    }
    rowsById.set(plan.nodeId, nextRow)
  })

  validatePlanningRows(plans, rowsById)
  const warnings = collectPlanningWarnings(plans)
  const root = normalizeNavRoot({
    ...currentRoot,
    children: buildTreeFromRows([...rowsById.values()]),
  })
  const moduleCount = plans.filter(plan => plan.nodeKind === 'module').length
  const pageCount = plans.filter(plan => plan.nodeKind === 'page' || plan.nodeKind === 'sub-page').length
  const changedNodeIds = [...new Set([...createdNodeIds, ...updatedNodeIds])]
  return {
    root,
    mode,
    nodeCount: plans.length,
    moduleCount,
    pageCount,
    createdNodeIds,
    updatedNodeIds,
    changedNodeIds,
    warnings,
  }
}

function createInitialRows(
  currentRows: readonly FlatNodeRow[],
  mode: ProjectPlanningApplyMode,
): FlatNodeRow[] {
  if (mode === 'merge') {
    return currentRows.map(row => ({
      node: cloneNodeWithoutChildren(row.node),
      pid: row.pid,
      index: row.index,
    }))
  }
  return currentRows
    .filter(row => row.pid === null && (row.node.childPlacement === 'toolbar' || row.node.childPlacement === 'user-menu'))
    .map(row => ({
      node: cloneNodeWithoutChildren(row.node),
      pid: row.pid,
      index: row.index,
    }))
}

function normalizeProjectPlanningNodePlans(
  input: readonly ProjectPlanningNodePlan[],
): NormalizedPlanningNodePlan[] {
  if (input.length === 0) {
    throw new Error('Project planning apply command must include at least one node.')
  }
  const seen = new Set<string>()
  return input.map((plan, index) => {
    const nodeId = requireText(plan.nodeId, `nodes[${index}].nodeId`)
    if (seen.has(nodeId)) {
      throw new Error(`Project planning nodeId duplicated: ${nodeId}`)
    }
    seen.add(nodeId)
    const nodeKind = normalizePlanningNodeKind(plan.nodeKind, index)
    const parentNodeId = optionalText(plan.parentNodeId)
    const childPlacement = normalizeChildPlacement(plan.childPlacement, index)
    return {
      nodeId,
      parentNodeId,
      title: requireText(plan.title, `nodes[${index}].title`),
      nodeKind,
      description: requireText(plan.description, `nodes[${index}].description`),
      pageId: optionalText(plan.pageId) ?? nodeId,
      icon: optionalTextOrUndefined(plan.icon),
      order: normalizeOrder(plan.order, index),
      childPlacement,
    }
  })
}

function normalizeApplyMode(value: ProjectPlanningApplyMode | undefined): ProjectPlanningApplyMode {
  if (value === undefined) return 'merge'
  if (PROJECT_PLANNING_MODES.has(value)) return value
  throw new Error(`Unsupported project planning apply mode: ${String(value)}`)
}

function normalizePlanningNodeKind(
  value: ProjectPlanningNodeKind,
  index: number,
): ProjectPlanningNodeKind {
  if (PROJECT_PLANNING_NODE_KINDS.has(value)) return value
  throw new Error(`nodes[${index}].nodeKind must be module, page, or sub-page.`)
}

function normalizeChildPlacement(
  value: ChildPlacement | undefined,
  index: number,
): ChildPlacement | undefined {
  if (value === undefined) return undefined
  if (PLANNING_CHILD_PLACEMENTS.has(value)) return value
  throw new Error(`nodes[${index}].childPlacement is not allowed for project planning.`)
}

function normalizeOrder(value: number | undefined, index: number): number | undefined {
  if (value === undefined) return undefined
  if (Number.isFinite(value)) return value
  throw new Error(`nodes[${index}].order must be a finite number.`)
}

function createPlannedNavNode(
  plan: NormalizedPlanningNodePlan,
  existing: NavNode | null,
  fallbackOrder: number,
): NavNode {
  const base: Partial<NavNode> = existing === null ? {} : cloneNodeWithoutChildren(existing)
  const node: NavNode = {
    ...base,
    id: plan.nodeId,
    title: plan.title,
    nodeKind: plan.nodeKind,
    description: plan.description,
    icon: plan.icon ?? base.icon ?? defaultNavIconByKind(plan.nodeKind),
    order: plan.order ?? base.order ?? fallbackOrder,
    permissionMode: base.permissionMode ?? 'masked',
  }
  if (plan.childPlacement !== undefined) {
    node.childPlacement = plan.childPlacement
  }
  applyPlanningNodeKindFields(node, plan)
  return node
}

function applyPlanningNodeKindFields(
  node: NavNode,
  plan: NormalizedPlanningNodePlan,
): void {
  if (plan.nodeKind === 'module') {
    delete node.path
    delete node.redirect
    delete node.linkTarget
    delete node.parentPageId
    node.hidden = false
    node.childPlacement = plan.childPlacement ?? node.childPlacement ?? 'sidebar'
    return
  }
  if (plan.nodeKind === 'page') {
    node.path = `/${plan.pageId}`
    delete node.redirect
    delete node.linkTarget
    delete node.parentPageId
    node.hidden = false
    delete node.childPlacement
    return
  }
  delete node.path
  delete node.redirect
  delete node.linkTarget
  delete node.childPlacement
  node.hidden = true
}

function validatePlanningRows(
  plans: readonly NormalizedPlanningNodePlan[],
  rowsById: ReadonlyMap<string, FlatNodeRow>,
): void {
  for (const plan of plans) {
    const parentKind = readPlanningParentKind(plan.parentNodeId, rowsById)
    if (!canProjectNodeContainChild(parentKind, plan.nodeKind)) {
      throw new Error(
        `Project planning cannot place ${plan.nodeKind} "${plan.nodeId}" under ${parentKind} parent "${plan.parentNodeId ?? 'project'}".`,
      )
    }
  }
  validateNoPlanningCycles(rowsById)
}

function readPlanningParentKind(
  parentNodeId: string | null,
  rowsById: ReadonlyMap<string, FlatNodeRow>,
): ProjectPlanningParentKind {
  if (parentNodeId === null) return 'project'
  const parent = rowsById.get(parentNodeId)
  if (parent === undefined) {
    throw new Error(`Project planning parent node not found: ${parentNodeId}`)
  }
  const kind = parent.node.nodeKind ?? 'page'
  if (kind === 'module' || kind === 'system-directory') return 'module'
  if (kind === 'page') return 'page'
  if (kind === 'sub-page') return 'sub-page'
  throw new Error(`Project planning parent node kind is not plannable: ${parentNodeId}`)
}

function validateNoPlanningCycles(rowsById: ReadonlyMap<string, FlatNodeRow>): void {
  for (const nodeId of rowsById.keys()) {
    const seen = new Set<string>()
    let current: string | null = nodeId
    while (current !== null) {
      if (seen.has(current)) {
        throw new Error(`Project planning node cycle detected at: ${current}`)
      }
      seen.add(current)
      current = rowsById.get(current)?.pid ?? null
    }
  }
}

// ── 内部辅助：节点创建、校验与树操作 ────────────────────

function collectPlanningWarnings(plans: readonly NormalizedPlanningNodePlan[]): string[] {
  const warnings: string[] = []
  for (const plan of plans) {
    if (plan.nodeKind === 'sub-page' && plan.pageId !== plan.nodeId) {
      warnings.push(`sub-page "${plan.nodeId}" ignores pageId and uses nodeId as pageId.`)
    }
  }
  return warnings
}

function flattenRootRows(root: AppNavRoot): FlatNodeRow[] {
  const rows: FlatNodeRow[] = []
  const visit = (nodes: readonly NavNode[], pid: string | null): void => {
    nodes.forEach((node, index) => {
      rows.push({ node: cloneNodeWithoutChildren(node), pid, index })
      visit(node.children ?? [], node.id)
    })
  }
  visit(root.children, null)
  return rows
}

function buildTreeFromRows(rows: readonly FlatNodeRow[]): NavNode[] {
  const childrenByParent = new Map<string, NavNode[]>()
  const normalizedRows = rows.map(row => ({
    ...row,
    node: cloneNodeWithoutChildren(row.node),
  }))
  for (const row of normalizedRows) {
    const parentKey = row.pid ?? ''
    const siblings = childrenByParent.get(parentKey) ?? []
    siblings.push(row.node)
    childrenByParent.set(parentKey, siblings)
  }
  for (const row of normalizedRows) {
    const children = childrenByParent.get(row.node.id)
    if (children !== undefined && children.length > 0) {
      row.node.children = sortNavNodes(children)
    }
  }
  return sortNavNodes(childrenByParent.get('') ?? [])
}

function hasPlanningRowChanged(previous: FlatNodeRow, next: FlatNodeRow): boolean {
  if (previous.pid !== next.pid) return true
  return JSON.stringify(previous.node) !== JSON.stringify(next.node)
}

function sortNavNodes(nodes: NavNode[]): NavNode[] {
  return [...nodes].sort((left, right) => {
    const leftOrder = typeof left.order === 'number' ? left.order : 0
    const rightOrder = typeof right.order === 'number' ? right.order : 0
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    return left.id.localeCompare(right.id)
  })
}

function cloneNodeWithoutChildren(node: NavNode): NavNode {
  const cloned = deepClone(node)
  delete cloned.children
  return cloned
}

function requireText(value: string, fieldName: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`Project planning ${fieldName} must not be empty.`)
  }
  return normalized
}

function optionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const normalized = value.trim()
  return normalized.length === 0 ? null : normalized
}

function optionalTextOrUndefined(value: string | null | undefined): string | undefined {
  return optionalText(value) ?? undefined
}
