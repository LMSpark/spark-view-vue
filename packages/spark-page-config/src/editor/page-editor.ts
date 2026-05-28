/**
 * PageEditor — 框架无关的页面编辑聚合入口。
 *
 * 内部组合 PageModel、NavigationEditSession、NavigationConfigClient，把页面导航属性、
 * 节点属性、rule.json、pagedata.json、style.css、script.js、
 * 版本管理、保存、页面挂载/删除/移动聚合成统一编辑上下文。
 *
 * 不引入 Vue，不新造数据集或节点树工具；AI 编辑也只通过 PageModel live host 进入。
 *
 * ┌──────────────────────────────────────────────────────┐
 * │  类型分组                                            │
 * │                                                      │
 * │  1. Options / Snapshot / Listener 类型                 │
 * │  2. PageEditor class                                  │
 * │     - 构造 & 变更通知                                  │
 * │     - 导航加载 & 选择                                  │
 * │     - 快照读取                                        │
 * │     - 节点属性编辑 & 保存                               │
 * │     - 四文件加载 / 编辑 / 保存                          │
 * │     - 工具访问（nodeTree / dataSet）                   │
 * │     - 生命周期（导航树节点 + 页面挂载）                  │
 * │     - 版本管理                                        │
 * │     - 辅助                                            │
 * └──────────────────────────────────────────────────────┘
 */

import type { DataSetCrudTool } from '@spark-view/spark-data'
import type { HttpClientBase } from '@spark-view/spark-utils'

import type {
  BasePageConfigLoader,
  ConfigLoaderOptions,
} from '../config/config-types'
import { PageConfigFileApi } from '../config/page-config-file-api'
import { createConfigLoader } from '../config/page-config-loader'
import type {
  AppNavRoot,
  NavNode,
  NavNodeKind,
} from '../navigation/nav-model'
import type {
  NavigationNodeDraftApplyResult,
  NavigationNodeDraftInput,
  NavNodeLocation,
} from '../navigation/nav-editing'
import {
  applyNavigationNodeDraftToNode,
  applyNodeKindPresetToDraft,
  createChildPageNode,
  createNavigationNodeDraft,
  createNavigationNodePatch,
  createRootModuleNode,
  NavigationEditSession,
} from '../navigation/nav-editing'
import { NavigationConfigClient } from '../navigation/nav-client'

import { SparkNodeTree } from '@spark-view/spark-data'

import { PageModel } from './page-model'
import type {
  PageModelCreateMountedParams,
  PageModelCreateMountedResult,
  PageModelCreatePageParams,
  PageModelFileName,
  PageModelFileVersionSummary,
  PageModelPageSummary,
  PageModelRemoveMountedParams,
  PageModelRemoveMountedResult,
} from './page-model'
import type { PageModelFileStorage } from './page-model-factory'
import type { PageDesignEditHost } from '../design/page-edit-session'

// ═══════════════════════════════════════════════════════
// 1. Options / Snapshot / Listener 类型
// ═══════════════════════════════════════════════════════

/** PageEditor 构造参数 */
type PageEditorOptions = {
  fileApi: PageConfigFileApi
  navigationClient: NavigationConfigClient
  getConfigLoader: () => BasePageConfigLoader
  navigationSession?: NavigationEditSession
}

export type CreatePageEditorOptions = {
  http: HttpClientBase
  getPageConfigApi: () => string
  getNavigationApi: () => string
  getHeaders?: () => Record<string, string>
  fileStorage?: PageModelFileStorage
}

/** loadPageFile / ensureActivePageFilesLoaded / selectPage 共用加载参数 */
export type PageEditorLoadOptions = {
  forceReload?: boolean
  allowMissingAsEmpty?: boolean
}

export type PageDesignEditHostOptions = {
  pageId?: string
}

/** createPageForSelectedNode 参数 */
export type CreatePageForSelectedNodeParams = {
  pageId: string
  title?: string
  icon?: string
}

type CreateMountedPageParams = PageModelCreateMountedParams & {
  pageId: string
}

type PageEditorCreatePageParams = PageModelCreatePageParams & {
  pageId: string
}

type RemoveMountedPageParams = PageModelRemoveMountedParams & {
  pageId: string
}

/** 变更监听器：editor 状态变更时触发（文档变化、选择变化、导航 dirty 等） */
export type PageEditorListener = () => void

/**
 * PageEditor 即时快照。
 * 包含当前选中节点、页面四文件领域模型、脏状态、加载状态。
 */
export type PageEditorSnapshot = {
  pageId: string
  navigationRoot: AppNavRoot
  treeData: NavNode[]
  selectedNode: NavNode | null
  selectedNodeId: string | null
  navigationLocation: NavNodeLocation | null
  navigationDraft: NavigationNodeDraftInput | null
  nodeTree: SparkNodeTree | null
  dataSetTool: DataSetCrudTool | null
  ruleJson: string
  pageDataJson: string
  script: string
  style: string
  dirtyFiles: Set<PageModelFileName>
  parseErrors: Record<PageModelFileName, string | null>
  isLoaded: boolean
  hasAnyFileDirty: boolean
  navigationDirty: boolean
  hasAnyDirty: boolean
}

// ═══════════════════════════════════════════════════════
// 2. PageEditor class
// ═══════════════════════════════════════════════════════

type NavigationDirtyScope = 'node' | 'root'

function isPageEditorLoadOptions(value: unknown): value is PageEditorLoadOptions {
  return value !== null && typeof value === 'object'
}

function toPageConfigApiBaseUrl(pageApi: string): string {
  const normalized = pageApi.replace(/\/+$/, '')
  const suffix = '/pages-config'
  if (normalized.endsWith(suffix)) {
    return normalized.slice(0, -suffix.length) || '/'
  }
  return normalized || '/'
}

export function createPageEditor(options: CreatePageEditorOptions): PageEditor {
  const fileApi = new PageConfigFileApi({
    getPageConfigApi: options.getPageConfigApi,
    http: options.http,
  })
  const navigationClient = new NavigationConfigClient({
    getNavigationApi: options.getNavigationApi,
    http: options.http,
  })
  let pageConfigLoader: BasePageConfigLoader | null = null
  let pageConfigLoaderApiBaseUrl = ''

  const getConfigLoader = (): BasePageConfigLoader => {
    const apiBaseUrl = toPageConfigApiBaseUrl(options.getPageConfigApi())
    if (pageConfigLoader === null || pageConfigLoaderApiBaseUrl !== apiBaseUrl) {
      const loaderOptions: Partial<ConfigLoaderOptions> = {
        apiBaseUrl,
        httpClient: options.http,
        fileStorage: options.fileStorage ?? 'localStorage',
      }
      if (options.getHeaders !== undefined) {
        loaderOptions.getHeaders = options.getHeaders
      }
      pageConfigLoader = createConfigLoader(loaderOptions)
      pageConfigLoaderApiBaseUrl = apiBaseUrl
    }
    return pageConfigLoader
  }

  return new PageEditor({
    fileApi,
    navigationClient,
    getConfigLoader,
  })
}

/**
 * 框架无关的页面编辑聚合入口。
 *
 * 组合 PageModel / navSession / navClient，
 * 为 DevSystem 编辑器提供统一的中后端能力。
 */
export class PageEditor {
  private readonly navSession: NavigationEditSession
  private readonly navClient: NavigationConfigClient
  private readonly fileApi: PageConfigFileApi
  private readonly configLoaderFactory: () => BasePageConfigLoader
  private readonly openPages = new Map<string, PageModel>()

  private _activePageId = ''
  private selectedNodeId: string | null = null
  private navigationDirty = false
  private navigationDirtyScope: NavigationDirtyScope | null = null
  private pageListCache: PageModelPageSummary[] = []

  private revisionCounter = 0
  private readonly listeners = new Set<PageEditorListener>()

  constructor(options: PageEditorOptions) {
    this.navClient = options.navigationClient
    this.navSession = options.navigationSession ?? new NavigationEditSession()
    this.fileApi = options.fileApi
    this.configLoaderFactory = options.getConfigLoader
  }

  // ── 变更通知 ─────────────────────────────────────────

  /** 单调递增的编辑上下文版本号，每次文档/选择/导航变更时 +1。 */
  get revision(): number {
    return this.revisionCounter
  }

  /** 订阅编辑器变更。返回取消订阅函数。 */
  subscribe(listener: PageEditorListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** 页面文件名唯一从 PageModel 暴露，消费层不再自定义四文件清单。 */
  getPageFileNames(): readonly PageModelFileName[] {
    return PageModel.fileNames
  }

  // ── PageModel 管理 ────────────────────────────────────

  /** 获取当前活动 PageModel（不存在时返回 null）。 */
  getActivePage(): PageModel | null {
    if (!this._activePageId) return null
    return this.openPages.get(this._activePageId) ?? null
  }

  /**
   * 打开或获取已缓存的 PageModel。
   * 如果页面已挂载在导航树中，自动绑定 navNode 引用。
   */
  openPage(pageId: string): PageModel {
    const normalized = pageId.trim()
    if (!normalized) {
      throw new Error('pageId 不能为空')
    }
    let page = this.openPages.get(normalized)
    if (!page) {
      page = new PageModel(normalized, this.fileApi, this.configLoaderFactory, this.navClient)
      page.subscribe(() => this.bumpRevision())
      this.openPages.set(normalized, page)
    }
    if (page.navigation.navNode === null) {
      const node = PageModel.findConfigNodeByPageId(this.navSession.root.children, normalized)
      if (node) {
        page.navigation.loadFromNode(node)
      }
    }
    return page
  }

  /** 关闭 PageModel，从缓存中移除。 */
  closePage(pageId: string): void {
    this.openPages.delete(pageId.trim())
  }

  /**
   * 导航树 reload 后重新绑定所有已打开 PageModel 的 navNode 引用。
   * 页面已从树中移除时 navNode 置为 null。
   */
  refreshNavRefs(): void {
    for (const page of this.openPages.values()) {
      const fresh = PageModel.findConfigNodeByPageId(this.navSession.root.children, page.pageId)
      if (fresh) {
        if (page.navigation.isDirty) {
          page.navigation.navNode = fresh
        } else {
          page.navigation.loadFromNode(fresh)
        }
      } else {
        page.navigation.navNode = null
      }
    }
  }

  // ── 导航加载 & 选择 ──────────────────────────────────

  /** 加载远端导航 root 到内存 navSession 中。 */
  async loadNavigation(): Promise<AppNavRoot> {
    return this.reloadNavigation()
  }

  /**
   * 在导航树中选中节点。
   * 传入 null 或空字符串清除选中。
   */
  selectNode(nodeId: string | null): void {
    const normalized = nodeId?.trim()
    if (!normalized) {
      this.selectedNodeId = null
      this.bumpRevision()
      return
    }
    const found = PageModel.findNodeById(this.navSession.root.children, normalized)
    if (!found) {
      throw new Error(`导航节点未找到: ${normalized}`)
    }
    this.selectedNodeId = normalized
    this.bumpRevision()
  }

  /**
   * 加载页面四文件。
   * 可传 pageId 直接加载未挂载页面；不传时从当前选中导航节点解析。
   */
  async selectPage(pageId: string, options?: PageEditorLoadOptions): Promise<void>
  async selectPage(options?: PageEditorLoadOptions): Promise<void>
  async selectPage(
    pageIdOrOptions?: string | PageEditorLoadOptions,
    maybeOptions?: PageEditorLoadOptions,
  ): Promise<void> {
    const explicitPageId = typeof pageIdOrOptions === 'string'
      ? pageIdOrOptions.trim()
      : ''
    const options = typeof pageIdOrOptions === 'string'
      ? maybeOptions
      : (isPageEditorLoadOptions(pageIdOrOptions) ? pageIdOrOptions : undefined)
    const pageId = explicitPageId || this.resolveSelectedPageId()
    if (!pageId) {
      throw new Error('pageId 不能为空，无法加载页面')
    }

    this._activePageId = pageId
    const mountedNode = PageModel.findConfigNodeByPageId(this.navSession.root.children, pageId)
    this.selectedNodeId = mountedNode?.id ?? null
    const page = this.openPage(pageId)
    const pageModelOptions: { forceReload?: boolean; allowMissingAsEmpty?: boolean } = {}
    if (options?.forceReload === true) pageModelOptions.forceReload = true
    if (options?.allowMissingAsEmpty === true) pageModelOptions.allowMissingAsEmpty = true
    await page.load(pageModelOptions)
    this.bumpRevision()
  }

  /** 清除当前活动页面。 */
  clearActivePage(): void {
    const activePageId = this._activePageId
    this._activePageId = ''
    if (activePageId) {
      this.closePage(activePageId)
    }
    this.bumpRevision()
  }

  /** 替换内存导航 root。adapter 的 demo fallback / reset 可用它接入 editor 状态。 */
  replaceNavigationRoot(root: AppNavRoot, options?: { markDirty?: boolean }): AppNavRoot {
    const nextRoot = this.navSession.replaceRoot(root)
    this.selectedNodeId = null
    if (options?.markDirty === true) {
      this.markNavigationDirty('root')
    } else {
      this.navigationDirty = false
      this.navigationDirtyScope = null
    }
    this.bumpRevision()
    return nextRoot
  }

  /**
   * 只切换活动 pageId，不触发远端加载。
   * 用于兼容外层 adapter 先设置 activePageId、再按需加载或保存的既有流程。
   */
  setActivePage(pageId: string, options?: { forceReset?: boolean }): void {
    const normalizedPageId = pageId.trim()
    if (!normalizedPageId) {
      this.clearActivePage()
      return
    }
    if (options?.forceReset === true && this._activePageId === normalizedPageId) {
      this.closePage(normalizedPageId)
    }
    this._activePageId = normalizedPageId
    this.openPage(normalizedPageId)
    const mountedNode = PageModel.findConfigNodeByPageId(this.navSession.root.children, normalizedPageId)
    if (mountedNode) {
      this.selectedNodeId = mountedNode.id
    }
    this.bumpRevision()
  }

  // ── 快照读取 ─────────────────────────────────────────

  /** 返回当前编辑上下文的即时快照。全部从 active PageModel 读取。 */
  readSnapshot(): PageEditorSnapshot {
    const pageId = this._activePageId
    const root = this.navSession.root
    const treeData = root.children
    const selectedNode = this.selectedNodeId
      ? PageModel.findNodeById(treeData, this.selectedNodeId)
      : null

    const navLocation = selectedNode
      ? PageModel.findNodeLocation(treeData, selectedNode.id)
      : null

    const navDraft = selectedNode
      ? createNavigationNodeDraft(selectedNode)
      : null

    const activePage = this.getActivePage()

    const dirtyFiles = new Set<PageModelFileName>()
    const parseErrors: Record<PageModelFileName, string | null> = {
      'rule.json': null,
      'pagedata.json': null,
      'script.js': null,
      'style.css': null,
    }

    if (activePage) {
      if (activePage.rule.isDirty) dirtyFiles.add('rule.json')
      if (activePage.dataSet.isDirty) dirtyFiles.add('pagedata.json')
      if (activePage.script.isDirty) dirtyFiles.add('script.js')
      if (activePage.style.isDirty) dirtyFiles.add('style.css')
    }

    const hasAnyFileDirty = dirtyFiles.size > 0
    const navDirty = this.navigationDirty || (activePage?.navigation.isDirty ?? false)

    return {
      pageId,
      navigationRoot: root,
      treeData,
      selectedNode,
      selectedNodeId: this.selectedNodeId,
      navigationLocation: navLocation,
      navigationDraft: navDraft,
      nodeTree: activePage?.rule.tree ?? null,
      dataSetTool: activePage?.dataSet.tool ?? null,
      ruleJson: activePage?.rule.getText() ?? '',
      pageDataJson: activePage?.dataSet.getText() ?? '',
      script: activePage?.script.text ?? '',
      style: activePage?.style.text ?? '',
      dirtyFiles,
      parseErrors,
      isLoaded: activePage?.isLoaded === true,
      hasAnyFileDirty,
      navigationDirty: navDirty,
      hasAnyDirty: hasAnyFileDirty || navDirty,
    }
  }

  // ── 节点属性编辑 ─────────────────────────────────────

  /**
   * 应用导航节点草稿到当前页面导航节点。
   * 只改内存节点并标记 navigation dirty，不提交远端。
   */
  applyNavigationDraft(input: NavigationNodeDraftInput): NavigationNodeDraftApplyResult {
    const node = this.requireSelectedNode('未选中导航节点，无法编辑导航属性')
    const result = applyNavigationNodeDraftToNode(node, input)
    this.selectedNodeId = node.id
    this.markNavigationDirty('node')
    this.getActivePage()?.navigation.markDirty()
    this.bumpRevision()
    return result
  }

  /** 对当前页面导航节点应用节点类型预设（切换类型时重置关联字段）。 */
  applyNodeKindPreset(kind: NavNodeKind): void {
    const node = this.requireSelectedNode('未选中导航节点，无法修改节点类型')
    const draft = createNavigationNodeDraft(node)
    const updatedDraft = applyNodeKindPresetToDraft(draft.draft, kind)
    // 用更新后的 draft 覆盖原 draft 的关键字段再 apply
    const mergedInput: NavigationNodeDraftInput = {
      ...draft,
      draft: updatedDraft,
    }
    applyNavigationNodeDraftToNode(node, mergedInput)
    this.selectedNodeId = node.id
    this.markNavigationDirty('node')
    this.bumpRevision()
  }

  // ── 导航保存 ─────────────────────────────────────────

  /**
   * 将当前页面导航节点的修改持久化到远端。
   * 优先使用 page.navigation 子模型 applyToNode() 生成的 patch；
   * 回退到从选中树节点重新创建 draft（createPageForSelectedNode 等路径）。
   */
  async saveSelectedNavigationNode(): Promise<void> {
    const page = this.getActivePage()
    let nodeId: string
    let patch: Partial<NavNode> & Pick<NavNode, 'id' | 'title' | 'nodeKind'>

    if (page?.navigation.isDirty && page.navigation.navNode) {
      const result = page.navigation.applyToNode()
      nodeId = page.navigation.navNode.id
      patch = result.patch
    } else {
      const node = this.requireSelectedNode('未选中导航节点，无法保存导航属性')
      const draft = createNavigationNodeDraft(node)
      const result = createNavigationNodePatch(draft)
      nodeId = node.id
      patch = result.patch
    }

    await this.navClient.updateNode(nodeId, patch)
    await this.reloadNavigation({ selectedNodeId: nodeId })
  }

  /** 将完整导航 root 持久化到远端。 */
  async saveNavigationRoot(): Promise<void> {
    await this.navClient.saveRoot(this.navSession.root)
    this.markNavigationClean()
    this.bumpRevision()
  }

  // ── 四文件加载 ───────────────────────────────────────

  /** 确保当前活动页面的四文件已加载。 */
  async ensureActivePageFilesLoaded(options?: PageEditorLoadOptions): Promise<void> {
    const page = this.getActivePage()
    if (!page) {
      throw new Error('无活动页面，无法加载页面文件')
    }
    const loadOptions: { forceReload?: boolean; allowMissingAsEmpty?: boolean } = {}
    if (options?.forceReload === true) loadOptions.forceReload = true
    if (options?.allowMissingAsEmpty === true) loadOptions.allowMissingAsEmpty = true
    await page.load(loadOptions)
  }

  /** 加载单个页面文件到 active PageModel。 */
  async loadPageFile(name: PageModelFileName, options?: PageEditorLoadOptions): Promise<void> {
    const page = this.getActivePage()
    if (!page) {
      throw new Error('无活动页面，无法加载页面文件')
    }
    const loadOpts = { forceReload: options?.forceReload === true, allowMissingAsEmpty: options?.allowMissingAsEmpty === true }
    await page.loadFile(name, loadOpts)
  }

  // ── 四文件保存 ───────────────────────────────────────

  /** 保存单个页面文件。委托 active PageModel 子模型。 */
  async savePageFile(name: PageModelFileName): Promise<void> {
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

  /** 保存所有变更：dirty 文件 + 导航节点。 */
  async saveAll(): Promise<void> {
    await this.saveDirtyPageFiles()
    const page = this.getActivePage()
    const navDirty = this.navigationDirty || page?.navigation.isDirty === true
    if (!navDirty || !page) return

    if (this.navigationDirtyScope === 'root') {
      await this.saveNavigationRoot()
    } else {
      await this.saveSelectedNavigationNode()
    }

    page.navigation.markClean()
    this.markNavigationClean()
  }

  /** 读取页面文件只读文本投影。 */
  getPageFileText(name: PageModelFileName): string {
    const page = this.getActivePage()
    if (!page) return ''
    return page.getFileText(name)
  }

  /**
   * 创建 PageDesign live edit host。
   * AI 接入必须传 pageId；无 pageId 时仅保留 active-page 兼容路径。
   */
  createPageDesignEditHost(options: PageDesignEditHostOptions = {}): PageDesignEditHost {
    const editor = this
    const targetPageId = options.pageId?.trim() ?? ''
    const targetLabel = (): string => targetPageId || editor._activePageId || '<active-page>'
    const page = (): PageModel | null => {
      const resolved = targetPageId
        ? (editor.openPages.get(targetPageId) ?? null)
        : editor.getActivePage()
      if (targetPageId && resolved?.isLoaded !== true) return null
      return resolved
    }
    const requirePage = (operation: string): PageModel => {
      const resolved = page()
      if (resolved !== null) return resolved
      throw new Error(`PageDesign edit host unavailable: page "${targetLabel()}" is not opened and loaded for ${operation}.`)
    }
    const requireMountedNavigation = (operation: string): PageModel => {
      const resolved = requirePage(operation)
      if (resolved.navigation.navNode !== null) return resolved
      throw new Error(`PageDesign edit host unavailable: page "${resolved.pageId}" has no mounted navigation node for ${operation}.`)
    }
    const notifyChanged = (): void => {
      editor.bumpRevision()
    }
    return {
      getNodeTree: () => {
        const p = page()
        return p?.rule.tree ?? null
      },
      onNodeTreeChanged: (nodeTree) => {
        const p = requirePage('onNodeTreeChanged')
        p.rule.tree = nodeTree instanceof SparkNodeTree
          ? nodeTree
          : SparkNodeTree.fromJson(nodeTree.toJSON())
        p.rule.markDirty()
        notifyChanged()
      },
      getDataSetTool: () => {
        const p = page()
        return p?.dataSet.tool ?? null
      },
      onDataSetChanged: (tool) => {
        const p = requirePage('onDataSetChanged')
        p.dataSet.tool = tool
        p.dataSet.markDirty()
        notifyChanged()
      },
      readScript: () => {
        return requirePage('readScript').script.text
      },
      writeScript: (content) => {
        const p = requirePage('writeScript')
        p.script.setText(content)
        notifyChanged()
      },
      readStyle: () => {
        return requirePage('readStyle').style.text
      },
      writeStyle: (content) => {
        const p = requirePage('writeStyle')
        p.style.setText(content)
        notifyChanged()
      },
      getNavDraft: () => {
        const p = page()
        return p?.navigation.navNode === null ? null : p?.navigation.toDraft() ?? null
      },
      onNavDraftChanged: (draft) => {
        const p = requireMountedNavigation('onNavDraftChanged')
        p.navigation.applyDraft(draft)
        notifyChanged()
      },
      getNavContext: () => {
        const p = page()
        return p?.navigation.navNode === null ? null : p?.navigation.toDraftInput().context ?? null
      },
      onNavContextChanged: (context) => {
        const p = requireMountedNavigation('onNavContextChanged')
        p.navigation.applyContext(context)
        notifyChanged()
      },
    }
  }

  // ── 工具访问：节点树 ─────────────────────────────────

  /** 获取当前 rule.json 的节点树编辑模型。始终返回已初始化的 tree。 */
  getNodeTree(): SparkNodeTree | null {
    const page = this.getActivePage()
    return page ? page.rule.tree : null
  }

  /** 获取当前 rule.json 的节点树，未加载时 fail-fast。 */
  requireNodeTree(): SparkNodeTree {
    const tree = this.getNodeTree()
    if (!tree) {
      throw new Error('rule.json 未加载，无法操作节点树')
    }
    return tree
  }

  /** 编辑节点树。委托 active PageModel 子模型。 */
  async editNodeTree(run: (tree: SparkNodeTree) => void | Promise<void>): Promise<void> {
    const page = this.getActivePage()
    if (!page) {
      throw new Error('无活动页面，无法编辑节点树')
    }
    await run(page.rule.tree)
    page.rule.markDirty()
    this.bumpRevision()
  }

  // ── 工具访问：数据集 ─────────────────────────────────

  /** 获取当前 pagedata.json 的数据集编辑工具。始终返回已初始化的 tool。 */
  getDataSetTool(): DataSetCrudTool | null {
    const page = this.getActivePage()
    return page ? page.dataSet.tool : null
  }

  /** 获取当前 pagedata.json 的数据集工具，未加载时 fail-fast。 */
  requireDataSetTool(): DataSetCrudTool {
    const tool = this.getDataSetTool()
    if (!tool) {
      throw new Error('pagedata.json 未加载，无法操作数据集')
    }
    return tool
  }

  /** 编辑数据集。委托 active PageModel 子模型。 */
  async editDataSet(run: (tool: DataSetCrudTool) => void | Promise<void>): Promise<void> {
    const page = this.getActivePage()
    if (!page) {
      throw new Error('无活动页面，无法编辑数据集')
    }
    await run(page.dataSet.tool)
    page.dataSet.markDirty()
    this.bumpRevision()
  }

  // ── 生命周期：导航树节点 ──────────────────────────────

  /** 在导航根添加模块节点。 */
  addRootNode(createId: () => string): NavNode {
    const node = createRootModuleNode(createId)
    this.navSession.root.children.push(node)
    this.markNavigationDirty('root')
    this.bumpRevision()
    return node
  }

  /** 在当前选中节点下添加子页面节点。无选中节点时添加到根下。 */
  addChildPageNode(createId: () => string): NavNode {
    const selected = this.getSelectedNode()
    const node = createChildPageNode(createId)
    if (selected) {
      selected.children ??= []
      selected.children.push(node)
    } else {
      this.navSession.root.children.push(node)
    }
    this.markNavigationDirty('root')
    this.bumpRevision()
    return node
  }

  /** 从导航树中移除节点并返回被删节点。如移除的是当前选中节点则清除选中。 */
  removeNode(nodeId: string): NavNode | null {
    const normalized = nodeId.trim()
    if (!normalized) {
      throw new Error('nodeId 不能为空')
    }
    const location = PageModel.findNodeLocation(this.navSession.root.children, normalized)
    if (!location) {
      throw new Error(`导航节点未找到: ${normalized}`)
    }
    const siblings = location.parent
      ? location.parent.children
      : this.navSession.root.children
    if (!siblings) {
      throw new Error('父节点 children 为空，无法移除')
    }
    const removed = siblings.splice(location.index, 1)[0] ?? null

    if (this.selectedNodeId === normalized) {
      this.selectedNodeId = null
    }
    this.markNavigationDirty('root')
    this.bumpRevision()
    return removed
  }

  /** 直接从远端删除非配置节点（不删页面文件）。配置页面请用 removeMountedPage。 */
  async deleteNode(nodeId: string): Promise<NavNode | null> {
    const normalized = nodeId.trim()
    if (!normalized) {
      throw new Error('nodeId 不能为空')
    }
    const result = await this.navClient.deleteNode(normalized)
    if (this.selectedNodeId === normalized) {
      this.selectedNodeId = null
    }
    this.navigationDirty = false
    this.navigationDirtyScope = null
    // 同步远端状态到内存
    const root = await this.navClient.loadRoot()
    this.navSession.replaceRoot(root)
    this.bumpRevision()
    return result
  }

  /** 恢复或创建保留区域根分组（toolbar / user-menu）。 */
  restoreReservedRootGroup(placement: 'toolbar' | 'user-menu', createId: () => string): NavNode {
    const node = PageModel.createReservedRootGroup(placement, {
      createId,
      templateRoot: this.navSession.root,
    })
    const children = this.navSession.root.children
    const existingIndex = children.findIndex(
      child => child.childPlacement === placement,
    )
    if (existingIndex >= 0) {
      children[existingIndex] = node
    } else {
      children.unshift(node)
    }
    this.markNavigationDirty('root')
    this.bumpRevision()
    return node
  }

  // ── 生命周期：页面挂载 ───────────────────────────────

  /** 为当前选中节点创建页面文件并挂载导航。 */
  async createPageForSelectedNode(params: CreatePageForSelectedNodeParams): Promise<PageModelCreateMountedResult> {
    const pageId = params.pageId.trim()
    if (!pageId) {
      throw new Error('pageId 不能为空')
    }
    const selected = this.requireSelectedNode('未选中导航节点，无法创建并绑定页面')
    const pageModel = this.openPage(pageId)
    const page = await pageModel.createFiles({
      ...(params.title === undefined ? {} : { title: params.title }),
      ...(params.icon === undefined ? {} : { icon: params.icon }),
    })

    const previousDraft = createNavigationNodeDraft(selected)
    try {
      const nextDraft: NavigationNodeDraftInput = {
        ...previousDraft,
        draft: {
          ...applyNodeKindPresetToDraft(previousDraft.draft, 'page'),
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string should fall through to default
          title: params.title?.trim() || previousDraft.draft.title || pageId,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string should fall through to default
          icon: params.icon?.trim() || previousDraft.draft.icon,
          path: `/${pageId}`,
        },
      }
      applyNavigationNodeDraftToNode(selected, nextDraft)
      this.selectedNodeId = selected.id
      this.markNavigationDirty('node')
      await this.saveSelectedNavigationNode()
      this._activePageId = pageId
      this.invalidatePageList()
      this.bumpRevision()
      return { page, node: this.getSelectedNode() ?? selected }
    } catch (error) {
      applyNavigationNodeDraftToNode(selected, previousDraft)
      this.selectedNodeId = selected.id
      this.markNavigationClean()
      await pageModel.deleteFiles()
      this.invalidatePageList()
      this.bumpRevision()
      throw error
    }
  }

  /** 创建页面文件并在导航树中挂载节点。 */
  async createMountedPage(params: CreateMountedPageParams): Promise<PageModelCreateMountedResult> {
    const { pageId, ...modelParams } = params
    const result = await this.openPage(pageId).createMounted(modelParams)
    this.invalidatePageList()
    await this.reloadNavigation({ selectedNodeId: result.node.id })
    return result
  }

  /** 仅创建页面四文件，不挂载导航。 */
  async createPageFiles(params: PageEditorCreatePageParams): Promise<Record<string, unknown>> {
    const { pageId, ...modelParams } = params
    const result = await this.openPage(pageId).createFiles(modelParams)
    this.invalidatePageList()
    this.bumpRevision()
    return result
  }

  /** 仅删除页面四文件，不操作导航。 */
  async deletePageFiles(pageId: string): Promise<void> {
    const normalized = pageId.trim()
    await this.openPage(normalized).deleteFiles()
    this.invalidatePageList()
    if (this._activePageId === normalized) {
      this._activePageId = ''
    }
    this.closePage(normalized)
    this.bumpRevision()
  }

  /** 卸载导航节点并删除页面文件。 */
  async removeMountedPage(params: RemoveMountedPageParams): Promise<PageModelRemoveMountedResult> {
    const { pageId, ...modelParams } = params
    const result = await this.openPage(pageId).removeMounted(modelParams)
    this.invalidatePageList()
    if (this._activePageId === params.pageId) {
      this._activePageId = ''
    }
    await this.reloadNavigation({ selectedNodeId: this.selectedNodeId })
    return result
  }

  /** 在导航树中移动页面节点。 */
  async moveMountedPage(nodeId: string, newParentId: string | null, index: number): Promise<NavNode> {
    const node = PageModel.findNodeById(this.navSession.root.children, nodeId)
    const pageId = node ? PageModel.resolvePageIdFromPath(node.path) : ''
    const page = this.openPage(pageId || this._activePageId || nodeId)
    const result = await page.moveMounted(nodeId, newParentId, index)
    await this.reloadNavigation({ selectedNodeId: nodeId })
    return result
  }

  // ── 版本管理 ─────────────────────────────────────────

  /** 获取指定文件的远端版本列表。 */
  async listRemotePageVersions(filename: PageModelFileName): Promise<PageModelFileVersionSummary[]> {
    if (!this._activePageId) return []
    return this.openPage(this._activePageId).listVersions(filename)
  }

  /** 恢复指定文件的远端历史版本。主路径走子模型 restoreVersion。 */
  async restoreRemotePageVersion(version: number, filename: PageModelFileName): Promise<void> {
    const page = this.getActivePage()
    if (!page) {
      throw new Error('无活动页面，无法恢复版本')
    }
    await page.restoreVersion(version, filename)
  }

  /** 为指定文件创建远端版本快照。 */
  async createRemotePageVersion(filename: PageModelFileName): Promise<void> {
    if (!this._activePageId) return
    await this.openPage(this._activePageId).createVersion(filename)
  }

  /** 删除指定文件的远端版本。 */
  async deleteRemotePageVersion(version: number, filename: PageModelFileName): Promise<void> {
    if (!this._activePageId) return
    await this.openPage(this._activePageId).deleteVersion(version, filename)
  }

  // ── 页面列表 ─────────────────────────────────────────

  /** 返回页面列表（优先使用缓存）。 */
  async listPages(): Promise<PageModelPageSummary[]> {
    if (this.pageListCache.length === 0) {
      return this.refreshPages()
    }
    return this.pageListCache
  }

  /** 强制刷新页面列表并更新缓存。 */
  async refreshPages(): Promise<PageModelPageSummary[]> {
    this.pageListCache = await this.fileApi.listPages()
    this.bumpRevision()
    return this.pageListCache
  }

  /** 通知外部 SSE 事件导致页面文件变化，使缓存失效。 */
  notifyPageFileChanged(
    _pageId: string,
    filename: PageModelFileName | '__created' | '__deleted' | '__bulk',
  ): void {
    if (filename === '__bulk' || filename === '__created' || filename === '__deleted') {
      this.pageListCache = []
    }
    this.bumpRevision()
  }

  // ── 辅助 ─────────────────────────────────────────────

  /** 探测外链是否可嵌入。 */
  async probeLink(url: string): Promise<{ embeddable: boolean; reason: string }> {
    return this.navClient.probeLink(url)
  }

  // ── 内部方法 ─────────────────────────────────────────

  private getSelectedNode(): NavNode | null {
    if (!this.selectedNodeId) return null
    return PageModel.findNodeById(this.navSession.root.children, this.selectedNodeId)
  }

  private requireSelectedNode(message: string): NavNode {
    const node = this.getSelectedNode()
    if (node) return node
    throw new Error(message)
  }

  private resolveSelectedPageId(): string {
    const node = this.requireSelectedNode('未选中导航节点，无法加载页面')
    const kind = node.nodeKind ?? 'page'
    if (!PageModel.isConfigNodeKind(kind)) {
      throw new Error(`当前选中节点不是可配置页面，类型: ${kind}`)
    }
    const pageId = PageModel.resolvePageIdFromPath(node.path)
    if (!pageId) {
      throw new Error('无法从导航节点 path 解析出 pageId')
    }
    return pageId
  }

  private markNavigationDirty(scope: NavigationDirtyScope): void {
    this.navigationDirty = true
    this.navigationDirtyScope = scope === 'root'
      ? 'root'
      : (this.navigationDirtyScope ?? 'node')
  }

  private markNavigationClean(): void {
    this.navigationDirty = false
    this.navigationDirtyScope = null
    const page = this.getActivePage()
    if (page?.navigation.isDirty === true) {
      page.navigation.markClean()
    }
  }

  private invalidatePageList(): void {
    this.pageListCache = []
  }

  private async reloadNavigation(options?: { selectedNodeId?: string | null }): Promise<AppNavRoot> {
    const root = await this.navClient.loadRoot()
    this.navSession.replaceRoot(root)
    const selectedNodeId = options?.selectedNodeId ?? null
    this.selectedNodeId = selectedNodeId && PageModel.findNodeById(root.children, selectedNodeId)
      ? selectedNodeId
      : null
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

// ── 设计时工具 re-export（DevSystem 通过 ./editor 子路径消费）──

export {
  createRuleJsonSchema,
  createRuleTreePolicy,
} from '../design/artifacts/rule-artifacts'

export type {
  RuleEditorComponentCatalog,
  RuleEditorComponentMetadata,
} from '../design/artifacts/rule-artifacts'

export type {
  PageDesignEditHost,
} from '../design/page-edit-session'

export {
  buildDataSetMetadataFromDesignerProjection,
  canUseStructuredPageDataEditor,
  hasDesignerProjectionChanges,
  PAGE_DATA_JSON_SCHEMA,
  projectDesignerRelations,
  projectDesignerTables,
  reconcileDesignerTableUiState,
} from '../design/artifacts/data-artifacts'

export type {
  DesignerColumnProjection,
  DesignerRelationProjection,
  DesignerTableProjection,
  DesignerTableUiState,
  PageDataEditorMode,
} from '../design/artifacts/data-artifacts'

import componentCatalog from '../ai/payloads/component-catalog.json'
export { componentCatalog }
