/**
 * ProjectPlanningModel — 项目功能策划模型。
 *
 * 项目策划从项目需求/功能出发，落到项目节点集合，再落到每个页面节点的功能策划。
 * 页面功能的唯一真源是模块树节点 `description` 字段；`userRequirement` 只是给 AI
 * 任务输入使用的同值投影。
 */

import type { NavNode } from '../../page-model/navigation/nav-model'
import type { ProjectNodeCollection } from '../node/project-node-collection'
import {
  appendProjectRequirementConstraint,
  canProjectNodeContainChild,
  formatProjectRequirementConstraints,
  isConfigNodeKind,
  readProjectNodeRequirement,
  readProjectPlanningNodeKind,
  resolvePageNodePageId,
  type ProjectPageNodeSummary,
  type ProjectPlanningNodeKind,
  type ProjectPlanningParentKind,
  type ProjectRequirementConstraint,
} from '../node/project-node-model'

export type ProjectPlanningModelOptions = {
  projectId: string
  nodes: ProjectNodeCollection
  projectRequirement?: string
}

export type ProjectPlannedNode = {
  nodeId: string
  title: string
  nodeKind: ProjectPlanningNodeKind
  description: string
  userRequirement: string
  requirementConstraints: ProjectRequirementConstraint[]
  effectiveUserRequirement: string
  pageId?: string
  path?: string
  children: ProjectPlannedNode[]
}

export type ProjectModulePlan = {
  nodeId: string
  title: string
  nodeKind: 'module'
  description: string
  userRequirement: string
  requirementConstraints: ProjectRequirementConstraint[]
  effectiveRequirement: string
  modulePlans: ProjectModulePlan[]
  pagePlans: ProjectPagePlan[]
}

export type ProjectPagePlan = {
  nodeId: string
  pageId: string
  title: string
  nodeKind: 'page' | 'sub-page'
  description: string
  userRequirement: string
  requirementConstraints: ProjectRequirementConstraint[]
  effectiveUserRequirement: string
  path?: string
  subPagePlans: ProjectPagePlan[]
}

export type ProjectPlanningSnapshot = {
  projectId: string
  scope: 'project' | 'module' | 'page'
  title: string
  requirement: string
  requirementConstraints: ProjectRequirementConstraint[]
  effectiveRequirement: string
  scopeNodeId: string | null
  modulePlans: ProjectModulePlan[]
  pagePlans: ProjectPagePlan[]
  nodes: ProjectPlannedNode[]
  pageFeatures: ProjectPageNodeSummary[]
}

export class ProjectPlanningModel {
  readonly projectId: string
  private readonly nodes: ProjectNodeCollection
  private projectRequirement = ''

  constructor(options: ProjectPlanningModelOptions) {
    const projectId = options.projectId.trim()
    if (!projectId) {
      throw new Error('projectId 不能为空')
    }
    this.projectId = projectId
    this.nodes = options.nodes
    this.nodes.setProjectId(projectId)
    if (options.projectRequirement !== undefined) {
      this.setProjectRequirement(options.projectRequirement)
    }
  }

  get requirement(): string {
    return this.projectRequirement
  }

  set requirement(value: string) {
    this.setProjectRequirement(value)
  }

  setProjectRequirement(requirement: string): void {
    this.projectRequirement = requirement.trim()
    this.nodes.requirement = this.projectRequirement
  }

  readPageFeatures(): ProjectPageNodeSummary[] {
    return this.nodes.readPageSummaries()
  }

  readProjectPlanning(): ProjectPlanningSnapshot {
    const requirementConstraints = this.readProjectConstraints()
    const parts = buildPlanningParts(this.nodes.children, 'project', requirementConstraints)
    return {
      projectId: this.projectId,
      scope: 'project',
      title: this.projectId,
      requirement: this.projectRequirement,
      requirementConstraints,
      effectiveRequirement: formatProjectRequirementConstraints(requirementConstraints),
      scopeNodeId: null,
      modulePlans: parts.modulePlans,
      pagePlans: parts.pagePlans,
      nodes: parts.nodes,
      pageFeatures: this.readPageFeatures(),
    }
  }

  readModulePlanning(moduleNodeId: string): ProjectPlanningSnapshot {
    const normalized = moduleNodeId.trim()
    if (!normalized) {
      throw new Error('moduleNodeId 不能为空')
    }
    const model = this.nodes.findNodeById(normalized)
    const node = model?.node ?? null
    if (node === null) {
      throw new Error(`模块树节点未找到: ${normalized}`)
    }
    const children = Array.isArray(node.children) ? node.children : []
    const requirementConstraints = this.readNodeConstraints(normalized)
    const parts = buildPlanningParts(children, 'module', requirementConstraints)
    return {
      projectId: this.projectId,
      scope: 'module',
      title: node.title,
      requirement: readProjectNodeRequirement(node),
      requirementConstraints,
      effectiveRequirement: formatProjectRequirementConstraints(requirementConstraints),
      scopeNodeId: node.id,
      modulePlans: parts.modulePlans,
      pagePlans: parts.pagePlans,
      nodes: parts.nodes,
      pageFeatures: this.readPageFeatures().filter(page => isNodeInside(node, page.nodeId)),
    }
  }

  readPagePlanning(pageNodeId: string): ProjectPlanningSnapshot {
    const normalized = pageNodeId.trim()
    if (!normalized) {
      throw new Error('pageNodeId 不能为空')
    }
    const model = this.nodes.findNodeById(normalized)
    const node = model?.node ?? null
    if (node === null) {
      throw new Error(`模块树节点未找到: ${normalized}`)
    }
    const nodeKind = readProjectPlanningNodeKind(node)
    if (nodeKind !== 'page' && nodeKind !== 'sub-page') {
      throw new Error(`节点不是页面规划节点: ${normalized}`)
    }
    const children = Array.isArray(node.children) ? node.children : []
    const requirementConstraints = this.readNodeConstraints(normalized)
    const parts = buildPlanningParts(children, nodeKind, requirementConstraints)
    return {
      projectId: this.projectId,
      scope: 'page',
      title: node.title,
      requirement: readProjectNodeRequirement(node),
      requirementConstraints,
      effectiveRequirement: formatProjectRequirementConstraints(requirementConstraints),
      scopeNodeId: node.id,
      modulePlans: [],
      pagePlans: parts.pagePlans,
      nodes: parts.nodes,
      pageFeatures: this.readPageFeatures().filter(page => isNodeInside(node, page.nodeId)),
    }
  }

  readPageFeature(pageId: string): ProjectPageNodeSummary | null {
    const normalized = pageId.trim()
    if (!normalized) {
      throw new Error('pageId 不能为空')
    }
    return this.readPageFeatures().find(page => page.pageId === normalized) ?? null
  }

  readNodeRequirement(node: NavNode | null | undefined): string {
    return readProjectNodeRequirement(node)
  }

  private readProjectConstraints(): ProjectRequirementConstraint[] {
    if (!this.projectRequirement) return []
    return [{
      nodeId: this.projectId,
      title: this.projectId,
      nodeKind: 'project',
      description: this.projectRequirement,
    }]
  }

  private readNodeConstraints(nodeId: string): ProjectRequirementConstraint[] {
    const path = findNodePath(this.nodes.children, nodeId)
    if (path.length === 0) {
      throw new Error(`模块树节点未找到: ${nodeId}`)
    }
    let constraints = this.readProjectConstraints()
    for (const node of path) {
      constraints = appendProjectRequirementConstraint(constraints, node)
    }
    return constraints
  }
}

type PlanningParts = {
  modulePlans: ProjectModulePlan[]
  pagePlans: ProjectPagePlan[]
  nodes: ProjectPlannedNode[]
}

function buildPlanningParts(
  nodes: readonly NavNode[],
  parentKind: ProjectPlanningParentKind,
  inheritedConstraints: readonly ProjectRequirementConstraint[],
): PlanningParts {
  const modulePlans: ProjectModulePlan[] = []
  const pagePlans: ProjectPagePlan[] = []
  const plannedNodes: ProjectPlannedNode[] = []
  for (const node of nodes) {
    const nodeKind = readProjectPlanningNodeKind(node)
    const nextConstraints = appendProjectRequirementConstraint(inheritedConstraints, node)
    const childParts = Array.isArray(node.children)
      ? buildPlanningParts(node.children, nodeKind ?? parentKind, nextConstraints)
      : emptyPlanningParts()
    if (nodeKind === null) {
      modulePlans.push(...childParts.modulePlans)
      pagePlans.push(...childParts.pagePlans)
      plannedNodes.push(...childParts.nodes)
      continue
    }
    if (!canProjectNodeContainChild(parentKind, nodeKind)) {
      continue
    }
    const requirement = readProjectNodeRequirement(node)
    const plannedNode: ProjectPlannedNode = {
      nodeId: node.id,
      title: node.title,
      nodeKind,
      description: requirement,
      userRequirement: requirement,
      requirementConstraints: nextConstraints,
      effectiveUserRequirement: formatProjectRequirementConstraints(nextConstraints),
      ...readOptionalPageLink(node),
      children: childParts.nodes,
    }
    plannedNodes.push(plannedNode)
    if (nodeKind === 'module') {
      modulePlans.push({
        nodeId: node.id,
        title: node.title,
        nodeKind,
        description: requirement,
        userRequirement: requirement,
        requirementConstraints: nextConstraints,
        effectiveRequirement: formatProjectRequirementConstraints(nextConstraints),
        modulePlans: childParts.modulePlans,
        pagePlans: childParts.pagePlans,
      })
    } else {
      pagePlans.push({
        nodeId: node.id,
        pageId: resolvePageNodePageId(node),
        title: node.title,
        nodeKind,
        description: requirement,
        userRequirement: requirement,
        requirementConstraints: nextConstraints,
        effectiveUserRequirement: formatProjectRequirementConstraints(nextConstraints),
        ...readOptionalPageLink(node),
        subPagePlans: childParts.pagePlans,
      })
    }
  }
  return {
    modulePlans,
    pagePlans,
    nodes: plannedNodes,
  }
}

function emptyPlanningParts(): PlanningParts {
  return {
    modulePlans: [],
    pagePlans: [],
    nodes: [],
  }
}

function readOptionalPageLink(node: NavNode): { pageId?: string; path?: string } {
  const pageId = resolvePageNodePageId(node)
  if (!pageId || !isConfigNodeKind(node.nodeKind ?? 'page')) {
    return {}
  }
  return node.path === undefined
    ? { pageId }
    : { pageId, path: node.path }
}

function isNodeInside(root: NavNode, nodeId: string): boolean {
  if (root.id === nodeId) return true
  for (const child of root.children ?? []) {
    if (isNodeInside(child, nodeId)) return true
  }
  return false
}

function findNodePath(nodes: readonly NavNode[], targetNodeId: string): NavNode[] {
  for (const node of nodes) {
    if (node.id === targetNodeId) return [node]
    const children = Array.isArray(node.children) ? node.children : []
    const childPath = findNodePath(children, targetNodeId)
    if (childPath.length > 0) return [node, ...childPath]
  }
  return []
}
