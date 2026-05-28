/**
 * PageConfigFileLifecycle。
 *
 * 提供页面文件与导航节点的生命周期管理能力。
 */

import type { BasePageConfigLoader, PageConfigFileName } from '../config/config-types'
import type {
  PageConfigCreatePageParams,
  PageConfigFileApi,
} from '../config/page-config-file-api'
import {
  PAGE_CONFIG_FILE_NAMES,
} from '../config/config-types'
import type { NavNode } from '../navigation/nav-model'
import { assertNonEmptyPageId } from '../internal/assert-page-id'
import {
  defaultNavIconByKind,
  findConfigNodeByPageId,
  normalizeNavNode,
} from '../navigation/nav-editing'
import type { NavigationConfigClient } from '../navigation/nav-client'

export type PageConfigFileLifecycleOptions = {
  fileApi: PageConfigFileApi
  navigationClient: NavigationConfigClient
  getConfigLoader?: () => Pick<BasePageConfigLoader, 'clearCache'>
}

export type PageNavigationMountParams = PageConfigCreatePageParams & {
  node?: NavNode
  parentId?: string | null
  index?: number
}

export type CreateMountedPageParams = PageNavigationMountParams & {
  rollbackPageOnNavigationFailure?: boolean
}

export type CreateMountedPageResult = {
  page: Record<string, unknown>
  node: NavNode
}

export type RemoveMountedPageParams = {
  pageId: string
  nodeId?: string
  deleteFiles?: boolean
}

export type RemoveMountedPageResult = {
  deletedNode: NavNode | null
  deletedFiles: boolean
}

function defaultPageNavigationNode(params: PageNavigationMountParams): NavNode {
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
  return normalizeNavNode(node)
}

/**
 * 页面文件和导航节点的生命周期服务。
 *
 * create/delete 只处理 pages-config 文件；mount/unmount 只处理导航树；
 * createMounted/removeMounted 组合两者并在失败时按参数决定是否回滚。
 */
export class PageConfigFileLifecycle {
  private readonly fileApi: PageConfigFileApi
  private readonly navigationClient: NavigationConfigClient
  private readonly getConfigLoader: (() => Pick<BasePageConfigLoader, 'clearCache'>) | undefined

  constructor(options: PageConfigFileLifecycleOptions) {
    this.fileApi = options.fileApi
    this.navigationClient = options.navigationClient
    this.getConfigLoader = options.getConfigLoader
  }

  async createPage(params: PageConfigCreatePageParams): Promise<Record<string, unknown>> {
    const pageId = assertNonEmptyPageId(params.pageId)
    const result = await this.fileApi.createPage({
      pageId,
      ...(params.title === undefined ? {} : { title: params.title }),
      ...(params.icon === undefined ? {} : { icon: params.icon }),
    })
    this.clearPageCache(pageId)
    return result
  }

  async deletePage(pageId: string): Promise<void> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    await this.fileApi.deletePage(normalizedPageId)
    this.clearPageCache(normalizedPageId)
  }

  async mountPage(params: PageNavigationMountParams): Promise<NavNode> {
    assertNonEmptyPageId(params.pageId)
    return this.navigationClient.addNode({
      ...(params.parentId === undefined ? {} : { parentId: params.parentId }),
      node: defaultPageNavigationNode(params),
      ...(params.index === undefined ? {} : { index: params.index }),
    })
  }

  async createMountedPage(params: CreateMountedPageParams): Promise<CreateMountedPageResult> {
    const pageId = assertNonEmptyPageId(params.pageId)
    const page = await this.createPage(params)
    try {
      const node = await this.mountPage(params)
      return { page, node }
    } catch (error) {
      if (params.rollbackPageOnNavigationFailure === true) {
        await this.deletePage(pageId)
      }
      throw error
    }
  }

  async moveMountedPage(nodeId: string, newParentId: string | null, index: number): Promise<NavNode> {
    if (nodeId.trim().length === 0) {
      throw new Error('nodeId must be a non-empty string')
    }
    return this.navigationClient.moveNode(nodeId, newParentId, index)
  }

  async unmountPage(pageId: string, nodeId?: string): Promise<NavNode | null> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    const resolvedNodeId = await this.resolveNavigationNodeId(normalizedPageId, nodeId)
    return this.navigationClient.deleteNode(resolvedNodeId)
  }

  async removeMountedPage(params: RemoveMountedPageParams): Promise<RemoveMountedPageResult> {
    const pageId = assertNonEmptyPageId(params.pageId)
    const deletedNode = await this.unmountPage(pageId, params.nodeId)
    const shouldDeleteFiles = params.deleteFiles !== false
    if (shouldDeleteFiles) {
      await this.deletePage(pageId)
    }
    return { deletedNode, deletedFiles: shouldDeleteFiles }
  }

  clearPageCache(pageId: string, filename?: PageConfigFileName): void {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    const loader = this.getConfigLoader?.()
    if (loader === undefined) return
    if (filename !== undefined) {
      loader.clearCache(this.toPageConfigLoaderPath(normalizedPageId, filename))
      return
    }
    for (const name of PAGE_CONFIG_FILE_NAMES) {
      loader.clearCache(this.toPageConfigLoaderPath(normalizedPageId, name))
    }
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

  private toPageConfigLoaderPath(pageId: string, name: PageConfigFileName): string {
    return `/${encodeURIComponent(pageId)}/${encodeURIComponent(name)}`
  }
}
