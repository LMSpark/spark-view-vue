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
} from './node'
import {
  ConfigPageNode,
  type ProjectConfigPageNodeModelOptions,
} from './config-page'
import type { PageFileCache, PageFileContentLoader, PageFileWriter } from './page-file'
import {
  appendProjectDescriptionContext,
  buildProjectNavigationTree,
  buildNavRoot,
  createChildPageNode,
  createRootModuleNode,
  findNodeLocation,
  flattenProjectNavigationRoot,
  isConfigNodeKind,
  normalizeNavRoot,
  resolvePageNodePageId,
} from './node-helpers'

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
 * 持有项目导航编辑会话和配置页节点，是 page-design VCM 的项目级模型根。
 *
 * @moduleAbility pageDesign.project
 * @moduleKind project
 * @moduleName Page Design Project
 * @moduleDescription 当前项目模型，作为 VCM 根能力按 pageId 定位或实例化配置页面节点。
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
  private readonly detachedConfigPagesByPageId = new Map<string, ConfigPageNode>()

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
    const root = this.rootNode?.toNodeData()
    if (root === undefined) {
      return buildNavRoot([], { title: this.name, childPlacement: 'header', nodeKind: 'module' })
    }
    const { id, nodeKind, title, childPlacement, children: _children, ...rest } = root
    return buildNavRoot(this.readChildNodeData(id), {
      id,
      nodeKind: nodeKind === 'system-directory' ? 'system-directory' : 'module',
      title,
      childPlacement: childPlacement === 'sidebar' ? 'sidebar' : 'header',
      ...rest,
    })
  }

  /** @deprecated root 只保留为旧导航树 DTO 名称；新代码使用 navigationRoot。 */
  get root(): ProjectModelData { return this.navigationRoot }

  /** @vcmIgnore */
  getChildNodes(nodeId = ''): TNode[] { return this.readChildNodes(nodeId) }

  /**
   * 当前项目节点的平铺投影；ProjectNode 直接携带 nodeId、pid、order 等 DB 平铺字段。
   */
  get flatRows(): TNode[] { return [...this.nodesById.values()] }

  /** @vcmIgnore */
  replaceRoot(root: ProjectModelData): ProjectModelData {
    const normalizedRoot = normalizeNavRoot(root)
    const previousConfigPages = new Map(this.configPagesByPageId)
    const previousDetachedPages = new Map(this.detachedConfigPagesByPageId)
    this.nodesById.clear()
    this.configPagesByPageId.clear()

    for (const item of flattenProjectNavigationRoot(normalizedRoot)) {
      const descriptionContext = this.readDescriptionContextForNode(item.node, item.pid)
      const pageId = resolvePageNodePageId(item.node)
      const reusablePage = (pageId
        ? previousConfigPages.get(pageId) ?? previousDetachedPages.get(pageId) ?? null
        : null) as TNode | null
      const model = reusablePage ?? this.createNodeModel(item.node, item.pid, descriptionContext)
      model.rebindNavigationNode(item.node, item.pid, descriptionContext)
      this.nodesById.set(model.id, model)
      if (isProjectConfigPageNodeModel(model)) {
        this.configPagesByPageId.set(model.pageId, model)
        this.detachedConfigPagesByPageId.delete(model.pageId)
      }
    }

    for (const [pageId, page] of previousDetachedPages) {
      if (!this.configPagesByPageId.has(pageId)) {
        this.detachedConfigPagesByPageId.set(pageId, page)
        this.configPagesByPageId.set(pageId, page)
      }
    }
    return this.navigationRoot
  }

  /** @vcmIgnore */
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

  /** @vcmIgnore */
  replaceNavigationChildren(children: ProjectNodeData[]): ProjectModelData {
    return this.replaceRoot(buildNavRoot(children, this.navigationRoot))
  }

  /**
   * 按节点 ID 查找并返回项目节点模型；找不到返回 null。
   */
  findNodeById(nodeId: string): TNode | null { return this.nodesById.get(nodeId.trim()) ?? null }

  /** @vcmIgnore */
  findNodeLocation(nodeId: string): ProjectNodeLocation | null { return findNodeLocation(this.toTree(), nodeId) }

  /** @vcmIgnore */
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
    model.navigation.navNode = null
    this.configPagesByPageId.set(model.pageId, model)
    this.detachedConfigPagesByPageId.set(model.pageId, model)
    return model
  }

  /** @vcmIgnore */
  closeConfigPage(pageId: string): void {
    const page = this.findConfigPageByPageId(pageId)
    if (!page) return
    if (!this.detachedConfigPagesByPageId.has(page.pageId)) return
    this.detachedConfigPagesByPageId.delete(page.pageId)
    this.configPagesByPageId.delete(page.pageId)
  }

  /**
   * 读取当前项目所有配置页面的概要列表（pageId、路径、标题、描述）。
   */
  readPageSummaries(): ProjectPageNodeSummary[] {
    const summaries: ProjectPageNodeSummary[] = []
    const seen = new Set<string>()
    for (const node of this.flatRows) {
      if (!isProjectConfigPageNodeModel(node) || seen.has(node.pageId)) continue
      seen.add(node.pageId)
      summaries.push(node.toSummary())
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
    for (const child of this.collectDescendants(normalized)) {
      this.removeModel(child)
    }
    this.removeModel(model)
    return removed
  }

  /** @vcmIgnore */
  refreshNavRefs(): void {
    this.rebindDescriptionContext()
  }

  /** @vcmIgnore */
  toTree(): ProjectNodeData[] {
    return buildProjectNavigationTree(this.flatRows)
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
    return model
  }

  private removeModel(model: TNode): void {
    this.nodesById.delete(model.id)
    if (isProjectConfigPageNodeModel(model)) {
      this.configPagesByPageId.delete(model.pageId)
    }
  }

  private collectDescendants(nodeId: string): TNode[] {
    const result: TNode[] = []
    for (const node of this.flatRows) {
      if (node.pid !== nodeId) continue
      result.push(node, ...this.collectDescendants(node.id))
    }
    return result
  }

  private readChildNodes(pid: string): TNode[] {
    const normalizedPid = pid.trim()
    return this.flatRows
      .filter(node => node.pid === normalizedPid)
      .sort(compareProjectNodes)
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
    const normalizedPid = pid.trim()
    const siblings = this.flatRows.filter(node => node.pid === normalizedPid)
    return siblings.reduce((max, node) => Math.max(max, node.order), -1) + 1
  }

  private rebindDescriptionContext(): void {
    for (const model of this.flatRows) {
      const node = model.toNodeData()
      model.rebindNavigationNode(node, model.pid, this.readDescriptionContextForNode(node, model.pid))
    }
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

function compareProjectNodes(a: ProjectNode, b: ProjectNode): number {
  return a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id)
}

function createProjectNodeModel(options: ProjectConfigPageNodeModelOptions): ProjectNode {
  const nodeKind = options.node.nodeKind ?? 'page'
  if (isConfigNodeKind(nodeKind)) return new ConfigPageNode(options)
  return new ProjectNode(options)
}

function isProjectConfigPageNodeModel(node: ProjectNode | null | undefined): node is ConfigPageNode {
  return node instanceof ConfigPageNode
}
