/**
 * Page navigation lifecycle.
 *
 * 管理 PageNode 在导航树上的挂载、移动和卸载。
 * 页面文件创建/删除由 PageNodeFileApi 处理，组合顺序由 PageNode 聚合根负责。
 */

import { assertNonEmptyPageId } from '../../standalone/internal/assert-page-id'
import type { NavigationConfigClient } from './client.service'
import type { ProjectNodeData } from '../../entity/node/node-base.entity'
import { defaultNavIconByKind } from '../../entity/navigation/edit.entity'
import {
  findConfigNodeByPageId,
  normalizeProjectNodeData,
} from '../../entity/node/node-helpers'

export type PageNavigationMountParams = {
  pageId: string
  title?: string
  icon?: string
  node?: ProjectNodeData
  parentId?: string | null
  index?: number
}

export type PageNavigationLifecycleOptions = {
  navigationClient: NavigationConfigClient
}

function defaultPageNavigationNode(params: PageNavigationMountParams): ProjectNodeData {
  const pageId = assertNonEmptyPageId(params.pageId)
  const title = params.title?.trim()
  const icon = params.icon?.trim()
  const node = params.node ?? {
    id: pageId,
    title: title !== undefined && title.length > 0 ? title : pageId,
    icon: icon !== undefined && icon.length > 0 ? icon : defaultNavIconByKind('page'),
    nodeKind: 'page',
    path: `/${pageId}`,
  }
  return normalizeProjectNodeData(node)
}

export class PageNavigationLifecycle {
  private readonly navigationClient: NavigationConfigClient

  constructor(options: PageNavigationLifecycleOptions) {
    this.navigationClient = options.navigationClient
  }

  async mountPage(params: PageNavigationMountParams): Promise<ProjectNodeData> {
    assertNonEmptyPageId(params.pageId)
    return this.navigationClient.addNode({
      ...(params.parentId === undefined ? {} : { parentId: params.parentId }),
      node: defaultPageNavigationNode(params),
      ...(params.index === undefined ? {} : { index: params.index }),
    })
  }

  async moveMountedPage(nodeId: string, newParentId: string | null, index: number): Promise<ProjectNodeData> {
    if (nodeId.trim().length === 0) {
      throw new Error('nodeId must be a non-empty string')
    }
    return this.navigationClient.moveNode(nodeId, newParentId, index)
  }

  async unmountPage(pageId: string, nodeId?: string): Promise<ProjectNodeData | null> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    const resolvedNodeId = await this.resolveNavigationNodeId(normalizedPageId, nodeId)
    return this.navigationClient.deleteNode(resolvedNodeId)
  }

  private async resolveNavigationNodeId(pageId: string, nodeId?: string): Promise<string> {
    const explicitNodeId = nodeId?.trim()
    if (explicitNodeId) return explicitNodeId

    const root = await this.navigationClient.loadRoot()
    const found = findConfigNodeByPageId(root.children, assertNonEmptyPageId(pageId))
    if (found === null) {
      throw new Error(`navigation node not found for pageId: ${pageId}`)
    }
    return found.id
  }
}
