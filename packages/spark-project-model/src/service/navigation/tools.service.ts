import type { ProjectModelData, ProjectNodeData, ProjectNodeLocation } from '../../entity/node/node-base.entity'
import {
  canUseModuleNodeKind,
  createRootModuleNode,
  createReservedRootGroup,
  findConfigNodeByPageId,
  findNodeById,
  findNodeLocation,
  isConfigNodeKind,
  isSystemRootDirectory,
  normalizePageIdFromPath,
  resolvePageNodePageId,
} from '../../entity/node/node-helpers'

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

  static resolvePageNodePageId(node: ProjectNodeData | null | undefined): string {
    return resolvePageNodePageId(node)
  }

  static createReservedRootGroup(
    placement: 'toolbar' | 'user-menu',
    options: { createId: () => string; templateRoot?: ProjectModelData | null },
  ): ProjectNodeData {
    return createReservedRootGroup(placement, options)
  }
}
