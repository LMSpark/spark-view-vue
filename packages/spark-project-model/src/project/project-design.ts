/**
 * ProjectDesign — 项目设计内容聚合（NavigationDesign + 配置页 Map）。
 */
import type {
  ProjectDescriptionContext,
  ProjectModelData,
  ProjectNodeData,
  ProjectNodeLocation,
  ProjectPageNodeSummary,
} from '../navigation/project-node'
import type { ProjectNode } from '../navigation/project-node'
import type {
  NavigationNodeDraftApplyResult,
  NavigationNodeDraft,
} from '../navigation/navigation-edit'
import type { ConfigPageNode } from '../page/config-page'
import {
  appendProjectDescriptionContext,
  buildNavRoot,
  buildProjectPageSummaries,
  flattenProjectNavigationRoot,
  normalizeNavRoot,
  resolvePageNodePageId,
} from '../navigation/navigation-tree'
import { instantiateProjectNode, isConfigPageNode } from '../page/instantiate-project-node'
import { applyNavigationNodeDraftToNode } from '../navigation/navigation-edit'
import { NavigationIndex } from '../navigation/navigation-tree'
import type { ProjectInfo, ProjectInfoInput, ProjectModelInitOptions } from './project-types'

export type { ProjectInfo, ProjectInfoInput } from './project-types'

export type NavigationDesignEditResult<TNode extends ProjectNode = ProjectNode> = {
  node: TNode
  result: NavigationNodeDraftApplyResult
}

export type NavigationDesignOwner = {
  readonly projectId: string
  getName(): string
  getDescription(): string
  readonly configPagesByPageId: Map<string, ConfigPageNode>
}

/** 导航设计：持有 nodesById、NavigationIndex 与导航 CRUD。 */
export class NavigationDesign<TNode extends ProjectNode = ProjectNode> {
  private readonly nodesById = new Map<string, TNode>()
  private readonly navigationIndex: NavigationIndex<TNode>
  private navigationRootCache: ProjectModelData | null = null

  constructor(private readonly owner: NavigationDesignOwner) {
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
        title: this.owner.getName(),
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

  replaceNavigationRoot(root: ProjectModelData): ProjectModelData {
    const normalized = normalizeNavRoot(root)
    const normalizedRoot: ProjectModelData = normalized.id?.trim()
      ? normalized
      : { ...normalized, id: `${this.owner.projectId}_root` }
    const previousConfigPages = new Map(this.owner.configPagesByPageId)
    this.nodesById.clear()
    this.owner.configPagesByPageId.clear()

    for (const item of flattenProjectNavigationRoot(normalizedRoot)) {
      const descriptionContext = this.readDescriptionContextForNode(item.node, item.pid)
      const pageId = resolvePageNodePageId(item.node)
      const reusablePage = (pageId ? previousConfigPages.get(pageId) ?? null : null) as TNode | null
      const model = reusablePage ?? this.instantiateNode(item.node, item.pid, descriptionContext)
      model.rebindNavigationNode(item.node, item.pid, descriptionContext)
      this.nodesById.set(model.id, model)
      if (isConfigPageNode(model)) {
        this.owner.configPagesByPageId.set(model.pageId, model)
      }
    }

    this.rebuildNavigationIndex()
    return this.navigationRoot
  }

  replaceNavigationChildren(children: ProjectNodeData[]): ProjectModelData {
    return this.replaceNavigationRoot(buildNavRoot(children, this.navigationRoot))
  }

  addRootModule(createId: () => string): ProjectNodeData {
    const node: ProjectNodeData = {
      id: createId(),
      nodeKind: 'module',
      title: '新模块',
      icon: 'FolderOpened',
      childPlacement: 'sidebar',
      children: [],
    }
    const root = this.ensureRootNode()
    node.order = this.nextChildOrder(root.id)
    this.insertNode(node, root.id)
    return node
  }

  addChildPage(createId: () => string, parent: ProjectNodeData | null = null): ProjectNodeData {
    const id = createId()
    const node: ProjectNodeData = {
      id,
      nodeKind: 'page',
      title: '新页面',
      icon: 'Document',
      path: `/${id}`,
    }
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

  applyNavigationNodeEdit(input: NavigationNodeDraft): NavigationDesignEditResult<TNode> {
    const nodeId = input.node.id.trim()
    if (!nodeId) throw new Error('nodeId 不能为空')
    const model = this.findNodeById(nodeId)
    if (!model) throw new Error(`项目节点未找到: ${nodeId}`)
    const result = applyNavigationNodeDraftToNode(model, input)
    this.rebuildNavigationIndex()
    this.rebindDescriptionContext()
    return { node: model, result }
  }

  /** 打开尚未挂载到导航树的配置页节点（仅内存，不入 nodesById）。 */
  openDetachedConfigPage(node: ProjectNodeData): ConfigPageNode {
    const model = this.instantiateNode(node, '', this.readDescriptionContextForNode(node, ''))
    if (!isConfigPageNode(model)) {
      throw new Error(`节点 ${node.id} 不是配置页面节点`)
    }
    this.owner.configPagesByPageId.set(model.pageId, model)
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

  private instantiateNode(
    node: ProjectNodeData,
    pid: string,
    descriptionContext: readonly ProjectDescriptionContext[],
  ): TNode {
    return instantiateProjectNode({ node, pid, descriptionContext }) as TNode
  }

  private insertNode(node: ProjectNodeData, pid: string): TNode {
    if (this.nodesById.has(node.id)) {
      throw new Error(`项目节点已存在: ${node.id}`)
    }
    const model = this.instantiateNode(node, pid, this.readDescriptionContextForNode(node, pid))
    this.nodesById.set(model.id, model)
    if (isConfigPageNode(model)) {
      this.owner.configPagesByPageId.set(model.pageId, model)
    }
    this.rebuildNavigationIndex()
    return model
  }

  private removeModel(model: TNode): void {
    this.nodesById.delete(model.id)
    if (isConfigPageNode(model)) {
      this.owner.configPagesByPageId.delete(model.pageId)
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
    const description = this.owner.getDescription()
    if (!description) return []
    return [{
      nodeId: this.owner.projectId,
      title: this.owner.getName() || this.owner.projectId,
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
  private readonly configPagesByPageId = new Map<string, ConfigPageNode>()

  constructor(options: ProjectModelInitOptions) {
    const projectId = options.projectId.trim()
    if (!projectId) throw new Error('projectId 不能为空')
    this.projectIdValue = projectId
    this.projectName = projectId
    this.projectTypeValue = 'app'
    this.projectDescriptionValue = ''
    this.projectOrder = 0
    this.replaceProjectInfo(options.project ?? {})
    this.navigation = new NavigationDesign<TNode>({
      projectId: this.projectIdValue,
      getName: () => this.projectName,
      getDescription: () => this.description,
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

  replaceNavigationRoot(root: ProjectModelData): ProjectModelData { return this.navigation.replaceNavigationRoot(root) }
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

  applyNavigationNodeEdit(input: NavigationNodeDraft): NavigationDesignEditResult<TNode> {
    return this.navigation.applyNavigationNodeEdit(input)
  }

  openPageDesign(pageId: string): ConfigPageNode {
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
    return this.navigation.openDetachedConfigPage(node)
  }

  closePageDesign(pageId: string): void {
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
