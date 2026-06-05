/**
 * ProjectDesign — 项目设计内容聚合（NavigationDesign + 配置页 Map）。
 */
import type {
  ProjectDescriptionContext,
  ProjectModelData,
  ProjectNodeData,
  ProjectNodeLocation,
  ProjectPageNodeSummary,
} from '../navigation/node'
import type { ProjectNode } from '../navigation/node'
import type { ConfigPageNode } from '../page/config-page'
import type { PageFileCache, PageFileContentLoader, PageFileWriter } from '../page/file'
import {
  appendProjectDescriptionContext,
  buildNavRoot,
  buildProjectPageSummaries,
  createChildPageNode,
  createRootModuleNode,
  flattenProjectNavigationRoot,
  normalizeNavRoot,
  resolvePageNodePageId,
} from '../navigation/helpers'
import { createProjectNodeModel, isConfigPageNode } from '../navigation/factory'
import { NavigationIndex } from '../navigation/index'
import type { ProjectInfo, ProjectInfoInput, ProjectModelOptions } from './types'

export type { ProjectInfo, ProjectInfoInput } from './types'

export type NavigationDesignHost = {
  readonly projectId: string
  getName(): string
  getDescription(): string
  readonly fileApi: PageFileWriter
  readonly fileCache: PageFileCache
  readonly contentLoaderFactory: () => PageFileContentLoader
  readonly configPagesByPageId: Map<string, ConfigPageNode>
}

/** 导航设计：持有 nodesById、NavigationIndex 与导航 CRUD。 */
export class NavigationDesign<TNode extends ProjectNode = ProjectNode> {
  private readonly nodesById = new Map<string, TNode>()
  private readonly navigationIndex: NavigationIndex<TNode>
  private navigationRootCache: ProjectModelData | null = null

  constructor(private readonly host: NavigationDesignHost) {
    this.navigationIndex = new NavigationIndex(this.nodesById)
  }

  get rootNode(): TNode | null {
    return this.getChildNodes('')[0] ?? null
  }

  get navigationRoot(): ProjectModelData {
    if (this.navigationRootCache) return this.navigationRootCache
    const root = this.rootNode?.toNodeData()
    if (root === undefined) {
      this.navigationRootCache = buildNavRoot([], {
        title: this.host.getName(),
        childPlacement: 'header',
        nodeKind: 'module',
      })
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

  getChildNodes(nodeId = ''): TNode[] {
    return this.readChildNodes(nodeId)
  }

  get flatRows(): TNode[] {
    return [...this.nodesById.values()]
  }

  forEachNode(callback: (node: TNode) => void): void {
    for (const node of this.nodesById.values()) callback(node)
  }

  findNodeById(nodeId: string): TNode | null {
    return this.nodesById.get(nodeId.trim()) ?? null
  }

  findNodeLocation(nodeId: string): ProjectNodeLocation | null {
    return this.navigationIndex.findNodeLocation(nodeId)
  }

  replaceRoot(root: ProjectModelData): ProjectModelData {
    const normalized = normalizeNavRoot(root)
    const normalizedRoot: ProjectModelData = normalized.id?.trim()
      ? normalized
      : { ...normalized, id: `${this.host.projectId}_root` }
    const previousConfigPages = new Map(this.host.configPagesByPageId)
    this.nodesById.clear()
    this.host.configPagesByPageId.clear()

    for (const item of flattenProjectNavigationRoot(normalizedRoot)) {
      const descriptionContext = this.readDescriptionContextForNode(item.node, item.pid)
      const pageId = resolvePageNodePageId(item.node)
      const reusablePage = (pageId ? previousConfigPages.get(pageId) ?? null : null) as TNode | null
      const model = reusablePage ?? this.createNodeModel(item.node, item.pid, descriptionContext)
      model.rebindNavigationNode(item.node, item.pid, descriptionContext)
      this.nodesById.set(model.id, model)
      if (isConfigPageNode(model)) {
        this.host.configPagesByPageId.set(model.pageId, model)
      }
    }

    this.rebuildNavigationIndex()
    return this.navigationRoot
  }

  replaceNavigationChildren(children: ProjectNodeData[]): ProjectModelData {
    return this.replaceRoot(buildNavRoot(children, this.navigationRoot))
  }

  addRootModule(createId: () => string): ProjectNodeData {
    const node = createRootModuleNode(createId)
    const root = this.ensureRootNode()
    node.order = this.nextChildOrder(root.id)
    this.insertNode(node, root.id)
    return node
  }

  addChildPage(createId: () => string, parent: ProjectNodeData | null = null): ProjectNodeData {
    const node = createChildPageNode(createId)
    const pid = parent?.id ?? this.ensureRootNode().id
    node.order = this.nextChildOrder(pid)
    this.insertNode(node, pid)
    return node
  }

  removeNode(nodeId: string): ProjectNodeData | null {
    const normalized = nodeId.trim()
    if (!normalized) throw new Error('nodeId 不能为空')
    const model = this.findNodeById(normalized)
    if (!model) throw new Error(`项目节点未找到: ${normalized}`)
    const removed = model.toNodeData()
    const descendants = this.navigationIndex.collectDescendants(normalized)
    for (const child of descendants) this.removeModel(child)
    this.removeModel(model)
    this.rebuildNavigationIndex()
    return removed
  }

  refreshNavRefs(): void {
    this.rebindDescriptionContext()
  }

  toTree(): ProjectNodeData[] {
    return this.navigationIndex.buildTree()
  }

  readPageSummariesFromTree(): ProjectPageNodeSummary[] {
    return buildProjectPageSummaries(this.navigationIndex.buildTree(), {
      descriptionContext: this.readProjectDescriptionContext(),
    })
  }

  /** 登记尚未挂载到导航树的配置页节点（仅内存，不入 nodesById）。 */
  createOrphanConfigPageModel(node: ProjectNodeData): ConfigPageNode {
    const model = this.createNodeModel(node, '', this.readDescriptionContextForNode(node, ''))
    if (!isConfigPageNode(model)) {
      throw new Error(`节点 ${node.id} 不是配置页面节点`)
    }
    this.host.configPagesByPageId.set(model.pageId, model)
    return model
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
      fileApi: this.host.fileApi,
      fileCache: this.host.fileCache,
      contentLoaderFactory: this.host.contentLoaderFactory,
    }) as TNode
  }

  private insertNode(node: ProjectNodeData, pid: string): TNode {
    if (this.nodesById.has(node.id)) {
      throw new Error(`项目节点已存在: ${node.id}`)
    }
    const model = this.createNodeModel(node, pid, this.readDescriptionContextForNode(node, pid))
    this.nodesById.set(model.id, model)
    if (isConfigPageNode(model)) {
      this.host.configPagesByPageId.set(model.pageId, model)
    }
    this.rebuildNavigationIndex()
    return model
  }

  private removeModel(model: TNode): void {
    this.nodesById.delete(model.id)
    if (isConfigPageNode(model)) {
      this.host.configPagesByPageId.delete(model.pageId)
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
    for (const ancestor of this.readAncestorNodes(pid)) {
      context = appendProjectDescriptionContext(context, ancestor)
    }
    return appendProjectDescriptionContext(context, node)
  }

  private readProjectDescriptionContext(): ProjectDescriptionContext[] {
    const description = this.host.getDescription()
    if (!description) return []
    return [{
      nodeId: this.host.projectId,
      title: this.host.getName() || this.host.projectId,
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

/** 项目设计根聚合：项目元数据 + navigation + 配置页缓存。 */
export class ProjectDesign<TNode extends ProjectNode = ProjectNode> {
  readonly navigation: NavigationDesign<TNode>

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
  private readonly configPagesByPageId = new Map<string, ConfigPageNode>()

  constructor(options: ProjectModelOptions) {
    const projectId = options.projectId.trim()
    if (!projectId) throw new Error('projectId 不能为空')
    this.projectIdValue = projectId
    this.projectName = projectId
    this.projectTypeValue = 'app'
    this.projectDescriptionValue = ''
    this.projectOrder = 0
    this.replaceProjectInfo(options.project ?? {})
    this.fileApi = options.fileApi
    this.fileCache = options.fileCache
    this.contentLoaderFactory = options.contentLoaderFactory
    this.navigation = new NavigationDesign<TNode>({
      projectId: this.projectIdValue,
      getName: () => this.projectName,
      getDescription: () => this.description,
      fileApi: this.fileApi,
      fileCache: this.fileCache,
      contentLoaderFactory: this.contentLoaderFactory,
      configPagesByPageId: this.configPagesByPageId,
    })
  }

  get projectId(): string { return this.projectIdValue }
  get tenantId(): string | undefined { return this.tenantIdValue }
  get name(): string { return this.projectName }
  get projectType(): string { return this.projectTypeValue }
  get icon(): string | undefined { return this.projectIcon }
  get description(): string { return this.projectDescriptionValue.trim() }
  get homeNodeId(): string | undefined { return this.projectHomeNodeId }
  get homeNode(): TNode | null {
    return this.homeNodeId === undefined ? null : this.navigation.findNodeById(this.homeNodeId)
  }
  get rootNode(): TNode | null { return this.navigation.rootNode }
  get order(): number { return this.projectOrder }
  get createdAt(): string | undefined { return this.projectCreatedAt }
  get updatedAt(): string | undefined { return this.projectUpdatedAt }

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

  get navigationRoot(): ProjectModelData { return this.navigation.navigationRoot }
  get pages(): Iterable<ConfigPageNode> { return this.configPagesByPageId.values() }

  getChildNodes(nodeId = ''): TNode[] { return this.navigation.getChildNodes(nodeId) }
  get flatRows(): TNode[] { return this.navigation.flatRows }
  forEachNode(callback: (node: TNode) => void): void { this.navigation.forEachNode(callback) }

  replaceRoot(root: ProjectModelData): ProjectModelData { return this.navigation.replaceRoot(root) }
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
      this.projectTypeValue = project.projectType.trim() || 'app'
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
    return this.navigation.replaceNavigationChildren(children)
  }

  findNodeById(nodeId: string): TNode | null { return this.navigation.findNodeById(nodeId) }
  findNodeLocation(nodeId: string): ProjectNodeLocation | null {
    return this.navigation.findNodeLocation(nodeId)
  }

  findConfigPageByPageId(pageId: string): ConfigPageNode | null {
    return this.configPagesByPageId.get(pageId.trim()) ?? null
  }

  openConfigPage(pageId: string): ConfigPageNode {
    const normalized = pageId.trim()
    if (!normalized) throw new Error('pageId 不能为空')
    const existing = this.findConfigPageByPageId(normalized)
    if (existing) return existing
    const node: ProjectNodeData = {
      id: normalized,
      title: normalized,
      nodeKind: 'page',
      path: `/${normalized}`,
      icon: 'Document',
    }
    return this.navigation.createOrphanConfigPageModel(node)
  }

  closeConfigPage(pageId: string): void {
    const normalized = pageId.trim()
    if (!normalized) return
    const page = this.findConfigPageByPageId(normalized)
    if (!page) return
    this.configPagesByPageId.delete(page.pageId)
  }

  readPageSummaries(): ProjectPageNodeSummary[] {
    const summaries = this.navigation.readPageSummariesFromTree()
    const seen = new Set(summaries.map((summary) => summary.pageId))
    for (const page of this.configPagesByPageId.values()) {
      if (seen.has(page.pageId)) continue
      summaries.push(page.toSummary())
    }
    return summaries
  }

  addRootModule(createId: () => string): ProjectNodeData { return this.navigation.addRootModule(createId) }
  addChildPage(createId: () => string, parent: ProjectNodeData | null = null): ProjectNodeData {
    return this.navigation.addChildPage(createId, parent)
  }
  removeNode(nodeId: string): ProjectNodeData | null { return this.navigation.removeNode(nodeId) }
  refreshNavRefs(): void { this.navigation.refreshNavRefs() }
  toTree(): ProjectNodeData[] { return this.navigation.toTree() }
}
