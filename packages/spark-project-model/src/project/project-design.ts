/**
 * @module @spark-appworks/spark-project-model:project/project-design
 * 职责：提供项目模型和页面配置域中的 project design 能力，支撑 navigation、page content、project session 或远程 IO。
 * 边界：只描述配置和项目结构，不渲染 Vue 组件，也不直接操作 spark-data 运行态。
 * AI用途：读取、生成或同步项目页面配置时，用本模块确认项目模型字段和 IO 边界。
 */
/**
 * ProjectDesign — 项目设计内容：元数据 + 节点树 + 配置页 Map。
 */
import type {
  ProjectNode,
  ProjectDescriptionContext,
  ProjectModelData,
  ProjectNodeData,
  ProjectNodeLocation,
  ProjectPageNodeSummary,
} from '../navigation/project-node'
import type {
  NavigationNodeDraftApplyResult,
  NavigationNodeDraft,
} from '../navigation/navigation-edit'
import { applyNavigationNodeDraftToNode } from '../navigation/navigation-edit'
import type { ConfigPageNode } from '../page/config-page'
import {
  appendProjectDescriptionContext,
  buildNavRoot,
  buildProjectPageSummaries,
  flattenProjectNavigationRoot,
  normalizeNavRoot,
  resolvePageNodePageId,
} from '../navigation/navigation-tree'
import { NavigationIndex } from '../navigation/navigation-index'
import { instantiateProjectNode, isConfigPageNode } from '../page/instantiate-project-node'
import type { ProjectInfo, ProjectInfoInput, ProjectModelInitOptions } from './project-types'

export type { ProjectInfo, ProjectInfoInput } from './project-types'

/** Project Design Node Edit Result 的返回结果。 */
export type ProjectDesignNodeEditResult<TNode extends ProjectNode = ProjectNode> = {
    /** node 字段。 */
node: TNode
    /** 操作结果。 */
result: NavigationNodeDraftApplyResult
}

/**
 * 项目设计根：项目元数据、导航节点树与配置页缓存。
 */
export class ProjectDesign<TNode extends ProjectNode = ProjectNode> {
  private readonly projectIdValue: string
  private tenantIdValue: string | undefined
  private projectName: string
  private projectTypeValue: string
  private projectIcon: string | undefined
  private projectDescriptionValue: string
  private projectPlanningAttachmentRef: string | undefined
  private projectHomeNodeId: string | undefined
  private projectOrder: number
  private projectCreatedAt: string | undefined
  private projectUpdatedAt: string | undefined
  private readonly configPagesByPageId = new Map<string, ConfigPageNode>()
  private readonly nodesById = new Map<string, TNode>()
  private readonly navigationIndex: NavigationIndex<TNode>
  private navigationRootCache: ProjectModelData | null = null

    /** 创建 Project Design 实例。 */
constructor(options: ProjectModelInitOptions) {
    const projectId = options.projectId.trim()
    if (!projectId) throw new Error('projectId 不能为空')
    this.projectIdValue = projectId
    this.projectName = projectId
    this.projectTypeValue = 'app'
    this.projectDescriptionValue = ''
    this.projectOrder = 0
    this.navigationIndex = new NavigationIndex(this.nodesById)
    this.replaceProjectInfo(options.project ?? {})
  }

  get projectId(): string { return this.projectIdValue }
  get tenantId(): string | undefined { return this.tenantIdValue }
  get name(): string { return this.projectName }
  get projectType(): string { return this.projectTypeValue }
  get icon(): string | undefined { return this.projectIcon }
  get description(): string { return this.projectDescriptionValue.trim() }
  get homeNodeId(): string | undefined { return this.projectHomeNodeId }
  get homeNode(): TNode | null {
    return this.homeNodeId === undefined ? null : this.findNodeById(this.homeNodeId)
  }
  get rootNode(): TNode | null {
    return this.getChildNodes('')[0] ?? null
  }
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
      ...(this.projectPlanningAttachmentRef === undefined
        ? {}
        : { planningAttachmentRef: this.projectPlanningAttachmentRef }),
      ...(this.homeNodeId === undefined ? {} : { homeNodeId: this.homeNodeId }),
      order: this.order,
      ...(this.createdAt === undefined ? {} : { createdAt: this.createdAt }),
      ...(this.updatedAt === undefined ? {} : { updatedAt: this.updatedAt }),
    }
  }

  get navigationRoot(): ProjectModelData {
    if (this.navigationRootCache) return this.navigationRootCache
    const root = this.rootNode?.toNodeData()
    if (root === undefined) {
      this.navigationRootCache = buildNavRoot([], {
        title: this.name,
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

  get pages(): Iterable<ConfigPageNode> { return this.configPagesByPageId.values() }

    /** 读取 Child Nodes。 */
getChildNodes(nodeId = ''): TNode[] {
    return this.readChildNodes(nodeId)
  }

  get flatRows(): TNode[] {
    return [...this.nodesById.values()]
  }

    /** 执行 for Each Node 操作。 */
forEachNode(callback: (node: TNode) => void): void {
    for (const node of this.nodesById.values()) callback(node)
  }

    /** 执行 replace Navigation Root 操作。 */
replaceNavigationRoot(root: ProjectModelData): ProjectModelData {
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
      const reusablePage = pageId ? previousConfigPages.get(pageId) : undefined
      const created = reusablePage ?? instantiateProjectNode({
        node: item.node,
        pid: item.pid,
        descriptionContext,
      })
      if (!isProjectDesignNode<TNode>(created)) {
        throw new Error(`项目节点实例化失败: ${item.node.id}`)
      }
      const model = created
      model.rebindNavigationNode(item.node, item.pid, descriptionContext)
      this.nodesById.set(model.id, model)
      if (isConfigPageNode(model)) {
        this.configPagesByPageId.set(model.pageId, model)
      }
    }

    this.rebuildNavigationIndex()
    return this.navigationRoot
  }

    /** 执行 replace Project Info 操作。 */
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
    if (project.planningAttachmentRef !== undefined) {
      const ref = project.planningAttachmentRef.trim()
      this.projectPlanningAttachmentRef = ref.length === 0 ? undefined : ref
    }
    if (project.homeNodeId !== undefined) this.projectHomeNodeId = project.homeNodeId.trim() || undefined
    if (project.order !== undefined) this.projectOrder = project.order
    if (project.createdAt !== undefined) this.projectCreatedAt = project.createdAt
    if (project.updatedAt !== undefined) this.projectUpdatedAt = project.updatedAt
    return this.projectInfo
  }

    /** 执行 replace Navigation Children 操作。 */
replaceNavigationChildren(children: ProjectNodeData[]): ProjectModelData {
    return this.replaceNavigationRoot(buildNavRoot(children, this.navigationRoot))
  }

    /** find Node By Id 标识。 */
findNodeById(nodeId: string): TNode | null {
    return this.nodesById.get(nodeId.trim()) ?? null
  }

    /** 执行 find Node Location 操作。 */
findNodeLocation(nodeId: string): ProjectNodeLocation | null {
    return this.navigationIndex.findNodeLocation(nodeId)
  }

    /** find Config Page By Page Id 标识。 */
findConfigPageByPageId(pageId: string): ConfigPageNode | null {
    return this.configPagesByPageId.get(pageId.trim()) ?? null
  }

    /** 执行 apply Navigation Node Edit 操作。 */
applyNavigationNodeEdit(input: NavigationNodeDraft): ProjectDesignNodeEditResult<TNode> {
    const nodeId = input.node.id.trim()
    if (!nodeId) throw new Error('nodeId 不能为空')
    const model = this.findNodeById(nodeId)
    if (!model) throw new Error(`项目节点未找到: ${nodeId}`)
    const result = applyNavigationNodeDraftToNode(model, input)
    this.rebuildNavigationIndex()
    this.rebindDescriptionContext()
    return { node: model, result }
  }

    /** 执行 open Page Design 操作。 */
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
    return this.openDetachedConfigPage(node)
  }

    /** 执行 close Page Design 操作。 */
closePageDesign(pageId: string): void {
    const normalized = pageId.trim()
    if (!normalized) return
    const page = this.findConfigPageByPageId(normalized)
    if (!page) return
    this.configPagesByPageId.delete(page.pageId)
  }

    /** 读取策划轴投影：各 page/sub-page 的 description 与 descriptionContext。 */
readPlanningProjection(): ProjectPageNodeSummary[] {
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

    /** 执行 add Root Module 操作。 */
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

    /** 执行 add Child Page 操作。 */
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

    /** 删除 Node。 */
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

    /** 执行 refresh Nav Refs 操作。 */
refreshNavRefs(): void {
    this.rebindDescriptionContext()
  }

    /** 执行 to Tree 操作。 */
toTree(): ProjectNodeData[] {
    return this.navigationIndex.buildTree()
  }

  /** 打开尚未挂载到导航树的配置页节点（仅内存，不入 nodesById）。 */
  private openDetachedConfigPage(node: ProjectNodeData): ConfigPageNode {
    const model = this.instantiateNode(node, '', this.readDescriptionContextForNode(node, ''))
    if (!isConfigPageNode(model)) {
      throw new Error(`节点 ${node.id} 不是配置页面节点`)
    }
    this.configPagesByPageId.set(model.pageId, model)
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
    const created = instantiateProjectNode({ node, pid, descriptionContext })
    if (!isProjectDesignNode<TNode>(created)) {
      throw new Error(`项目节点实例化失败: ${node.id}`)
    }
    return created
  }

  private insertNode(node: ProjectNodeData, pid: string): TNode {
    if (this.nodesById.has(node.id)) {
      throw new Error(`项目节点已存在: ${node.id}`)
    }
    const model = this.instantiateNode(node, pid, this.readDescriptionContextForNode(node, pid))
    this.nodesById.set(model.id, model)
    if (isConfigPageNode(model)) {
      this.configPagesByPageId.set(model.pageId, model)
    }
    this.rebuildNavigationIndex()
    return model
  }

  private removeModel(model: TNode): void {
    this.nodesById.delete(model.id)
    if (isConfigPageNode(model)) {
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
    for (const ancestor of this.readAncestorNodes(pid)) {
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

function isProjectDesignNode<TNode extends ProjectNode>(_node: ProjectNode): _node is TNode {
  return true
}

