/**
 * PageNode navigation operations.
 *
 * 这是围绕 PageNode 的导航用例层：挂载、移动和卸载页面节点。
 * 它贴近 navigation 子模块，不让 PageNode 聚合类直接持有导航生命周期流程。
 */

import type { NavNode } from './nav-model'
import type { NavigationConfigClient } from './nav-client'
import {
  PageNavigationLifecycle,
  type PageNavigationMountParams,
} from './page-navigation-lifecycle'

export type PageNodeMountParams = Omit<PageNavigationMountParams, 'pageId'>

export type PageNodeCreateMountedParams = PageNodeMountParams & {
  rollbackPageOnNavigationFailure?: boolean
}

export type PageNodeCreateMountedResult = {
  page: Record<string, unknown>
  node: NavNode
}

export type PageNodeRemoveMountedParams = {
  nodeId?: string
  deleteFiles?: boolean
}

export type PageNodeRemoveMountedResult = {
  deletedNode: NavNode | null
  deletedFiles: boolean
}

export type PageNodeNavigationOperationsOptions = {
  navigationClient: NavigationConfigClient
}

export class PageNodeNavigationOperations {
  private readonly lifecycle: PageNavigationLifecycle

  constructor(options: PageNodeNavigationOperationsOptions) {
    this.lifecycle = new PageNavigationLifecycle({
      navigationClient: options.navigationClient,
    })
  }

  mountPage(pageId: string, params: PageNodeMountParams = {}): Promise<NavNode> {
    return this.lifecycle.mountPage({
      pageId,
      ...params,
    })
  }

  moveMountedPage(nodeId: string, newParentId: string | null, index: number): Promise<NavNode> {
    return this.lifecycle.moveMountedPage(nodeId, newParentId, index)
  }

  unmountPage(pageId: string, nodeId?: string): Promise<NavNode | null> {
    return this.lifecycle.unmountPage(pageId, nodeId)
  }
}
