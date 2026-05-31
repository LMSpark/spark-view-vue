import type { AppNavRoot, NavNode } from '../../page-model/navigation/nav-model'
import type { NavigationNodeDraft, NavNodeLocation } from '../../page-model/navigation/nav-editing'
import {
  canUseModuleNodeKind,
  createReservedRootGroup,
  findConfigNodeByPageId,
  findNodeById,
  findNodeLocation,
  isSystemRootDirectory,
  normalizePageIdFromPath,
} from '../../page-model/navigation/nav-editing'
import {
  appendProjectRequirementConstraint,
  canProjectNodeContainChild,
  formatProjectRequirementConstraints,
  isConfigNodeKind,
  readAllowedProjectPlanningChildKinds,
  readProjectNodeRequirement,
  readProjectPlanningNodeKind,
  resolvePageNodePageId,
  type ProjectPageNodeSummary,
  type ProjectPlanningNodeKind,
  type ProjectPlanningParentKind,
  type ProjectRequirementConstraint,
} from './project-node-model'

export type ProjectNodeDraft = {
  [Key in keyof NavigationNodeDraft]: NavigationNodeDraft[Key]
}

export type BuildProjectPageSummariesOptions = {
  inheritedConstraints?: readonly ProjectRequirementConstraint[]
}

export type ReadPlanningNodeOptions = {
  rootNodes: readonly NavNode[]
}

export class ProjectNodeTools {
  static resolvePageIdFromPath(path: string | undefined | null): string {
    return normalizePageIdFromPath(path)
  }

  static isConfigNodeKind(nodeKind: string | undefined | null): boolean {
    return isConfigNodeKind(nodeKind)
  }

  static findNodeById(nodes: readonly NavNode[], targetId: string): NavNode | null {
    return findNodeById(nodes, targetId)
  }

  static findNodeLocation(nodes: readonly NavNode[], targetId: string): NavNodeLocation | null {
    return findNodeLocation(nodes, targetId)
  }

  static findConfigNodeByPageId(nodes: readonly NavNode[], pageId: string): NavNode | null {
    return findConfigNodeByPageId(nodes, pageId)
  }

  static findPageNodeByPageId(nodes: readonly NavNode[], pageId: string): NavNode | null {
    const normalized = pageId.trim()
    if (!normalized) return null
    for (const node of nodes) {
      if (resolvePageNodePageId(node) === normalized) return node
      const found = ProjectNodeTools.findPageNodeByPageId(node.children ?? [], normalized)
      if (found !== null) return found
    }
    return null
  }

  static isSystemRootDirectory(node: NavNode | null | undefined, rootNodes: readonly NavNode[]): boolean {
    return isSystemRootDirectory(node, rootNodes)
  }

  static canUseModuleNodeKind(node: NavNode | null | undefined, rootNodes: readonly NavNode[]): boolean {
    return canUseModuleNodeKind(node, rootNodes)
  }

  static readPlanningNodeKind(node: NavNode | null | undefined): ProjectPlanningNodeKind | null {
    return readProjectPlanningNodeKind(node)
  }

  static resolvePageNodePageId(node: NavNode | null | undefined): string {
    return resolvePageNodePageId(node)
  }

  static canContainPlanningChild(
    parentKind: ProjectPlanningParentKind,
    childKind: ProjectPlanningNodeKind,
  ): boolean {
    return canProjectNodeContainChild(parentKind, childKind)
  }

  static readAllowedPlanningChildKinds(parentKind: ProjectPlanningParentKind): readonly ProjectPlanningNodeKind[] {
    return readAllowedProjectPlanningChildKinds(parentKind)
  }

  static readPlanningParentKind(
    node: NavNode | null | undefined,
    options: ReadPlanningNodeOptions,
  ): ProjectPlanningParentKind {
    if (!node) return 'project'
    const location = ProjectNodeTools.findNodeLocation(options.rootNodes, node.id)
    const parentNode = location?.parent ?? null
    if (!parentNode) return 'project'
    return ProjectNodeTools.readPlanningNodeKind(parentNode) ?? 'project'
  }

  static canUsePlanningNodeKind(
    node: NavNode | null | undefined,
    nextKind: ProjectPlanningNodeKind,
    options: ReadPlanningNodeOptions,
  ): boolean {
    return ProjectNodeTools.canContainPlanningChild(
      ProjectNodeTools.readPlanningParentKind(node, options),
      nextKind,
    )
  }

  static createReservedRootGroup(
    placement: 'toolbar' | 'user-menu',
    options: { createId: () => string; templateRoot?: AppNavRoot | null },
  ): NavNode {
    return createReservedRootGroup(placement, options)
  }

  static readNodeRequirement(node: NavNode | null | undefined): string {
    return readProjectNodeRequirement(node)
  }

  static appendRequirementConstraint(
    constraints: readonly ProjectRequirementConstraint[],
    node: NavNode | null | undefined,
  ): ProjectRequirementConstraint[] {
    return appendProjectRequirementConstraint(constraints, node)
  }

  static formatRequirementConstraints(constraints: readonly ProjectRequirementConstraint[]): string {
    return formatProjectRequirementConstraints(constraints)
  }

  static buildPageSummaries(
    nodes: readonly NavNode[],
    options: BuildProjectPageSummariesOptions = {},
  ): ProjectPageNodeSummary[] {
    const pages: ProjectPageNodeSummary[] = []
    const seen = new Set<string>()

    const visit = (
      list: readonly NavNode[],
      constraints: readonly ProjectRequirementConstraint[],
    ): void => {
      for (const node of list) {
        const nextConstraints = appendProjectRequirementConstraint(constraints, node)
        const pageId = resolvePageNodePageId(node)
        if (pageId !== '' && isConfigNodeKind(node.nodeKind ?? 'page') && !seen.has(pageId)) {
          const userRequirement = readProjectNodeRequirement(node)
          seen.add(pageId)
          pages.push({
            pageId,
            path: node.path ?? `/${pageId}`,
            title: node.title,
            nodeId: node.id,
            nodeKind: node.nodeKind ?? 'page',
            description: userRequirement,
            userRequirement,
            requirementConstraints: nextConstraints,
            effectiveUserRequirement: formatProjectRequirementConstraints(nextConstraints),
            ...(node.icon !== undefined ? { icon: node.icon } : {}),
          })
        }
        visit(node.children ?? [], nextConstraints)
      }
    }

    visit(nodes, options.inheritedConstraints ?? [])
    return pages
  }
}
