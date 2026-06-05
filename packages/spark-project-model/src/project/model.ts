/**
 * ProjectModel — 软件项目模型。
 *
 * 后端 DB 的 NAVIGATION_NODE_FLAT 是项目节点真源；前端模型同样采用平铺节点集合。
 * ProjectModel 直接持有导航编辑会话与节点索引，不再通过独立 collection 中间层转发。
 */

import {
  ProjectNode,
  type ProjectDescriptionContext,
  type ProjectModelData,
  type ProjectNodeData,
  type ProjectNodeLocation,
  type ProjectPageNodeSummary,
} from '../navigation/node'
import {
  ConfigPageNode,
  type ProjectConfigPageNodeModelOptions,
} from '../page/config-page'
import type { PageFileCache, PageFileContentLoader, PageFileWriter } from '../page/file'
import {
  appendProjectDescriptionContext,
  buildNavRoot,
  buildProjectPageSummaries,
  createChildPageNode,
  createRootModuleNode,
  flattenProjectNavigationRoot,
  isConfigNodeKind,
  normalizeNavRoot,
  resolvePageNodePageId,
} from '../navigation/helpers'
import { NavigationIndex } from '../navigation/index'

export type ProjectModelEditorNavigationDirtyScope = 'node' | 'root'

export type ProjectModelEditorState = {
  selectedNodeId: string | null
  activePageId: string | null
  navigationDirty: boolean
  navigationDirtyScope: ProjectModelEditorNavigationDirtyScope | null
}

export type ProjectModelDto = {
  projectId: string
  project: ProjectInfo
  navigation: ProjectModelData
  pages: ProjectPageNodeSummary[]
}

export type ProjectInfo = {
  tenantId?: string | undefined
  projectId: string
  name: string
  projectType: string
  icon?: string | undefined
  description: string
  homeNodeId?: string | undefined
  order: number
  createdAt?: string | undefined
  updatedAt?: string | undefined
}

export type ProjectInfoInput = Partial<Omit<ProjectInfo, 'projectId'>> & {
  projectId?: string | undefined
}

export type ProjectModelOptions = {
  projectId: string
  project?: ProjectInfoInput | undefined
  fileApi: PageFileWriter
  fileCache: PageFileCache
  contentLoaderFactory: () => PageFileContentLoader
}

/**
 * 项目模型。
 *
 * 持有项目导航编辑会话和配置页节点，是项目级模型根。
 *
 * @moduleAbility pageDesign.project
 * @moduleKind project
 * @moduleName Page Design Project
 * @moduleDescription 当前项目模型，作为模型根能力按 pageId 定位或实例化配置页面节点。
 * @moduleEntity project 项目
 * @moduleScope 当前 ProjectModel 实例代表一个项目的节点集合。
 * @moduleTrustBoundary ProjectEditor 负责装配、加载和保存；ProjectModel 暴露正确的领域模型层级。
 * @moduleGuard 先按 pageId 获取配置页面节点，再从页面节点获取 rule、pagedata、script、style 子模块；文件内容由加载生命周期填充。
 * @moduleMutation page-design read-write 当前项目模型可定位页面配置模型。
 * @moduleActionMode explicit
 */
export class ProjectModel<TNode extends ProjectNode = ProjectNode> {
  private readonly projectIdValue: string
  private tenantIdValue: string | undefined
  private projectName: string
  private projectTypeValue: string
  private projectIcon: string | undefined
  private projectDescriptionValue: string
  private projectHomeNodeId: string | undefined
  private projectOrder: number
  private projectCreatedAt: string | undefined
  private projectUpdatedAt: string | undefined
  private readonly fileApi: PageFileWriter
  private readonly fileCache: PageFileCache
  private readonly contentLoaderFactory: () => PageFileContentLoader
  private readonly nodesById = new Map<string, TNode>()
  private readonly configPagesByPageId = new Map<string, ConfigPageNode>()
  private readonly navigationIndex: NavigationIndex<TNode>
  private navigationRootCache: ProjectModelData | null = null
  private readonly editorState: ProjectModelEditorState = {
    selectedNodeId: null,
    activePageId: null,
    navigationDirty: false,
    navigationDirtyScope: null,
  }

  constructor(options: ProjectModelOptions) {
    const projectId = options.projectId.trim()
    if (!projectId) {
      throw new Error('projectId 不能为空')
    }
    this.projectIdValue = projectId
    this.projectName = projectId
    this.projectTypeValue = 'app'
    this.projectDescriptionValue = ''
    this.projectOrder = 0
    this.replaceProjectInfo(options.project ?? {})
    this.fileApi = options.fileApi
    this.fileCache = options.fileCache
    this.contentLoaderFactory = options.contentLoaderFactory
    this.navigationIndex = new NavigationIndex(this.nodesById)
  }

  /**
   * 当前项目 ID。
   */
  get projectId(): string { return this.projectIdValue }
  get id(): string { return this.projectId }
  get family(): 'project' { return 'project' }
  get tenantId(): string | undefined { return this.tenantIdValue }
  get name(): string { return this.projectName }
  get title(): string { return this.projectName }
  get projectType(): string { return this.projectTypeValue }
  get icon(): string | undefined { return this.projectIcon }
  get description(): string { return this.projectDescriptionValue.trim() }
  get homeNodeId(): string | undefined { return this.projectHomeNodeId }
  get homeNode(): TNode | null { return this.homeNodeId === undefined ? null : this.findNodeById(this.homeNodeId) }
  get rootNode(): TNode | null { return this.getChildNodes('')[0] ?? null }
  get order(): number { return this.projectOrder }
  get createdAt(): string | undefined { return this.projectCreatedAt }
  get updatedAt(): string | undefined { return this.projectUpdatedAt }
  /**
   * 编辑会话态（editor 子域）。
   *
   * 仅作为只读快照暴露；修改请通过显式方法，避免出现 selected/active/dirty 不一致。
   */
  get editor(): Readonly<ProjectModelEditorState> {
    return this.editorState
  }

  get projectInfo(): ProjectInfo {
    return {
      ...(this.tenantIdValue === undefined ? {} : { tenantId: this.tenantIdValue }),
      projectId: this.projectId,
      name: this.name,
      projectType: this.projectType,
      ...(this.icon === undefined ? {} : { icon: this.icon }),
      description: this.description,
      ...(this.homeNodeId === undefined ? {} : { homeNodeId: this.homeNodeId }),
      order: this.order,
      ...(this.createdAt === undefined ? {} : { createdAt: this.createdAt }),
      ...(this.updatedAt === undefined ? {} : { updatedAt: this.updatedAt }),
    }
  }

  /**
   * 当前项目导航根快照。
   */
  get navigationRoot(): ProjectModelData {
    if (this.navigationRootCache) return this.navigationRootCache
    const root = this.rootNode?.toNodeData()
    if (root === undefined) {
      this.navigationRootCache = buildNavRoot([], { title: this.name, childPlacement: 'header', nodeKind: 'module' })
      return this.navigationRootCache
    }
    const { id, nodeKind, title, childPlacement, children: _children, ...rest } = root
    this.navigationRootCache = buildNavRoot(this.readChildNodeData(id), {
      id,
      nodeKind: nodeKind === 'system-directory' ? 'system-directory' : 'module',
      title,
      childPlacement: childPlacement === 'sidebar' ? 'sidebar' : 'header',
      ...rest,
    })
    return this.navigationRootCache
  }

  /** @deprecated root 只保留为旧导航树 DTO 名称；新代码使用 navigationRoot。 */
  get root(): ProjectModelData { return this.navigationRoot }
  getChildNodes(nodeId = ''): TNode[] { return this.readChildNodes(nodeId) }

  /**
   * 当前项目节点的平铺投影；优先通过 {@link NavigationIndex} 迭代，避免无谓拷贝。
   */
  get flatRows(): TNode[] { return [...this.nodesById.values()] }
  forEachNode(callback: (node: TNode) => void): void {
    for (const node of this.nodesById.values()) callback(node)
  }
  replaceRoot(root: ProjectModelData): ProjectModelData {
    const normalized = normalizeNavRoot(root)
    const normalizedRoot: ProjectModelData = normalized.id?.trim()
      ? normalized
      : { ...normalized, id: `${this.projectId}_root` }
    const previousConfigPages = new Map(this.configPagesByPageId)
    this.nodesById.clear()
    this.configPagesByPageId.clear()

    for (const item of flattenProjectNavigationRoot(normalizedRoot)) {
      const descriptionContext = this.readDescriptionContextForNode(item.node, item.pid)
      const pageId = resolvePageNodePageId(item.node)
      const reusablePage = (pageId
        ? previousConfigPages.get(pageId) ?? null
        : null) as TNode | null
      const model = reusablePage ?? this.createNodeModel(item.node, item.pid, descriptionContext)
      model.rebindNavigationNode(item.node, item.pid, descriptionContext)
      this.nodesById.set(model.id, model)
      if (isProjectConfigPageNodeModel(model)) {
        this.configPagesByPageId.set(model.pageId, model)
      }
    }

    this.rebuildNavigationIndex()
    return this.navigationRoot
  }
  replaceProjectInfo(project: ProjectInfoInput): ProjectInfo {
    const projectId = project.projectId?.trim()
    if (projectId !== undefined && projectId !== '' && projectId !== this.projectId) {
      throw new Error(`项目 ID 不匹配: ${projectId} != ${this.projectId}`)
    }
    if (project.tenantId !== undefined) this.tenantIdValue = project.tenantId.trim()
    if (project.name !== undefined) {
      const name = project.name.trim()
      this.projectName = name || this.projectId
    }
    if (project.projectType !== undefined) {
      const projectType = project.projectType.trim()
      this.projectTypeValue = projectType || 'app'
    }
    if (project.icon !== undefined) this.projectIcon = project.icon.trim() || undefined
    if (project.description !== undefined) this.projectDescriptionValue = project.description
    if (project.homeNodeId !== undefined) this.projectHomeNodeId = project.homeNodeId.trim() || undefined
    if (project.order !== undefined) this.projectOrder = project.order
    if (project.createdAt !== undefined) this.projectCreatedAt = project.createdAt
    if (project.updatedAt !== undefined) this.projectUpdatedAt = project.updatedAt
    return this.projectInfo
  }
  replaceNavigationChildren(children: ProjectNodeData[]): ProjectModelData {
    return this.replaceRoot(buildNavRoot(children, this.navigationRoot))
  }

  /**
   * 设置当前选中的导航节点 ID。
   *
   * - 传入 null 或空字符串将清除选中。
   * - 传入不存在的节点 ID 时默认 fail-fast；可通过 options.silentIfMissing 允许静默清空。
   */
  setSelectedNodeId(nodeId: string | null | undefined, options?: { silentIfMissing?: boolean }): void {
    const normalized = nodeId?.trim() ?? ''
    if (!normalized) {
      this.editorState.selectedNodeId = null
      return
    }
    const exists = this.findNodeById(normalized)
    if (!exists) {
      if (options?.silentIfMissing === true) {
        this.editorState.selectedNodeId = null
        return
      }
      throw new Error(`项目节点未找到: ${normalized}`)
    }
    this.editorState.selectedNodeId = normalized
  }

  /**
   * 设置当前活动配置页 ID。
   *
   * - 传入 null 或空字符串将清除活动页并关闭对应配置页节点。
   * - 传入不存在的 pageId 将 fail-fast。
   */
  setActivePageId(pageId: string | null | undefined): void {
    const normalized = pageId?.trim() ?? ''
    if (!normalized) {
      this.clearActivePage()
      return
    }
    const existing = this.findConfigPageByPageId(normalized)
    if (!existing) {
      throw new Error(`配置页面节点未找到: ${normalized}`)
    }
    this.editorState.activePageId = normalized
  }

  /**
   * 清除当前活动配置页，并关闭该页对应的 ConfigPageNode。
   */
  clearActivePage(): void {
    const activePageId = this.editorState.activePageId
    this.editorState.activePageId = null
    if (activePageId) {
      this.closeConfigPage(activePageId)
    }
  }

  /**
   * 标记导航编辑为 dirty。
   */
  markNavigationDirty(scope: ProjectModelEditorNavigationDirtyScope): void {
    this.editorState.navigationDirty = true
    this.editorState.navigationDirtyScope = scope === 'root'
      ? 'root'
      : (this.editorState.navigationDirtyScope ?? 'node')
  }

  /**
   * 清除导航 dirty 状态和编辑范围。
   */
  markNavigationClean(): void {
    this.editorState.navigationDirty = false
    this.editorState.navigationDirtyScope = null
  }

  /**
   * 按节点 ID 查找并返回项目节点模型；找不到返回 null。
   */
  findNodeById(nodeId: string): TNode | null { return this.nodesById.get(nodeId.trim()) ?? null }
  findNodeLocation(nodeId: string): ProjectNodeLocation | null {
    return this.navigationIndex.findNodeLocation(nodeId)
  }
  findConfigPageByPageId(pageId: string): ConfigPageNode | null { return this.configPagesByPageId.get(pageId.trim()) ?? null }

  /**
   * 按 pageId 获取或实例化配置页面节点。
   *
   * pageId 会进入 ConfigPageNode 构造参数；ConfigPageNode 构造时同步实例化 rule、dataSet、script、style 四个子模型。
   */
  openConfigPage(pageId: string): ConfigPageNode {
    const normalized = pageId.trim()
    if (!normalized) {
      throw new Error('pageId 不能为空')
    }
    const existing = this.findConfigPageByPageId(normalized)
    if (existing) return existing
    const node: ProjectNodeData = {
      id: normalized,
      title: normalized,
      nodeKind: 'page',
      path: `/${normalized}`,
      icon: 'Document',
    }
    const model = this.createNodeModel(node, '', this.readDescriptionContextForNode(node, ''))
    if (!isProjectConfigPageNodeModel(model)) {
      throw new Error(`节点 ${normalized} 不是配置页面节点`)
    }
    this.configPagesByPageId.set(model.pageId, model)
    return model
  }
  closeConfigPage(pageId: string): void {
    const normalized = pageId.trim()
    if (!normalized) return
    const page = this.findConfigPageByPageId(normalized)
    if (!page) return
    this.configPagesByPageId.delete(page.pageId)
    if (this.editorState.activePageId === normalized) {
      this.editorState.activePageId = null
    }
  }

  /**
   * 读取当前项目所有配置页面的概要列表（pageId、路径、标题、描述）。
   */
  readPageSummaries(): ProjectPageNodeSummary[] {
    const summaries = buildProjectPageSummaries(this.navigationIndex.buildTree(), {
      descriptionContext: this.readProjectDescriptionContext(),
    })
    const seen = new Set(summaries.map((summary) => summary.pageId))
    for (const page of this.configPagesByPageId.values()) {
      if (seen.has(page.pageId)) continue
      summaries.push(page.toSummary())
    }
    return summaries
  }

  /**
   * 在项目根节点下新建一个模块节点并返回其数据。
   */
  addRootModule(createId: () => string): ProjectNodeData {
    const node = createRootModuleNode(createId)
    const root = this.ensureRootNode()
    node.order = this.nextChildOrder(root.id)
    this.insertNode(node, root.id)
    return node
  }

  /**
   * 在指定父节点下新建一个配置页面节点并返回其数据；parent 为 null 时挂在根下。
   */
  addChildPage(createId: () => string, parent: ProjectNodeData | null = null): ProjectNodeData {
    const node = createChildPageNode(createId)
    const pid = parent?.id ?? this.ensureRootNode().id
    node.order = this.nextChildOrder(pid)
    this.insertNode(node, pid)
    return node
  }

  /**
   * 移除指定 nodeId 的节点及其所有子孙，返回被移除节点数据；节点不存在则 throw。
   */
  removeNode(nodeId: string): ProjectNodeData | null {
    const normalized = nodeId.trim()
    if (!normalized) {
      throw new Error('nodeId 不能为空')
    }
    const model = this.findNodeById(normalized)
    if (!model) {
      throw new Error(`项目节点未找到: ${normalized}`)
    }
    const removed = model.toNodeData()
    const descendants = this.navigationIndex.collectDescendants(normalized)
    for (const child of descendants) {
      this.removeModel(child)
    }
    this.removeModel(model)
    this.rebuildNavigationIndex()

    // 保持 editor.selectedNodeId / activePageId 与当前导航 + 配置页集合一致。
    const selectedNodeId = this.editorState.selectedNodeId
    if (selectedNodeId && !this.findNodeById(selectedNodeId)) {
      this.editorState.selectedNodeId = null
    }
    const activePageId = this.editorState.activePageId
    if (activePageId && !this.findConfigPageByPageId(activePageId)) {
      this.editorState.activePageId = null
    }

    return removed
  }
  refreshNavRefs(): void {
    this.rebindDescriptionContext()
  }
  toTree(): ProjectNodeData[] {
    return this.navigationIndex.buildTree()
  }

  private rebuildNavigationIndex(): void {
    this.navigationIndex.rebuild()
    this.navigationRootCache = null
  }

  private invalidateNavigationCaches(): void {
    this.navigationIndex.invalidateTree()
    this.navigationRootCache = null
  }

  private ensureRootNode(): TNode {
    const existing = this.rootNode
    if (existing) return existing
    throw new Error('导航 root 节点未加载')
  }

  private createNodeModel(
    node: ProjectNodeData,
    pid: string,
    descriptionContext: readonly ProjectDescriptionContext[],
  ): TNode {
    return createProjectNodeModel({
      node,
      pid,
      descriptionContext,
      fileApi: this.fileApi,
      fileCache: this.fileCache,
      contentLoaderFactory: this.contentLoaderFactory,
    }) as TNode
  }

  private insertNode(node: ProjectNodeData, pid: string): TNode {
    if (this.nodesById.has(node.id)) {
      throw new Error(`项目节点已存在: ${node.id}`)
    }
    const model = this.createNodeModel(node, pid, this.readDescriptionContextForNode(node, pid))
    this.nodesById.set(model.id, model)
    if (isProjectConfigPageNodeModel(model)) {
      this.configPagesByPageId.set(model.pageId, model)
    }
    this.rebuildNavigationIndex()
    return model
  }

  private removeModel(model: TNode): void {
    this.nodesById.delete(model.id)
    if (isProjectConfigPageNodeModel(model)) {
      this.configPagesByPageId.delete(model.pageId)
    }
  }

  private readChildNodes(pid: string): TNode[] {
    return [...this.navigationIndex.getChildren(pid)]
  }

  private readChildNodeData(pid: string): ProjectNodeData[] {
    return this.readChildNodes(pid).map((node) => {
      const data = { ...node.toNodeData() }
      const children = this.readChildNodeData(node.id)
      if (children.length > 0) data.children = children
      else delete data.children
      return data
    })
  }

  private nextChildOrder(pid: string): number {
    return this.navigationIndex.nextChildOrder(pid)
  }

  private rebindDescriptionContext(): void {
    const projectContext = this.readProjectDescriptionContext()
    const visit = (parentId: string, parentContext: ProjectDescriptionContext[]): void => {
      for (const model of this.navigationIndex.getChildren(parentId)) {
        const node = model.toNodeData()
        const context = appendProjectDescriptionContext(parentContext, node)
        model.rebindNavigationNode(node, model.pid, context)
        visit(model.id, context)
      }
    }
    visit('', projectContext)
    this.invalidateNavigationCaches()
  }

  private readDescriptionContextForNode(node: ProjectNodeData, pid: string): ProjectDescriptionContext[] {
    let context = this.readProjectDescriptionContext()
    const ancestors = this.readAncestorNodes(pid)
    for (const ancestor of ancestors) {
      context = appendProjectDescriptionContext(context, ancestor)
    }
    return appendProjectDescriptionContext(context, node)
  }

  private readProjectDescriptionContext(): ProjectDescriptionContext[] {
    const description = this.description
    if (!description) return []
    return [{
      nodeId: this.projectId,
      title: this.name || this.projectId,
      nodeKind: 'project',
      description,
    }]
  }

  private readAncestorNodes(pid: string): ProjectNodeData[] {
    const ancestors: ProjectNodeData[] = []
    let currentPid = pid
    while (currentPid) {
      const current = this.findNodeById(currentPid)
      if (!current) break
      ancestors.unshift(current.toNodeData())
      currentPid = current.pid
    }
    return ancestors
  }
}

function createProjectNodeModel(options: ProjectConfigPageNodeModelOptions): ProjectNode {
  const nodeKind = options.node.nodeKind ?? 'page'
  if (isConfigNodeKind(nodeKind)) return new ConfigPageNode(options)
  return new ProjectNode(options)
}

function isProjectConfigPageNodeModel(node: ProjectNode | null | undefined): node is ConfigPageNode {
  return node instanceof ConfigPageNode
}
