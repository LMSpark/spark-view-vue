/**
 * ProjectWorkspace — 持有 ProjectModel 并提交 IO（设计即编辑）。
 * 领域状态、事件与投影属于 ProjectModel；谁 new 谁负责生命周期。
 */

import type { HttpClientBase } from '@spark-appworks/spark-utils'
import { PageFileApi } from '../io/page-file-api'
import { PageContentLoader, type PageContentLoaderOptions } from '../io/page-content-loader'
import type {
  ProjectModelData,
  ProjectNodeData,
} from '../navigation/project-node'
import { NavigationClient } from '../io/navigation-client'
import type { PageFileCreateOptions, PageNodeFileVersionSummary } from '../page/page-file'
import {
  assertNonEmptyPageId,
  PAGE_NODE_FILE_NAMES,
  pageFilePath,
  type PageNodeFileName,
} from '../page/page-file'
import type { ConfigPageNode, PageNodeLike } from '../page/config-page'
import { ProjectModel } from './project-model'
import {
  ProjectReferenceClient,
  type ProjectPageReference,
  type ProjectSummary,
} from '../io/project-reference-client'
import { trimTrailingSlash } from '../io/http'
import {
  findConfigNodeByPageId,
  isConfigNodeKind,
  normalizeProjectNodeData,
  resolvePageNodePageId,
} from '../navigation/navigation-tree'
import {
  applyNodeKindPresetToDraft,
  createNavigationNodeDraft,
  createNavigationNodePatch,
  defaultNavIconByKind,
  type NavigationNodeDraft,
  type NavigationNodePatch,
} from '../navigation/navigation-edit'

export type ProjectPageLoadOptions = {
  forceReload?: boolean
}

export type CreatePageForSelectedNodeParams = {
  pageId: string
  title?: string
  icon?: string
}

type CreateMountedPageParams = {
  pageId: string
  title?: string
  icon?: string
  node?: ProjectNodeData
  parentId?: string | null
  index?: number
  rollbackPageOnNavigationFailure?: boolean
}

type CreatePageFilesParams = PageFileCreateOptions & {
  pageId: string
}

export type PageNodeCreateMountedResult = {
  page: Record<string, unknown>
  node: ProjectNodeData
}

export type PageNodeRemoveMountedResult = {
  deletedNode: ProjectNodeData | null
  deletedFiles: boolean
}

type RemoveMountedPageParams = {
  pageId: string
  nodeId?: string
  deleteFiles?: boolean
}

export type ProjectWorkspaceOptions = {
  projectId: string
  http: HttpClientBase
  getPageFilesApi: () => string
  getNavigationApi: () => string
  getProjectsApi?: () => string
  getProjectNavigationApi?: (projectId: string) => string
  getHeaders?: () => Record<string, string>
  fileStorage?: NonNullable<PageContentLoaderOptions['fileStorage']>
}

function isProjectPageLoadOptions(value: unknown): value is ProjectPageLoadOptions {
  return value !== null && typeof value === 'object'
}

function toPageFilesApiBaseUrl(pageApi: string): string {
  const normalized = trimTrailingSlash(pageApi)
  const suffix = '/pages-config'
  if (normalized.endsWith(suffix)) {
    return normalized.slice(0, -suffix.length) || '/'
  }
  return normalized || '/'
}

/**
 * 项目 IO 编排层：将 ProjectModel 的操作委托到远端 API。
 */
export class ProjectWorkspace {
  readonly project: ProjectModel
  private readonly projectReferenceClient: ProjectReferenceClient | null
  private readonly navigationClient: NavigationClient
  private readonly fileApi: PageFileApi
  private readonly getContentLoader: () => PageContentLoader

  constructor(options: ProjectWorkspaceOptions) {
    const fileApi = new PageFileApi({
      getPageFilesApi: options.getPageFilesApi,
      http: options.http,
    })
    const navigationClient = new NavigationClient({
      getNavigationApi: options.getNavigationApi,
      http: options.http,
    })
    const projectReferenceClient = options.getProjectsApi && options.getProjectNavigationApi
      ? new ProjectReferenceClient({
          http: options.http,
          getProjectsApi: options.getProjectsApi,
          getProjectNavigationApi: options.getProjectNavigationApi,
        })
      : undefined
    let pageContentLoader: PageContentLoader | null = null
    let pageContentLoaderApiBaseUrl = ''
    const getContentLoader = (): PageContentLoader => {
      const apiBaseUrl = toPageFilesApiBaseUrl(options.getPageFilesApi())
      if (pageContentLoader === null || pageContentLoaderApiBaseUrl !== apiBaseUrl) {
        const loaderOptions: Partial<PageContentLoaderOptions> = {
          apiBaseUrl,
          httpClient: options.http,
          fileStorage: options.fileStorage ?? 'localStorage',
        }
        if (options.getHeaders !== undefined) {
          loaderOptions.getHeaders = options.getHeaders
        }
        pageContentLoader = new PageContentLoader(loaderOptions)
        pageContentLoaderApiBaseUrl = apiBaseUrl
      }
      return pageContentLoader
    }
    this.project = new ProjectModel({ projectId: options.projectId })
    this.navigationClient = navigationClient
    this.projectReferenceClient = projectReferenceClient ?? null
    this.fileApi = fileApi
    this.getContentLoader = getContentLoader
  }

  getActivePageRenderNode(): PageNodeLike | null {
    const page = this.project.getActivePage()
    return page === null ? null : this.createRenderPageNode(page)
  }

  async loadNavigation(): Promise<ProjectModelData> {
    return this.reloadNavigation()
  }

  ingestNavigationRoot(
    root: ProjectModelData,
    options?: { selectedNodeId?: string | null },
  ): ProjectModelData {
    return this.project.replaceNavigationRoot(root, {
      selectedNodeId: options?.selectedNodeId ?? null,
    })
  }

  async selectPage(pageId: string, options?: ProjectPageLoadOptions): Promise<void>
  async selectPage(options?: ProjectPageLoadOptions): Promise<void>
  async selectPage(
    pageIdOrOptions?: string | ProjectPageLoadOptions,
    maybeOptions?: ProjectPageLoadOptions,
  ): Promise<void> {
    const explicitPageId = typeof pageIdOrOptions === 'string'
      ? pageIdOrOptions.trim()
      : ''
    const options = typeof pageIdOrOptions === 'string'
      ? maybeOptions
      : (isProjectPageLoadOptions(pageIdOrOptions) ? pageIdOrOptions : undefined)
    const pageId = explicitPageId || this.resolveSelectedPageId()
    if (!pageId) {
      throw new Error('pageId 不能为空，无法加载页面')
    }

    const page = this.project.openPageDesign(pageId)
    this.project.setActivePage(pageId)
    const pageNodeOptions: { forceReload?: boolean } = {}
    if (options?.forceReload === true) pageNodeOptions.forceReload = true
    await this.loadPage(page, pageNodeOptions)
    this.project.markPageLoadedChanged(page.pageId, true)
  }

  async saveProjectLayout(options?: { skipReload?: boolean }): Promise<void> {
    const root = this.project.rootNode
    if (!root) throw new Error('导航 root 未加载')
    const { patch } = createNavigationNodePatch(createNavigationNodeDraft(root.toNodeData()))
    await this.navigationClient.updateNode(root.id, patch)
    if (options?.skipReload === true) {
      this.project.markNavigationClean('root')
      return
    }
    await this.reloadNavigation({ selectedNodeId: this.project.session.session.selectedNodeId })
  }

  async saveSelectedNavigationNode(options?: { skipReload?: boolean }): Promise<void> {
    let nodeId: string
    let patch: NavigationNodePatch & Pick<ProjectNodeData, 'title' | 'nodeKind'>

    const workingDto = this.project.navigationDraft
    if (workingDto !== null) {
      const result = createNavigationNodePatch(workingDto)
      nodeId = workingDto.node.id
      patch = result.patch
    } else {
      const node = this.requireSelectedNode('未选中导航节点，无法保存导航属性')
      const result = createNavigationNodePatch(createNavigationNodeDraft(node))
      nodeId = node.id
      patch = result.patch
    }

    await this.navigationClient.updateNode(nodeId, patch)
    this.project.session.setNavigationDraft(null)
    if (options?.skipReload === true) {
      this.project.markNavigationClean('node')
      return
    }
    await this.reloadNavigation({ selectedNodeId: nodeId })
  }

  async ensureActivePageFilesLoaded(options?: ProjectPageLoadOptions): Promise<void> {
    const page = this.requireActivePage('无活动页面，无法加载页面文件')
    const loadOptions: { forceReload?: boolean } = {}
    if (options?.forceReload === true) loadOptions.forceReload = true
    await this.loadPage(page, loadOptions)
    this.project.markPageLoadedChanged(page.pageId, true)
  }

  async loadPageFile(name: PageNodeFileName, options?: ProjectPageLoadOptions): Promise<void> {
    const page = this.requireActivePage('无活动页面，无法加载页面文件')
    await this.loadSinglePageFile(page, name, { forceReload: options?.forceReload === true })
    this.project.markPageFileChanged(page.pageId, name)
  }

  async savePageFile(name: PageNodeFileName): Promise<void> {
    const page = this.requireActivePage('无活动页面，无法保存页面文件')
    await this.savePageFileFromModel(page, name)
    this.project.markPageFileChanged(page.pageId, name)
  }

  async saveDirtyPageFiles(): Promise<void> {
    const page = this.project.getActivePage()
    if (!page) return
    const dirtyNames = page.getDirtyFileNames()
    await Promise.all(dirtyNames.map(name => this.savePageFileFromModel(page, name)))
    for (const name of dirtyNames) this.project.markPageFileChanged(page.pageId, name)
  }

  async saveAll(): Promise<void> {
    await this.saveDirtyPageFiles()
    await this.saveNavigationFromSession()
  }

  async addNavigationNode(params: { parentId?: string | null; node: ProjectNodeData; index?: number }): Promise<ProjectNodeData> {
    const node = await this.navigationClient.addNode(params)
    await this.reloadNavigation({ selectedNodeId: node.id })
    return node
  }

  async deleteNode(nodeId: string): Promise<ProjectNodeData | null> {
    const normalized = nodeId.trim()
    if (!normalized) {
      throw new Error('nodeId 不能为空')
    }
    const result = await this.navigationClient.deleteNode(normalized)
    const root = await this.navigationClient.loadRoot()
    this.project.replaceNavigationRoot(root)
    return result
  }

  async createPageForSelectedNode(params: CreatePageForSelectedNodeParams): Promise<PageNodeCreateMountedResult> {
    const pageId = params.pageId.trim()
    if (!pageId) {
      throw new Error('pageId 不能为空')
    }
    const selected = this.requireSelectedNode('未选中导航节点，无法创建并绑定页面')
    const pageNode = this.openPage(pageId)
    const page = await this.createPageFilesForModel(pageNode, {
      ...(params.title === undefined ? {} : { title: params.title }),
      ...(params.icon === undefined ? {} : { icon: params.icon }),
    })

    const previousEditDto = createNavigationNodeDraft(selected)
    try {
      const nextEditDto: NavigationNodeDraft = {
        ...previousEditDto,
        node: {
          ...applyNodeKindPresetToDraft(previousEditDto.node, 'page'),
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string should fall through to default
          title: params.title?.trim() || previousEditDto.node.title || pageId,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string should fall through to default
          icon: params.icon?.trim() || previousEditDto.node.icon,
          path: `/${pageId}`,
        },
      }
      this.project.applyNavigationNodeEdit(nextEditDto)
      const node = this.project.design.findNodeById(nextEditDto.node.id)
      if (!node) throw new Error(`项目节点未找到: ${nextEditDto.node.id}`)
      await this.saveSelectedNavigationNode()
      this.project.setActivePage(pageId)
      return { page, node: this.getSelectedNode() ?? node.toNodeData() }
    } catch (error) {
      this.project.applyNavigationNodeEdit(previousEditDto)
      const node = this.project.design.findNodeById(previousEditDto.node.id)
      if (!node) throw new Error(`项目节点未找到: ${previousEditDto.node.id}`)
      this.project.markNavigationClean('node')
      await this.deletePageFilesForModel(pageNode)
      throw error
    }
  }

  async createMountedPage(params: CreateMountedPageParams): Promise<PageNodeCreateMountedResult> {
    const { pageId, ...modelParams } = params
    const pageNode = this.openPage(pageId)
    const page = await this.createPageFilesForModel(pageNode, {
      ...(modelParams.title === undefined ? {} : { title: modelParams.title }),
      ...(modelParams.icon === undefined ? {} : { icon: modelParams.icon }),
    })
    try {
      const node = await this.mountPageNavigation({ pageId, ...modelParams })
      await this.reloadNavigation({ selectedNodeId: node.id })
      return { page, node }
    } catch (error) {
      if (modelParams.rollbackPageOnNavigationFailure === true) {
        await this.deletePageFilesForModel(pageNode)
      }
      throw error
    }
  }

  async createPageFiles(params: CreatePageFilesParams): Promise<Record<string, unknown>> {
    const { pageId, ...modelParams } = params
    const pageNode = this.openPage(pageId)
    const result = await this.createPageFilesForModel(pageNode, {
      ...(modelParams.title === undefined ? {} : { title: modelParams.title }),
      ...(modelParams.icon === undefined ? {} : { icon: modelParams.icon }),
    })
    this.project.markPageLoadedChanged(pageId, false)
    return result
  }

  async deletePageFiles(pageId: string): Promise<void> {
    const normalized = pageId.trim()
    const pageNode = this.project.openPageDesign(normalized)
    await this.deletePageFilesForModel(pageNode)
    if (this.project.getActivePage()?.pageId === normalized) {
      this.project.clearActivePage()
    }
    this.project.closePageDesign(normalized)
    this.project.markPageLoadedChanged(normalized, false)
  }

  async removeMountedPage(params: RemoveMountedPageParams): Promise<PageNodeRemoveMountedResult> {
    const deletedNode = await this.unmountPageNavigation(params.pageId, params.nodeId)
    const shouldDeleteFiles = params.deleteFiles !== false
    if (shouldDeleteFiles) {
      const pageNode = this.project.openPageDesign(params.pageId)
      await this.deletePageFilesForModel(pageNode)
    }
    if (this.project.getActivePage()?.pageId === params.pageId) {
      this.project.clearActivePage()
    }
    await this.reloadNavigation({ selectedNodeId: this.project.session.session.selectedNodeId })
    return { deletedNode, deletedFiles: shouldDeleteFiles }
  }

  async moveMountedPage(nodeId: string, newParentId: string | null, index: number): Promise<ProjectNodeData> {
    if (nodeId.trim().length === 0) {
      throw new Error('nodeId must be a non-empty string')
    }
    const result = await this.navigationClient.moveNode(nodeId, newParentId, index)
    await this.reloadNavigation({ selectedNodeId: nodeId })
    return result
  }

  async listRemotePageVersions(filename: PageNodeFileName): Promise<PageNodeFileVersionSummary[]> {
    const page = this.project.getActivePage()
    if (!page) return []
    return this.fileApi.listVersions(page.pageId, filename)
  }

  async restoreRemotePageVersion(version: number, filename: PageNodeFileName): Promise<void> {
    const page = this.requireActivePage('无活动页面，无法恢复版本')
    await this.fileApi.restoreVersion(page.pageId, filename, version)
    await this.loadSinglePageFile(page, filename, { forceReload: true })
    page.markFileSaved(filename)
    this.clearPageCache(page.pageId, filename)
    this.notifyPageFileChanged(page.pageId, filename)
  }

  async createRemotePageVersion(filename: PageNodeFileName): Promise<void> {
    const page = this.project.getActivePage()
    if (!page) return
    await this.fileApi.createVersion(page.pageId, filename)
  }

  async deleteRemotePageVersion(version: number, filename: PageNodeFileName): Promise<void> {
    const page = this.project.getActivePage()
    if (!page) return
    await this.fileApi.deleteVersion(page.pageId, filename, version)
  }

  notifyPageFileChanged(
    pageId: string,
    filename: PageNodeFileName | '__created' | '__deleted' | '__bulk',
  ): void {
    if (filename === '__created' || filename === '__deleted' || filename === '__bulk') {
      this.project.markPageLoadedChanged(pageId, false)
      return
    }
    this.project.markPageFileChanged(pageId, filename)
  }

  async probeLink(url: string): Promise<{ embeddable: boolean; reason: string }> {
    return this.navigationClient.probeLink(url)
  }

  async listReferenceProjects(): Promise<ProjectSummary[]> {
    return this.requireProjectReferenceClient().listProjects({
      excludeProjectId: this.project.projectId,
    })
  }

  async listReferenceProjectPages(projectId: string): Promise<ProjectPageReference[]> {
    return this.requireProjectReferenceClient().listProjectPages(projectId)
  }

  private async mountPageNavigation(params: CreateMountedPageParams): Promise<ProjectNodeData> {
    assertNonEmptyPageId(params.pageId)
    return this.navigationClient.addNode({
      ...(params.parentId === undefined ? {} : { parentId: params.parentId }),
      node: this.defaultMountedPageNavigationNode(params),
      ...(params.index === undefined ? {} : { index: params.index }),
    })
  }

  private async unmountPageNavigation(pageId: string, nodeId?: string): Promise<ProjectNodeData | null> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    const resolvedNodeId = await this.resolveNavigationNodeId(normalizedPageId, nodeId)
    return this.navigationClient.deleteNode(resolvedNodeId)
  }

  private defaultMountedPageNavigationNode(params: CreateMountedPageParams): ProjectNodeData {
    const pageId = assertNonEmptyPageId(params.pageId)
    const title = params.title?.trim()
    const icon = params.icon?.trim()
    const node = params.node ?? {
      id: pageId,
      title: title !== undefined && title.length > 0 ? title : pageId,
      icon: icon !== undefined && icon.length > 0 ? icon : defaultNavIconByKind('page'),
      nodeKind: 'page' as const,
      path: `/${pageId}`,
    }
    return normalizeProjectNodeData(node)
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

  private resolveSelectedPageId(): string {
    const node = this.requireSelectedNode('未选中导航节点，无法加载页面')
    const kind = node.nodeKind ?? 'page'
    if (!isConfigNodeKind(kind)) {
      throw new Error(`当前选中节点不是可配置页面，类型: ${kind}`)
    }
    const pageId = resolvePageNodePageId(node)
    if (!pageId) {
      throw new Error('无法从项目节点解析出 pageId')
    }
    return pageId
  }

  private async saveNavigationFromSession(): Promise<void> {
    const navDirty = this.project.session.navigationDirty
    if (!navDirty) return

    if (this.project.session.session.navigationDirtyScope === 'root') {
      await this.saveProjectLayout()
      return
    }
    await this.saveSelectedNavigationNode()
    this.project.markNavigationClean('node')
  }

  private async reloadNavigation(options?: { selectedNodeId?: string | null }): Promise<ProjectModelData> {
    const root = await this.navigationClient.loadRoot()
    return this.project.replaceNavigationRoot(root, {
      selectedNodeId: options?.selectedNodeId ?? null,
    })
  }

  private async loadPage(page: ConfigPageNode, options?: ProjectPageLoadOptions): Promise<void> {
    const forceReload = options?.forceReload === true
    if (page.isLoaded && !forceReload) return
    await Promise.all(
      PAGE_NODE_FILE_NAMES.map(name => this.loadSinglePageFile(page, name, { forceReload })),
    )
    page.markLoaded()
  }

  private async loadSinglePageFile(
    page: ConfigPageNode,
    name: PageNodeFileName,
    options?: ProjectPageLoadOptions,
  ): Promise<void> {
    const result = await this.getContentLoader().loadPageFileContent(page.pageId, name, {
      forceReload: options?.forceReload === true,
    })
    if (!result.success) {
      throw new Error(result.error ?? result.reason ?? `${name} 加载失败`)
    }
    page.hydrateFileText(name, result.data ?? '')
  }

  private async createPageFilesForModel(
    page: ConfigPageNode,
    options: PageFileCreateOptions = {},
  ): Promise<Record<string, unknown>> {
    const result = await this.fileApi.createFiles({
      pageId: page.pageId,
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.icon === undefined ? {} : { icon: options.icon }),
    })
    this.clearPageCache(page.pageId)
    return result
  }

  private async deletePageFilesForModel(page: ConfigPageNode): Promise<void> {
    await this.fileApi.deleteFiles(page.pageId)
    this.clearPageCache(page.pageId)
  }

  private async savePageFileFromModel(page: ConfigPageNode, name: PageNodeFileName): Promise<void> {
    await this.fileApi.saveFileContent(page.pageId, name, page.getFileText(name))
    page.markFileSaved(name)
    this.clearPageCache(page.pageId, name)
  }

  private clearPageCache(pageId: string, filename?: PageNodeFileName): void {
    const normalized = pageId.trim()
    if (!normalized) return
    const loader = this.getContentLoader()
    if (filename !== undefined) {
      loader.clearCache(pageFilePath(normalized, filename))
      return
    }
    loader.clearPageCache(normalized)
  }

  private createRenderPageNode(page: ConfigPageNode): PageNodeLike {
    return {
      get pageId() { return page.pageId },
      get isLoaded() { return page.isLoaded },
      load: async (options?: ProjectPageLoadOptions) => {
        await this.loadPage(page, options)
        this.project.markPageLoadedChanged(page.pageId, true)
      },
      toRenderConfig: () => page.toRenderConfig(),
    }
  }

  private getSelectedNode(): ProjectNodeData | null {
    const selectedNodeId = this.project.session.session.selectedNodeId
    if (!selectedNodeId) return null
    return this.project.design.findNodeById(selectedNodeId)?.toNodeData() ?? null
  }

  private requireSelectedNode(message: string): ProjectNodeData {
    const node = this.getSelectedNode()
    if (node) return node
    throw new Error(message)
  }

  private requireActivePage(message: string): ConfigPageNode {
    const page = this.project.getActivePage()
    if (page) return page
    throw new Error(message)
  }

  private openPage(pageId: string): ConfigPageNode {
    const normalized = pageId.trim()
    if (!normalized) throw new Error('pageId 不能为空')
    return this.project.openPageDesign(normalized)
  }

  private requireProjectReferenceClient(): ProjectReferenceClient {
    if (this.projectReferenceClient !== null) return this.projectReferenceClient
    throw new Error('ProjectReferenceClient 未配置，无法读取跨项目引用')
  }
}

