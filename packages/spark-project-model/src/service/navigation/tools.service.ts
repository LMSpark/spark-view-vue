import type { ProjectModelData, ProjectNodeData } from '../../entity/node/node-base.entity'
import type { ProjectNodeLocation } from './editing.service'
import {
  canUseModuleNodeKind,
  createRootModuleNode,
  createReservedRootGroup,
  findConfigNodeByPageId,
  findNodeById,
  findNodeLocation,
  isSystemRootDirectory,
  normalizePageIdFromPath,
} from './editing.service'
import {
  appendProjectDescriptionContext,
  canProjectNodeContainChild,
  formatProjectDescriptionContext,
  isConfigNodeKind,
  readAllowedProjectEditChildKinds,
  readProjectNodeDescription,
  readProjectEditNodeKind,
  resolvePageNodePageId,
  type ProjectPageNodeSummary,
  type ProjectEditNodeKind,
  type ProjectEditParentKind,
  type ProjectDescriptionContext,
} from '../../entity/node/node-factory'

export type BuildProjectPageSummariesOptions = {
  descriptionContext?: readonly ProjectDescriptionContext[]
}

export type ReadProjectEditNodeOptions = {
  rootNodes: readonly ProjectNodeData[]
}

export class ProjectNodeTools {
  static createRootModuleNode(createId: () => string): ProjectNodeData {
    return createRootModuleNode(createId)
  }

  static resolvePageIdFromPath(path: string | undefined | null): string {
    return normalizePageIdFromPath(path)
  }

  static isConfigNodeKind(nodeKind: string | undefined | null): boolean {
    return isConfigNodeKind(nodeKind)
  }

  static findNodeById(nodes: readonly ProjectNodeData[], targetId: string): ProjectNodeData | null {
    return findNodeById(nodes, targetId)
  }

  static findNodeLocation(nodes: readonly ProjectNodeData[], targetId: string): ProjectNodeLocation | null {
    return findNodeLocation(nodes, targetId)
  }

  static findConfigNodeByPageId(nodes: readonly ProjectNodeData[], pageId: string): ProjectNodeData | null {
    return findConfigNodeByPageId(nodes, pageId)
  }

  static findPageNodeByPageId(nodes: readonly ProjectNodeData[], pageId: string): ProjectNodeData | null {
    const normalized = pageId.trim()
    if (!normalized) return null
    for (const node of nodes) {
      if (resolvePageNodePageId(node) === normalized) return node
      const found = ProjectNodeTools.findPageNodeByPageId(node.children ?? [], normalized)
      if (found !== null) return found
    }
    return null
  }

  static isSystemRootDirectory(node: ProjectNodeData | null | undefined, rootNodes: readonly ProjectNodeData[]): boolean {
    return isSystemRootDirectory(node, rootNodes)
  }

  static canUseModuleNodeKind(node: ProjectNodeData | null | undefined, rootNodes: readonly ProjectNodeData[]): boolean {
    return canUseModuleNodeKind(node, rootNodes)
  }

  static readEditNodeKind(node: ProjectNodeData | null | undefined): ProjectEditNodeKind | null {
    return readProjectEditNodeKind(node)
  }

  static resolvePageNodePageId(node: ProjectNodeData | null | undefined): string {
    return resolvePageNodePageId(node)
  }

  static canContainEditChild(
    parentKind: ProjectEditParentKind,
    childKind: ProjectEditNodeKind,
  ): boolean {
    return canProjectNodeContainChild(parentKind, childKind)
  }

  static readAllowedEditChildKinds(parentKind: ProjectEditParentKind): readonly ProjectEditNodeKind[] {
    return readAllowedProjectEditChildKinds(parentKind)
  }

  static readEditParentKind(
    node: ProjectNodeData | null | undefined,
    options: ReadProjectEditNodeOptions,
  ): ProjectEditParentKind {
    if (!node) return 'project'
    const location = ProjectNodeTools.findNodeLocation(options.rootNodes, node.id)
    const parentNode = location?.parent ?? null
    if (!parentNode) return 'project'
    return ProjectNodeTools.readEditNodeKind(parentNode) ?? 'project'
  }

  static canUseEditNodeKind(
    node: ProjectNodeData | null | undefined,
    nextKind: ProjectEditNodeKind,
    options: ReadProjectEditNodeOptions,
  ): boolean {
    return ProjectNodeTools.canContainEditChild(
      ProjectNodeTools.readEditParentKind(node, options),
      nextKind,
    )
  }

  static createReservedRootGroup(
    placement: 'toolbar' | 'user-menu',
    options: { createId: () => string; templateRoot?: ProjectModelData | null },
  ): ProjectNodeData {
    return createReservedRootGroup(placement, options)
  }

  static readNodeDescription(node: ProjectNodeData | null | undefined): string {
    return readProjectNodeDescription(node)
  }

  static appendDescriptionContext(
    context: readonly ProjectDescriptionContext[],
    node: ProjectNodeData | null | undefined,
  ): ProjectDescriptionContext[] {
    return appendProjectDescriptionContext(context, node)
  }

  static formatDescriptionContext(context: readonly ProjectDescriptionContext[]): string {
    return formatProjectDescriptionContext(context)
  }

  static buildPageSummaries(
    nodes: readonly ProjectNodeData[],
    options: BuildProjectPageSummariesOptions = {},
  ): ProjectPageNodeSummary[] {
    const pages: ProjectPageNodeSummary[] = []
    const seen = new Set<string>()

    const visit = (
      list: readonly ProjectNodeData[],
      context: readonly ProjectDescriptionContext[],
    ): void => {
      for (const node of list) {
        const nextContext = appendProjectDescriptionContext(context, node)
        const pageId = resolvePageNodePageId(node)
        if (pageId !== '' && isConfigNodeKind(node.nodeKind ?? 'page') && !seen.has(pageId)) {
          const description = readProjectNodeDescription(node)
          seen.add(pageId)
          pages.push({
            pageId,
            path: node.path ?? `/${pageId}`,
            title: node.title,
            nodeId: node.id,
            nodeKind: node.nodeKind ?? 'page',
            description,
            descriptionContext: nextContext,
            effectiveDescription: formatProjectDescriptionContext(nextContext),
            ...(node.icon !== undefined ? { icon: node.icon } : {}),
          })
        }
        visit(node.children ?? [], nextContext)
      }
    }

    visit(nodes, options.descriptionContext ?? [])
    return pages
  }
}
