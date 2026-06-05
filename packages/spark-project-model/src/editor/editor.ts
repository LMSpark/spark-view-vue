/**
 * ProjectEditor — 框架无关的项目编辑聚合入口。
 *
 * 一个项目由平铺节点集合组成。ProjectEditor 组合 ProjectModel、
 * NavigationConfigClient，把项目节点、配置页节点导航属性、
 * rule.json、pagedata.json、style.css、script.js、
 * 版本管理、保存、页面挂载/删除/移动聚合成统一编辑上下文。
 *
 * 不引入 Vue，不新造数据集或节点树工具；AI 编辑只通过配置页节点 live host 进入。
 *
 * ┌──────────────────────────────────────────────────────┐
 * │  类型分组                                            │
 * │                                                      │
 * │  1. Options / Snapshot / Listener 类型                 │
 * │  2. ProjectEditor class                               │
 * │     - 构造 & 变更通知                                  │
 * │     - 导航加载 & 选择                                  │
 * │     - 快照读取                                        │
 * │     - 节点属性编辑 & 保存                               │
 * │     - 四文件加载 / 编辑 / 保存                          │
 * │     - 生命周期（导航树节点 + 页面挂载）                  │
 * │     - 版本管理                                        │
 * │     - 辅助                                            │
 * └──────────────────────────────────────────────────────┘
 */

import type { HttpClientBase } from '@spark-appworks/spark-utils'

import type {
  BasePageContentLoader,
  PageContentLoaderOptions,
} from '../infra/loader/types'
import { PageNodeFileApi } from '../infra/file/api'
import { createPageContentLoader } from '../infra/loader/loader'
import type {
  ProjectModelData,
  NavNodeKind,
  ProjectNodeData,
  ProjectNodeLocation,
  ProjectPageNodeSummary,
} from '../navigation/node'
import type {
  NavigationNodeEditApplyResultDto,
  NavigationNodeEditInputDto,
  NavigationNodeEditPatchDto,
} from '../navigation/edit'
import {
  applyNavigationNodeEditDtoToNode,
  applyNodeKindPresetToEditDto,
  createNavigationNodeEditDto,
  createNavigationNodePatch,
} from '../navigation/edit'
import {
  createReservedRootGroup,
  isConfigNodeKind,
  resolvePageNodePageId,
} from '../navigation/helpers'
import { NavigationConfigClient } from '../infra/navigation/client'

// ── 内部域模型导入（page-model / project） ──

import type { ConfigPageNode } from '../page/config-page'
import { PageNodeFileCache } from '../infra/file/cache'
import type { PageFileCreateOptions, PageNodeFileVersionSummary } from '../page/file'
import {
  PageNavigationLifecycle,
  type PageNavigationMountParams,
} from '../infra/navigation/lifecycle'
import {
  PAGE_NODE_FILE_NAMES,
  type PageNodeFileName,
} from '../page/file'
import type { PageNodeFileStorage } from '../page/factory'
import { ProjectModel } from '../project/model'
import type { ProjectModelDto } from '../project/model'
import {
  ProjectReferenceClient,
  type ProjectPageReference,
  type ProjectSummary,
} from '../infra/reference/client'
import { trimTrailingSlash } from '../infra/util'

// ═══════════════════════════════════════════════════════
// 1. 选项 / 快照 / 监听器 类型（Options / Snapshot / Listener）
// ═══════════════════════════════════════════════════════

/** ProjectEditor 构造参数 */
type ProjectEditorOptions = {
  projectId: string
  fileApi: PageNodeFileApi
  navigationClient: NavigationConfigClient
  getContentLoader: () => BasePageContentLoader
  projectReferenceClient?: ProjectReferenceClient
}

export type CreateProjectEditorOptions = {
  projectId: string
  http: HttpClientBase
  getPageFilesApi: () => string
  getNavigationApi: () => string
  getProjectsApi?: () => string
  getProjectNavigationApi?: (projectId: string) => string
  getHeaders?: () => Record<string, string>
  fileStorage?: PageNodeFileStorage
}

/** loadPageFile / ensureActivePageFilesLoaded / selectPage 共用加载参数 */
export type ProjectEditorLoadOptions = {
  forceReload?: boolean
}

/** createPageForSelectedNode 参数 */
export type CreatePageForSelectedNodeParams = {
  pageId: string
  title?: string
  icon?: string
}

type CreateMountedPageParams = Omit<PageNavigationMountParams, 'pageId'> & {
  pageId: string
  rollbackPageOnNavigationFailure?: boolean
}

type ProjectEditorCreatePageParams = PageFileCreateOptions & {
  pageId: string
}

type PageNodeCreateMountedResult = {
  page: Record<string, unknown>
  node: ProjectNodeData
}

type RemoveMountedPageParams = {
  pageId: string
  nodeId?: string
  deleteFiles?: boolean
}

type PageNodeRemoveMountedResult = {
  deletedNode: ProjectNodeData | null
  deletedFiles: boolean
}

/** 变更监听器：project editor 状态变更时触发（文档变化、选择变化、模块树 dirty 等） */
export type ProjectEditorListener = () => void

/**
 * ProjectEditor 即时快照。
 * 包含当前项目节点、活动配置页内容子模型、节点脏状态和加载状态。
 */
export type ProjectEditorSnapshot = {
  pageId: string
  navigationRoot: ProjectModelData
  treeData: ProjectNodeData[]
  selectedNode: ProjectNodeData | null
  selectedNodeId: string | null
  navigationLocation: ProjectNodeLocation | null
  navigationEditDto: NavigationNodeEditInputDto | null
  pageFeatures: ProjectPageNodeSummary[]
  ruleJson: string
  pageDataJson: string
  script: string
  style: string
  dirtyFiles: Set<PageNodeFileName>
  parseErrors: Record<PageNodeFileName, string | null>
  isLoaded: boolean
  hasAnyFileDirty: boolean
  navigationDirty: boolean
  hasAnyDirty: boolean
}

// ═══════════════════════════════════════════════════════
// 2. ProjectEditor class — 项目编辑聚合根
// ═══════════════════════════════════════════════════════

type NavigationDirtyScope = 'node' | 'root'

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

/**
 * 框架无关的项目编辑聚合入口。
 *
 * 组合 ProjectModel / NavigationConfigClient，
 * 为项目级 DevSystem 提供统一的中后端能力。
 */
export class ProjectEditor {
  readonly project: ProjectModel
  private readonly navClient: NavigationConfigClient
  private readonly contentLoaderFactory: () => BasePageContentLoader
  private readonly fileCache: PageNodeFileCache
  private readonly navigationLifecycle: PageNavigationLifecycle
  private readonly projectReferenceClient: ProjectReferenceClient | null
  private workingEditDto: NavigationNodeEditInputDto | null = null

  private revisionCounter = 0
  private readonly listeners = new Set<ProjectEditorListener>()

  constructor(options: ProjectEditorOptions) {
    this.navClient = options.navigationClient
    this.contentLoaderFactory = options.getContentLoader
    this.fileCache = new PageNodeFileCache({
      contentLoaderFactory: this.contentLoaderFactory,
    })
    this.navigationLifecycle = new PageNavigationLifecycle({
      navigationClient: this.navClient,
    })
    this.projectReferenceClient = options.projectReferenceClient ?? null
    this.project = new ProjectModel({
      projectId: options.projectId,
      fileApi: options.fileApi,
      fileCache: this.fileCache,
      contentLoaderFactory: this.contentLoaderFactory,
    })
  }

  // ── 变更通知 ─────────────────────────────────────────

  /** 单调递增的编辑上下文版本号，每次文档/选择/导航变更时 +1。 */
  get revision(): number {
    return this.revisionCounter
  }

  /** 订阅编辑器变更。返回取消订阅函数。 */
  subscribe(listener: ProjectEditorListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** 页面文件名唯一从配置页模型暴露，消费层不再自定义四文件清单。 */
  getPageFileNames(): readonly PageNodeFileName[] {
    return PAGE_NODE_FILE_NAMES
  }

  // ── 配置页节点管理 ────────────────────────────────────

  /** 获取当前活动配置页节点（不存在时返回 null）。 */
  getActivePage(): ConfigPageNode | null {
    const activePageId = this.project.editor.activePageId
    if (!activePageId) return null
    return this.project.findConfigPageByPageId(activePageId)
  }

  /** 获取当前已加载配置页面节点。 */
  requireActivePage(): ConfigPageNode {
    const activePageId = this.project.editor.activePageId
    if (!activePageId) {
      throw new Error('无活动页面，无法获取配置页面节点')
    }
    const page = this.project.findConfigPageByPageId(activePageId)
    if (page === null) {
      throw new Error(`配置页面节点 ${activePageId} 不存在或尚未打开`)
    }
    if (!page.isLoaded) {
      throw new Error(`配置页面节点 ${page.pageId} 尚未加载完成`)
    }
    return page
  }

  /**
   * 打开或获取已缓存的配置页节点。
   */
  openPage(pageId: string): ConfigPageNode {
    const normalized = pageId.trim()
    if (!normalized) {
      throw new Error('pageId 不能为空')
    }
    const page = this.project.openConfigPage(normalized)
    return page
  }

  /** 关闭未挂载的配置页节点。 */
  closePage(pageId: string): void {
    this.project.closeConfigPage(pageId)
  }

  /**
   * 导航 reload 后重新绑定所有配置页节点的 navNode 引用。
   * 页面已从树中移除时 navNode 置为 null。
   */
  refreshNavRefs(): void {
    this.project.refreshNavRefs()
  }

  // ── 导航加载 & 选择 ──────────────────────────────────

  /** 加载远端项目节点 root 到内存 ProjectModel 中。 */
  async loadNavigation(): Promise<ProjectModelData> {
    return this.reloadNavigation()
  }

  /**
   * 在导航树中选中节点。
   * 传入 null 或空字符串清除选中。
   */
  selectNode(nodeId: string | null): void {
    this.project.setSelectedNodeId(nodeId)
    this.bumpRevision()
  }

  /**
   * 加载页面四文件。
   * 可传 pageId 直接加载未挂载页面；不传时从当前选中导航节点解析。
   */
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
    this.project.setActivePageId(pageId)
    const mountedNode = this.project.findConfigPageByPageId(pageId)?.toNodeData() ?? null
    if (mountedNode) {
      this.project.setSelectedNodeId(mountedNode.id)
    }
    const pageNodeOptions: { forceReload?: boolean } = {}
    if (options?.forceReload === true) pageNodeOptions.forceReload = true
    await page.load(pageNodeOptions)
    this.bumpRevision()
  }

  /** 清除当前活动页面。 */
  clearActivePage(): void {
    this.project.clearActivePage()
    this.bumpRevision()
  }

  /** 只切换活动 pageId，不触发远端加载。 */
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
    this.project.setActivePageId(normalizedPageId)
    const mountedNode = this.project.findConfigPageByPageId(normalizedPageId)?.toNodeData() ?? null
    if (mountedNode) {
      this.project.setSelectedNodeId(mountedNode.id)
    }
    this.bumpRevision()
  }

  // ── 快照读取 ─────────────────────────────────────────

  /** 返回当前编辑上下文的即时快照。全部从 active ConfigPageNode 读取。 */
  readSnapshot(): ProjectEditorSnapshot {
    const pageId = this.getActivePage()?.pageId ?? ''
    const navigationRoot = this.project.navigationRoot
    const treeData = navigationRoot.children
    const selectedNodeId = this.project.editor.selectedNodeId
    const selectedNode = selectedNodeId
      ? this.project.findNodeById(selectedNodeId)?.toNodeData() ?? null
      : null

    const navLocation = selectedNode
      ? this.project.findNodeLocation(selectedNode.id)
      : null

    const navEditDto = selectedNode
      ? createNavigationNodeEditDto(selectedNode)
      : null

    const activePage = this.getActivePage()
    const pageFeatures = this.project.readPageSummaries()

    const dirtyFiles = new Set<PageNodeFileName>()
    const parseErrors: Record<PageNodeFileName, string | null> = {
      'rule.json': null,
      'pagedata.json': null,
      'script.js': null,
      'style.css': null,
    }

    if (activePage) {
      for (const name of activePage.getDirtyFileNames()) dirtyFiles.add(name)
    }

    const hasAnyFileDirty = dirtyFiles.size > 0
    const navDirty = this.project.editor.navigationDirty || this.workingEditDto !== null

    return {
      pageId,
      navigationRoot,
      treeData,
      selectedNode,
      selectedNodeId,
      navigationLocation: navLocation,
      navigationEditDto: navEditDto,
      pageFeatures,
      ruleJson: activePage?.getFileText('rule.json') ?? '',
      pageDataJson: activePage?.getFileText('pagedata.json') ?? '',
      script: activePage?.getFileText('script.js') ?? '',
      style: activePage?.getFileText('style.css') ?? '',
      dirtyFiles,
      parseErrors,
      isLoaded: activePage?.isLoaded === true,
      hasAnyFileDirty,
      navigationDirty: navDirty,
      hasAnyDirty: hasAnyFileDirty || navDirty,
    }
  }

  /** 返回前后端同构的项目模型 DTO。仓储层再把 DTO 映射到 DB + file。 */
  readProjectModelDto(): ProjectModelDto {
    return {
      projectId: this.project.projectId,
      project: this.project.projectInfo,
      navigation: this.project.navigationRoot,
      pages: this.project.readPageSummaries(),
    }
  }

  // ── 节点属性编辑 ─────────────────────────────────────

  /**
   * 应用导航节点编辑 DTO 到当前选中节点。
   * 只改内存节点并标记 navigation dirty，不提交远端。
   */
  applyNavigationEditDto(input: NavigationNodeEditInputDto): NavigationNodeEditApplyResultDto {
    const node = this.requireSelectedNode('未选中导航节点，无法编辑导航属性')
    const result = applyNavigationNodeEditDtoToNode(node, input)
    this.project.setSelectedNodeId(node.id)
    this.workingEditDto = createNavigationNodeEditDto(node)
    this.markNavigationDirty('node')
    this.bumpRevision()
    return result
  }

  /** 对当前选中节点应用节点类型预设（切换类型时重置关联字段）。 */
  applyNodeKindPreset(kind: NavNodeKind): void {
    const node = this.requireSelectedNode('未选中导航节点，无法修改节点类型')
    const nodeDto = createNavigationNodeEditDto(node)
    const updatedNode = applyNodeKindPresetToEditDto(nodeDto.node, kind)
    const mergedInput: NavigationNodeEditInputDto = {
      ...nodeDto,
      node: updatedNode,
    }
    applyNavigationNodeEditDtoToNode(node, mergedInput)
    this.workingEditDto = createNavigationNodeEditDto(node)
    this.project.setSelectedNodeId(node.id)
    this.markNavigationDirty('node')
    this.bumpRevision()
  }

  /** 读取当前选中节点的导航编辑 DTO（工作副本）。 */
  get navigationEditDto(): NavigationNodeEditInputDto | null { return this.workingEditDto }

  /** 当前是否有未保存的导航编辑。 */
  get isNavigationEditing(): boolean { return this.workingEditDto !== null }

  /** 开始导航编辑会话：为当前选中节点创建工作副本 DTO。 */
  beginNavigationEdit(): NavigationNodeEditInputDto {
    const node = this.requireSelectedNode('未选中导航节点，无法开始导航编辑')
    this.workingEditDto = createNavigationNodeEditDto(node)
    this.bumpRevision()
    return this.workingEditDto
  }

  /** 放弃当前导航编辑会话。 */
  discardNavigationEdit(): void {
    this.workingEditDto = null
    this.markNavigationClean()
    this.bumpRevision()
  }

  // ── 导航保存 ─────────────────────────────────────────

  /**
   * 将当前选中导航节点的修改持久化到远端。
   * 优先使用 workingEditDto 生成 patch；回退到从选中树节点重新创建 DTO。
   */
  async saveSelectedNavigationNode(): Promise<void> {
    let nodeId: string
    let patch: NavigationNodeEditPatchDto & Pick<ProjectNodeData, 'title' | 'nodeKind'>

    if (this.workingEditDto !== null) {
      const result = createNavigationNodePatch(this.workingEditDto)
      nodeId = this.workingEditDto.node.id
      patch = result.patch
    } else {
      const node = this.requireSelectedNode('未选中导航节点，无法保存导航属性')
      const nodeDto = createNavigationNodeEditDto(node)
      const result = createNavigationNodePatch(nodeDto)
      nodeId = node.id
      patch = result.patch
    }

    await this.navClient.updateNode(nodeId, patch)
    this.workingEditDto = null
    await this.reloadNavigation({ selectedNodeId: nodeId })
  }

  // ── 四文件加载 ───────────────────────────────────────

  /** 确保当前活动页面的四文件已加载。 */
  async ensureActivePageFilesLoaded(options?: ProjectEditorLoadOptions): Promise<void> {
    const page = this.getActivePage()
    if (!page) {
      throw new Error('无活动页面，无法加载页面文件')
    }
    const loadOptions: { forceReload?: boolean } = {}
    if (options?.forceReload === true) loadOptions.forceReload = true
    await page.load(loadOptions)
  }

  /** 加载单个页面文件到 active ConfigPageNode。 */
  async loadPageFile(name: PageNodeFileName, options?: ProjectEditorLoadOptions): Promise<void> {
    const page = this.getActivePage()
    if (!page) {
      throw new Error('无活动页面，无法加载页面文件')
    }
    const loadOpts = { forceReload: options?.forceReload === true }
    await page.loadFile(name, loadOpts)
  }

  // ── 四文件保存 ───────────────────────────────────────

  /** 保存单个页面文件。委托 active ConfigPageNode 子模型。 */
  async savePageFile(name: PageNodeFileName): Promise<void> {
    const page = this.getActivePage()
    if (!page) {
      throw new Error('无活动页面，无法保存页面文件')
    }
    await page.saveFile(name)
  }

  /** 保存所有 dirty 的页面文件。不包含导航。 */
  async saveDirtyPageFiles(): Promise<void> {
    const page = this.getActivePage()
    if (!page) return
    await page.saveDirtyFiles()
  }

  /** 保存所有变更：dirty 文件 + 当前导航节点。前端编辑不做整树提交。 */
  async saveAll(): Promise<void> {
    await this.saveDirtyPageFiles()
    const navDirty = this.project.editor.navigationDirty || this.workingEditDto !== null
    if (!navDirty) return

    if (this.project.editor.navigationDirtyScope === 'root') {
      throw new Error('前端导航编辑必须按节点提交，不能整树保存')
    } else {
      await this.saveSelectedNavigationNode()
    }

    this.workingEditDto = null
    this.markNavigationClean()
  }

  /** 读取页面文件只读文本投影。 */
  getPageFileText(name: PageNodeFileName): string {
    const page = this.getActivePage()
    if (!page) return ''
    return page.getFileText(name)
  }

  // ── 生命周期：导航树节点 ──────────────────────────────

  /** 在导航根添加模块节点。 */
  addRootNode(createId: () => string): ProjectNodeData {
    const node = this.project.addRootModule(createId)
    this.markNavigationDirty('root')
    this.bumpRevision()
    return node
  }

  /** 通过节点级接口新增导航节点。 */
  async addNavigationNode(params: { parentId?: string | null; node: ProjectNodeData; index?: number }): Promise<ProjectNodeData> {
    const node = await this.navClient.addNode(params)
    await this.reloadNavigation({ selectedNodeId: node.id })
    return node
  }

  /** 在当前选中节点下添加子页面节点。无选中节点时添加到根下。 */
  addChildPageNode(createId: () => string): ProjectNodeData {
    const selected = this.getSelectedNode()
    const node = this.project.addChildPage(createId, selected)
    this.markNavigationDirty('root')
    this.bumpRevision()
    return node
  }

  /** 从项目节点集合中移除节点并返回被删节点。如移除的是当前选中节点则清除选中。 */
  removeNode(nodeId: string): ProjectNodeData | null {
    const normalized = nodeId.trim()
    const removed = this.project.removeNode(normalized)
    this.markNavigationDirty('root')
    this.bumpRevision()
    return removed
  }

  /** 直接从远端删除非配置节点（不删页面文件）。配置页面请用 removeMountedPage。 */
  async deleteNode(nodeId: string): Promise<ProjectNodeData | null> {
    const normalized = nodeId.trim()
    if (!normalized) {
      throw new Error('nodeId 不能为空')
    }
    const result = await this.navClient.deleteNode(normalized)
    // 同步远端状态到内存
    const root = await this.navClient.loadRoot()
    this.project.replaceRoot(root)
    this.bumpRevision()
    return result
  }

  /** 恢复或创建保留区域根分组（toolbar / user-menu）。 */
  restoreReservedRootGroup(placement: 'toolbar' | 'user-menu', createId: () => string): ProjectNodeData {
    const node = createReservedRootGroup(placement, {
      createId,
      templateRoot: this.project.navigationRoot,
    })
    const children = this.project.toTree()
    const existingIndex = children.findIndex(
      child => child.childPlacement === placement,
    )
    if (existingIndex >= 0) {
      children[existingIndex] = node
    } else {
      children.unshift(node)
    }
    this.project.replaceNavigationChildren(children)
    this.markNavigationDirty('root')
    this.bumpRevision()
    return node
  }

  // ── 生命周期：页面挂载 ───────────────────────────────

  /** 为当前选中节点创建页面文件并挂载导航。 */
  async createPageForSelectedNode(params: CreatePageForSelectedNodeParams): Promise<PageNodeCreateMountedResult> {
    const pageId = params.pageId.trim()
    if (!pageId) {
      throw new Error('pageId 不能为空')
    }
    const selected = this.requireSelectedNode('未选中导航节点，无法创建并绑定页面')
    const pageNode = this.openPage(pageId)
    const page = await pageNode.createFiles({
      ...(params.title === undefined ? {} : { title: params.title }),
      ...(params.icon === undefined ? {} : { icon: params.icon }),
    })

    const previousEditDto = createNavigationNodeEditDto(selected)
    try {
      const nextEditDto: NavigationNodeEditInputDto = {
        ...previousEditDto,
        node: {
          ...applyNodeKindPresetToEditDto(previousEditDto.node, 'page'),
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string should fall through to default
          title: params.title?.trim() || previousEditDto.node.title || pageId,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string should fall through to default
          icon: params.icon?.trim() || previousEditDto.node.icon,
          path: `/${pageId}`,
        },
      }
      applyNavigationNodeEditDtoToNode(selected, nextEditDto)
      this.project.setSelectedNodeId(selected.id)
      this.markNavigationDirty('node')
      await this.saveSelectedNavigationNode()
      this.project.setActivePageId(pageId)
      this.bumpRevision()
      return { page, node: this.getSelectedNode() ?? selected }
    } catch (error) {
      applyNavigationNodeEditDtoToNode(selected, previousEditDto)
      this.project.setSelectedNodeId(selected.id)
      this.markNavigationClean()
      await pageNode.deleteFiles()
      this.bumpRevision()
      throw error
    }
  }

  /** 创建页面文件并在导航树中挂载节点。 */
  async createMountedPage(params: CreateMountedPageParams): Promise<PageNodeCreateMountedResult> {
    const { pageId, ...modelParams } = params
    const pageNode = this.openPage(pageId)
    const page = await pageNode.createFiles({
      ...(modelParams.title === undefined ? {} : { title: modelParams.title }),
      ...(modelParams.icon === undefined ? {} : { icon: modelParams.icon }),
    })
    try {
      const node = await this.navigationLifecycle.mountPage({ pageId, ...modelParams })
      await this.reloadNavigation({ selectedNodeId: node.id })
      return { page, node }
    } catch (error) {
      if (modelParams.rollbackPageOnNavigationFailure === true) {
        await pageNode.deleteFiles()
      }
      throw error
    }
  }

  /** 仅创建页面四文件，不挂载导航。 */
  async createPageFiles(params: ProjectEditorCreatePageParams): Promise<Record<string, unknown>> {
    const { pageId, ...modelParams } = params
    const pageNode = this.openPage(pageId)
    const result = await pageNode.createFiles({
      ...(modelParams.title === undefined ? {} : { title: modelParams.title }),
      ...(modelParams.icon === undefined ? {} : { icon: modelParams.icon }),
    })
    this.bumpRevision()
    return result
  }

  /** 仅删除页面四文件，不操作导航。 */
  async deletePageFiles(pageId: string): Promise<void> {
    const normalized = pageId.trim()
    await this.project.openConfigPage(normalized).deleteFiles()
    if (this.getActivePage()?.pageId === normalized) {
      this.project.clearActivePage()
    }
    this.closePage(normalized)
    this.bumpRevision()
  }

  /** 卸载导航节点并删除页面文件。 */
  async removeMountedPage(params: RemoveMountedPageParams): Promise<PageNodeRemoveMountedResult> {
    const deletedNode = await this.navigationLifecycle.unmountPage(params.pageId, params.nodeId)
    const shouldDeleteFiles = params.deleteFiles !== false
    if (shouldDeleteFiles) {
      await this.project.openConfigPage(params.pageId).deleteFiles()
    }
    const result = { deletedNode, deletedFiles: shouldDeleteFiles }
    if (this.getActivePage()?.pageId === params.pageId) {
      this.project.clearActivePage()
    }
    await this.reloadNavigation({ selectedNodeId: this.project.editor.selectedNodeId })
    return result
  }

  /** 在导航树中移动页面节点。 */
  async moveMountedPage(nodeId: string, newParentId: string | null, index: number): Promise<ProjectNodeData> {
    const result = await this.navigationLifecycle.moveMountedPage(nodeId, newParentId, index)
    await this.reloadNavigation({ selectedNodeId: nodeId })
    return result
  }

  // ── 版本管理 ─────────────────────────────────────────

  /** 获取指定文件的远端版本列表。 */
  async listRemotePageVersions(filename: PageNodeFileName): Promise<PageNodeFileVersionSummary[]> {
    const page = this.getActivePage()
    if (!page) return []
    return page.listFileVersions(filename)
  }

  /** 恢复指定文件的远端历史版本。主路径走子模型 restoreVersion。 */
  async restoreRemotePageVersion(version: number, filename: PageNodeFileName): Promise<void> {
    const page = this.getActivePage()
    if (!page) {
      throw new Error('无活动页面，无法恢复版本')
    }
    await page.restoreRemoteFileVersion(filename, version)
  }

  /** 为指定文件创建远端版本快照。 */
  async createRemotePageVersion(filename: PageNodeFileName): Promise<void> {
    const page = this.getActivePage()
    if (!page) return
    await page.createFileVersion(filename)
  }

  /** 删除指定文件的远端版本。 */
  async deleteRemotePageVersion(version: number, filename: PageNodeFileName): Promise<void> {
    const page = this.getActivePage()
    if (!page) return
    await page.deleteFileVersion(filename, version)
  }

  /** 通知外部 SSE 事件导致页面文件变化，使缓存失效。 */
  notifyPageFileChanged(
    pageId: string,
    filename: PageNodeFileName | '__created' | '__deleted' | '__bulk',
  ): void {
    if (filename === '__created' || filename === '__deleted' || filename === '__bulk') {
      this.fileCache.clearPageCache(pageId)
    } else {
      this.fileCache.clearPageCache(pageId, filename)
    }
    this.bumpRevision()
  }

  // ── 辅助 ─────────────────────────────────────────────

  /** 探测外链是否可嵌入。 */
  async probeLink(url: string): Promise<{ embeddable: boolean; reason: string }> {
    return this.navClient.probeLink(url)
  }

  async listReferenceProjects(): Promise<ProjectSummary[]> {
    return this.requireProjectReferenceClient().listProjects({
      excludeProjectId: this.project.projectId,
    })
  }

  async listReferenceProjectPages(projectId: string): Promise<ProjectPageReference[]> {
    return this.requireProjectReferenceClient().listProjectPages(projectId)
  }

  // ── 内部方法 ─────────────────────────────────────────

  private getSelectedNode(): ProjectNodeData | null {
    const selectedNodeId = this.project.editor.selectedNodeId
    if (!selectedNodeId) return null
    return this.project.findNodeById(selectedNodeId)?.toNodeData() ?? null
  }

  private requireSelectedNode(message: string): ProjectNodeData {
    const node = this.getSelectedNode()
    if (node) return node
    throw new Error(message)
  }

  private requireProjectReferenceClient(): ProjectReferenceClient {
    if (this.projectReferenceClient !== null) return this.projectReferenceClient
    throw new Error('ProjectReferenceClient 未配置，无法读取跨项目引用')
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

  private markNavigationDirty(scope: NavigationDirtyScope): void {
    this.project.markNavigationDirty(scope)
  }

  private markNavigationClean(): void {
    this.project.markNavigationClean()
    this.workingEditDto = null
  }

  private async reloadNavigation(options?: { selectedNodeId?: string | null }): Promise<ProjectModelData> {
    const root = await this.navClient.loadRoot()
    this.project.replaceRoot(root)
    const selectedNodeId = options?.selectedNodeId ?? null
    if (selectedNodeId && this.project.findNodeById(selectedNodeId)) {
      this.project.setSelectedNodeId(selectedNodeId)
    } else {
      this.project.setSelectedNodeId(null)
    }
    this.markNavigationClean()
    this.refreshNavRefs()
    this.bumpRevision()
    return root
  }

  private bumpRevision(): void {
    this.revisionCounter += 1
    for (const listener of this.listeners) {
      listener()
    }
  }
}
