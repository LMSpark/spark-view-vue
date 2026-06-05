/**
 * ProjectEditor — 框架无关的项目设计门面（设计即编辑）。
 * 编排 model / io 协作者；会话态见 EditorSession。
 */

import type {
  BasePageContentLoader,
  PageContentLoaderOptions,
} from '../io/loader/types'
import { PageNodeFileApi } from '../io/file/api'
import { createPageContentLoader } from '../io/loader/loader'
import type {
  ProjectModelData,
  NavNodeKind,
  ProjectNodeData,
} from '../model/navigation/node'
import type {
  NavigationNodeEditApplyResultDto,
  NavigationNodeEditInputDto,
} from '../model/navigation/edit'
import { NavigationConfigClient } from '../io/navigation/client'
import type { ConfigPageNode } from '../model/page/config-page'
import { PageNodeFileCache } from '../io/file/cache'
import type { PageNodeFileVersionSummary } from '../model/page/file'
import {
  PageNavigationLifecycle,
} from '../io/navigation/lifecycle'
import {
  PAGE_NODE_FILE_NAMES,
  type PageNodeFileName,
} from '../model/page/file'
import { ProjectModel } from '../model/project/model'
import type { ProjectModelDto } from '../model/project/types'
import {
  ProjectReferenceClient,
  type ProjectPageReference,
  type ProjectSummary,
} from '../io/reference/client'
import { trimTrailingSlash } from '../io/http'
import {
  EditorSession,
  type ProjectEditorListener,
  type ProjectEditorSessionState,
} from './editor-session'
import { ProjectEditorContext } from './project-editor-context'
import { NavigationEditor } from './navigation-editor'
import { PageFileEditor } from './page-file-editor'
import { PageLifecycle } from './page-lifecycle'
import { EditorSnapshot } from './editor-snapshot'
import { ReferenceQuery } from './reference-query'
import {
  isConfigNodeKind,
  resolvePageNodePageId,
} from '../model/navigation/helpers'

export type {
  ProjectEditorListener,
  ProjectEditorNavigationDirtyScope,
  ProjectEditorSessionState,
} from './editor-session'

import type {
  CreateProjectEditorOptions,
  CreatePageForSelectedNodeParams,
  ProjectEditorLoadOptions,
  ProjectEditorSnapshot,
} from './project-editor-types'

export type {
  CreateProjectEditorOptions,
  CreatePageForSelectedNodeParams,
  ProjectEditorLoadOptions,
  ProjectEditorSnapshot,
} from './project-editor-types'

export type { PageNodeCreateMountedResult, PageNodeRemoveMountedResult } from './page-lifecycle'

type ProjectEditorOptions = {
  projectId: string
  fileApi: PageNodeFileApi
  navigationClient: NavigationConfigClient
  getContentLoader: () => BasePageContentLoader
  projectReferenceClient?: ProjectReferenceClient
}

function isProjectEditorLoadOptions(value: unknown): value is ProjectEditorLoadOptions {
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

export function createProjectEditor(options: CreateProjectEditorOptions): ProjectEditor {
  const fileApi = new PageNodeFileApi({
    getPageFilesApi: options.getPageFilesApi,
    http: options.http,
  })
  const navigationClient = new NavigationConfigClient({
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
  let pageContentLoader: BasePageContentLoader | null = null
  let pageContentLoaderApiBaseUrl = ''

  const getContentLoader = (): BasePageContentLoader => {
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
      pageContentLoader = createPageContentLoader(loaderOptions)
      pageContentLoaderApiBaseUrl = apiBaseUrl
    }
    return pageContentLoader
  }

  return new ProjectEditor({
    projectId: options.projectId,
    fileApi,
    navigationClient,
    getContentLoader,
    ...(projectReferenceClient === undefined ? {} : { projectReferenceClient }),
  })
}

export class ProjectEditor {
  readonly project: ProjectModel
  private readonly ctx: ProjectEditorContext
  private readonly sessionModel: EditorSession
  private readonly navigation: NavigationEditor
  private readonly pageFiles: PageFileEditor
  private readonly lifecycle: PageLifecycle
  private readonly snapshot: EditorSnapshot
  private readonly references: ReferenceQuery
  private readonly fileCache: PageNodeFileCache

  constructor(options: ProjectEditorOptions) {
    const contentLoaderFactory = options.getContentLoader
    this.fileCache = new PageNodeFileCache({
      contentLoaderFactory,
    })
    const navigationLifecycle = new PageNavigationLifecycle({
      navigationClient: options.navigationClient,
    })
    this.project = new ProjectModel({
      projectId: options.projectId,
      fileApi: options.fileApi,
      fileCache: this.fileCache,
      contentLoaderFactory,
    })
    this.sessionModel = new EditorSession({
      findNodeById: (nodeId) => this.project.design.findNodeById(nodeId),
      findConfigPageByPageId: (pageId) => this.project.design.findConfigPageByPageId(pageId),
    })
    this.ctx = new ProjectEditorContext(this.project, this.sessionModel)
    this.navigation = new NavigationEditor(this.ctx, options.navigationClient)
    this.pageFiles = new PageFileEditor(this.ctx, this.fileCache, () => this.getActivePage())
    this.lifecycle = new PageLifecycle(
      this.ctx,
      navigationLifecycle,
      this.navigation,
      () => this.getActivePage(),
      () => this.clearActivePage(),
    )
    this.snapshot = new EditorSnapshot(this.ctx)
    this.references = new ReferenceQuery(
      options.navigationClient,
      options.projectReferenceClient ?? null,
      options.projectId,
    )
  }

  get revision(): number {
    return this.sessionModel.revision
  }

  get session(): Readonly<ProjectEditorSessionState> {
    return this.sessionModel.session
  }

  subscribe(listener: ProjectEditorListener): () => void {
    return this.sessionModel.subscribe(listener)
  }

  getPageFileNames(): readonly PageNodeFileName[] {
    return PAGE_NODE_FILE_NAMES
  }

  getActivePage(): ConfigPageNode | null {
    return this.ctx.getActivePage()
  }

  requireActivePage(): ConfigPageNode {
    const activePageId = this.sessionModel.session.activePageId
    if (!activePageId) {
      throw new Error('无活动页面，无法获取配置页面节点')
    }
    const page = this.ctx.design.findConfigPageByPageId(activePageId)
    if (page === null) {
      throw new Error(`配置页面节点 ${activePageId} 不存在或尚未打开`)
    }
    if (!page.isLoaded) {
      throw new Error(`配置页面节点 ${page.pageId} 尚未加载完成`)
    }
    return page
  }

  openPage(pageId: string): ConfigPageNode {
    return this.ctx.openPage(pageId)
  }

  closePage(pageId: string): void {
    this.ctx.closePage(pageId)
  }

  refreshNavRefs(): void {
    this.ctx.refreshNavRefs()
  }

  async loadNavigation(): Promise<ProjectModelData> {
    return this.navigation.loadNavigation()
  }

  ingestNavigationRoot(
    root: ProjectModelData,
    options?: { selectedNodeId?: string | null },
  ): ProjectModelData {
    return this.navigation.ingestNavigationRoot(root, options)
  }

  selectNode(nodeId: string | null): void {
    this.navigation.selectNode(nodeId)
  }

  async selectPage(pageId: string, options?: ProjectEditorLoadOptions): Promise<void>
  async selectPage(options?: ProjectEditorLoadOptions): Promise<void>
  async selectPage(
    pageIdOrOptions?: string | ProjectEditorLoadOptions,
    maybeOptions?: ProjectEditorLoadOptions,
  ): Promise<void> {
    const explicitPageId = typeof pageIdOrOptions === 'string'
      ? pageIdOrOptions.trim()
      : ''
    const options = typeof pageIdOrOptions === 'string'
      ? maybeOptions
      : (isProjectEditorLoadOptions(pageIdOrOptions) ? pageIdOrOptions : undefined)
    const pageId = explicitPageId || this.resolveSelectedPageId()
    if (!pageId) {
      throw new Error('pageId 不能为空，无法加载页面')
    }

    const page = this.openPage(pageId)
    this.sessionModel.setActivePageId(pageId)
    const mountedNode = this.ctx.design.findConfigPageByPageId(pageId)?.toNodeData() ?? null
    if (mountedNode) {
      this.sessionModel.setSelectedNodeId(mountedNode.id)
    }
    const pageNodeOptions: { forceReload?: boolean } = {}
    if (options?.forceReload === true) pageNodeOptions.forceReload = true
    await page.load(pageNodeOptions)
    this.sessionModel.bump()
  }

  clearActivePage(): void {
    const activePageId = this.sessionModel.session.activePageId
    this.sessionModel.setActivePageId(null)
    if (activePageId) {
      this.ctx.closePage(activePageId)
    }
    this.sessionModel.bump()
  }

  setActivePage(pageId: string, options?: { forceReset?: boolean }): void {
    const normalizedPageId = pageId.trim()
    if (!normalizedPageId) {
      this.clearActivePage()
      return
    }
    if (options?.forceReset === true && this.getActivePage()?.pageId === normalizedPageId) {
      this.closePage(normalizedPageId)
    }
    this.openPage(normalizedPageId)
    this.sessionModel.setActivePageId(normalizedPageId)
    const mountedNode = this.ctx.design.findConfigPageByPageId(normalizedPageId)?.toNodeData() ?? null
    if (mountedNode) {
      this.sessionModel.setSelectedNodeId(mountedNode.id)
    }
    this.sessionModel.bump()
  }

  readSnapshot(): ProjectEditorSnapshot {
    return this.snapshot.readSnapshot(() => this.getActivePage())
  }

  readProjectModelDto(): ProjectModelDto {
    return this.snapshot.readProjectModelDto()
  }

  applyNavigationEditDto(input: NavigationNodeEditInputDto): NavigationNodeEditApplyResultDto {
    return this.navigation.applyNavigationEditDto(input)
  }

  applyNodeKindPreset(kind: NavNodeKind): void {
    this.navigation.applyNodeKindPreset(kind)
  }

  get navigationEditDto(): NavigationNodeEditInputDto | null {
    return this.navigation.navigationEditDto
  }

  get isNavigationEditing(): boolean {
    return this.navigation.isNavigationEditing
  }

  beginNavigationEdit(): NavigationNodeEditInputDto {
    return this.navigation.beginNavigationEdit()
  }

  discardNavigationEdit(): void {
    this.navigation.discardNavigationEdit()
  }

  async saveSelectedNavigationNode(options?: { skipReload?: boolean }): Promise<void> {
    return this.navigation.saveSelectedNavigationNode(options)
  }

  async ensureActivePageFilesLoaded(options?: ProjectEditorLoadOptions): Promise<void> {
    return this.pageFiles.ensureActivePageFilesLoaded(options)
  }

  async loadPageFile(name: PageNodeFileName, options?: ProjectEditorLoadOptions): Promise<void> {
    return this.pageFiles.loadPageFile(name, options)
  }

  async savePageFile(name: PageNodeFileName): Promise<void> {
    return this.pageFiles.savePageFile(name)
  }

  async saveDirtyPageFiles(): Promise<void> {
    return this.pageFiles.saveDirtyPageFiles()
  }

  async saveAll(): Promise<void> {
    await this.pageFiles.saveDirtyPageFiles()
    await this.navigation.saveNavigationFromSession()
  }

  getPageFileText(name: PageNodeFileName): string {
    return this.pageFiles.getPageFileText(name)
  }

  setPageFileText(name: PageNodeFileName, text: string): void {
    this.pageFiles.setPageFileText(name, text)
  }

  canUndoPageFile(name: PageNodeFileName): boolean {
    return this.pageFiles.canUndoPageFile(name)
  }

  canRedoPageFile(name: PageNodeFileName): boolean {
    return this.pageFiles.canRedoPageFile(name)
  }

  undoPageFile(name: PageNodeFileName): boolean {
    return this.pageFiles.undoPageFile(name)
  }

  redoPageFile(name: PageNodeFileName): boolean {
    return this.pageFiles.redoPageFile(name)
  }

  isActivePageLoaded(): boolean {
    return this.pageFiles.isActivePageLoaded()
  }

  getDataSetTool(): ReturnType<PageFileEditor['getDataSetTool']> {
    return this.pageFiles.getDataSetTool()
  }

  editDataSet(
    run: Parameters<PageFileEditor['editDataSet']>[0],
  ): Promise<void> {
    return this.pageFiles.editDataSet(run)
  }

  getNodeTree(): ReturnType<PageFileEditor['getNodeTree']> {
    return this.pageFiles.getNodeTree()
  }

  editNodeTree(
    run: Parameters<PageFileEditor['editNodeTree']>[0],
  ): Promise<void> {
    return this.pageFiles.editNodeTree(run)
  }

  addRootNode(createId: () => string): ProjectNodeData {
    return this.navigation.addRootNode(createId)
  }

  async addNavigationNode(params: { parentId?: string | null; node: ProjectNodeData; index?: number }): Promise<ProjectNodeData> {
    return this.navigation.addNavigationNode(params)
  }

  addChildPageNode(createId: () => string): ProjectNodeData {
    return this.navigation.addChildPageNode(createId)
  }

  removeNode(nodeId: string): ProjectNodeData | null {
    return this.navigation.removeNode(nodeId)
  }

  async deleteNode(nodeId: string): Promise<ProjectNodeData | null> {
    return this.navigation.deleteNode(nodeId)
  }

  restoreReservedRootGroup(placement: 'toolbar' | 'user-menu', createId: () => string): ProjectNodeData {
    return this.navigation.restoreReservedRootGroup(placement, createId)
  }

  async createPageForSelectedNode(params: CreatePageForSelectedNodeParams) {
    return this.lifecycle.createPageForSelectedNode(params)
  }

  async createMountedPage(params: Parameters<PageLifecycle['createMountedPage']>[0]) {
    return this.lifecycle.createMountedPage(params)
  }

  async createPageFiles(params: Parameters<PageLifecycle['createPageFiles']>[0]) {
    return this.lifecycle.createPageFiles(params)
  }

  async deletePageFiles(pageId: string): Promise<void> {
    return this.lifecycle.deletePageFiles(pageId)
  }

  async removeMountedPage(params: Parameters<PageLifecycle['removeMountedPage']>[0]) {
    return this.lifecycle.removeMountedPage(params)
  }

  async moveMountedPage(nodeId: string, newParentId: string | null, index: number): Promise<ProjectNodeData> {
    return this.lifecycle.moveMountedPage(nodeId, newParentId, index)
  }

  async listRemotePageVersions(filename: PageNodeFileName): Promise<PageNodeFileVersionSummary[]> {
    return this.pageFiles.listRemotePageVersions(filename)
  }

  async restoreRemotePageVersion(version: number, filename: PageNodeFileName): Promise<void> {
    return this.pageFiles.restoreRemotePageVersion(version, filename)
  }

  async createRemotePageVersion(filename: PageNodeFileName): Promise<void> {
    return this.pageFiles.createRemotePageVersion(filename)
  }

  async deleteRemotePageVersion(version: number, filename: PageNodeFileName): Promise<void> {
    return this.pageFiles.deleteRemotePageVersion(version, filename)
  }

  notifyPageFileChanged(
    pageId: string,
    filename: PageNodeFileName | '__created' | '__deleted' | '__bulk',
  ): void {
    this.pageFiles.notifyPageFileChanged(pageId, filename)
  }

  async probeLink(url: string): Promise<{ embeddable: boolean; reason: string }> {
    return this.references.probeLink(url)
  }

  async listReferenceProjects(): Promise<ProjectSummary[]> {
    return this.references.listReferenceProjects()
  }

  async listReferenceProjectPages(projectId: string): Promise<ProjectPageReference[]> {
    return this.references.listReferenceProjectPages(projectId)
  }

  private resolveSelectedPageId(): string {
    const node = this.ctx.requireSelectedNode('未选中导航节点，无法加载页面')
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
}
