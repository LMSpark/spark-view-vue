/**
 * Project node collection.
 *
 * 对齐后端 NAVIGATION_NODE_FLAT：平铺保存节点，按节点类型实例化子类。
 * 层级关系只由 pid 表达；需要树时通过 projection 生成 children。
 */

import type { ProjectModelData, ProjectNodeData } from '../node/node-base.entity'
import type { ProjectNodeLocation } from '../navigation/edit.entity'
import type { NavigationEditSession } from '../navigation/session.entity'
import {
  createChildPageNode,
  createRootModuleNode,
  findNodeById,
  findNodeLocation,
} from '../node/node-helpers'
import { NavigationEditSession as DefaultNavigationEditSession } from '../navigation/session.entity'
import type { NavigationNodePatchWriter } from '../navigation/edit.entity'
import type { PageFileCache, PageFileContentLoader, PageFileWriter } from '../node/page-file-types'
import {
  appendProjectDescriptionContext,
  buildProjectNavigationTree,
  createProjectNodeModel,
  flattenProjectNavigationRoot,
  formatProjectDescriptionContext,
  isProjectConfigPageNodeModel,
  projectNavNodeToFlatRow,
  readProjectNodeDescription,
  resolvePageNodePageId,
  type ConfigPageNode,
  type ProjectNavigationFlatNode,
  type ProjectNode,
  type ProjectPageNodeSummary,
  type ProjectDescriptionContext,
} from '../node/node-factory'

export type ProjectNodeCollectionOptions = {
  projectId?: string | undefined
  fileApi: PageFileWriter
  fileCache: PageFileCache
  contentLoaderFactory: () => PageFileContentLoader
  navClient?: NavigationNodePatchWriter | undefined
  navigationSession?: NavigationEditSession | undefined
}

/**
 * 项目节点集合。
 *
 * 管理项目中的平铺节点模型，并按 pageId 获取或实例化配置页面节点。
 *
 * @moduleKind project-node-collection
 * @moduleName Project Node Collection
 * @moduleDescription 当前项目节点集合，负责把 pageId 解析为 ConfigPageNode 子模型。
 * @moduleEntity projectNodes 项目节点集合
 * @moduleScope 当前 ProjectNodeCollection 实例代表一个项目内的节点模型集合。
 * @moduleGuard 进入页面配置编辑前，先用 openConfigPage(pageId) 获取 ConfigPageNode。
 * @moduleMutation project-nodes read-write 节点集合可实例化配置页面节点模型。
 * @moduleActionMode explicit
 */
export class ProjectNodeCollection {
  private readonly fileApi: PageFileWriter
  private readonly fileCache: PageFileCache
  private readonly contentLoaderFactory: () => PageFileContentLoader
  private readonly navClient: NavigationNodePatchWriter | undefined
  private readonly session: NavigationEditSession
  private projectId: string
  private readonly nodesById = new Map<string, ProjectNode>()
  private readonly configPagesByPageId = new Map<string, ConfigPageNode>()
  private readonly detachedConfigPagesByPageId = new Map<string, ConfigPageNode>()

  constructor(options: ProjectNodeCollectionOptions) {
    this.fileApi = options.fileApi
    this.fileCache = options.fileCache
    this.contentLoaderFactory = options.contentLoaderFactory
    this.navClient = options.navClient
    const projectId = options.projectId?.trim()
    this.projectId = projectId === undefined || projectId === '' ? 'project' : projectId
    this.session = options.navigationSession ?? new DefaultNavigationEditSession()
    this.replaceRoot(this.session.root)
  }

  get root(): ProjectModelData {
    return {
      ...this.session.root,
      children: this.toTree(),
    }
  }

  get children(): ProjectNodeData[] {
    return this.toTree()
  }

  get nodes(): ProjectNode[] {
    return [...this.nodesById.values()]
  }

  get rootNodes(): ProjectNode[] {
    return this.getChildNodes(null)
  }

  get flatRows(): ProjectNavigationFlatNode[] {
    return this.nodes.map(node => node.toFlatRow())
  }

  setProjectId(projectId: string): void {
    this.projectId = projectId.trim() || 'project'
    this.rebindDescriptionContext()
  }

  replaceRoot(root: ProjectModelData): ProjectModelData {
    const previousConfigPages = new Map(this.configPagesByPageId)
    const previousDetachedPages = new Map(this.detachedConfigPagesByPageId)
    this.session.replaceRoot(root)
    this.nodesById.clear()
    this.configPagesByPageId.clear()
    for (const item of flattenProjectNavigationRoot(root)) {
      const descriptionContext = this.readDescriptionContextForNode(item.node, item.pid)
      const pageId = resolvePageNodePageId(item.node)
      const reusablePage = pageId
        ? previousConfigPages.get(pageId) ?? previousDetachedPages.get(pageId) ?? null
        : null
      const model = reusablePage ?? createProjectNodeModel({
          node: item.node,
          pid: item.pid,
          descriptionContext,
          resolveChildren: node => this.getChildNodes(node.id),
          fileApi: this.fileApi,
          fileCache: this.fileCache,
          contentLoaderFactory: this.contentLoaderFactory,
          ...(this.navClient === undefined ? {} : { navClient: this.navClient }),
        })
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
    this.syncSessionRoot()
    return this.root
  }

  toTree(): ProjectNodeData[] {
    return buildProjectNavigationTree(this.nodes)
  }

  findNodeById(nodeId: string): ProjectNode | null {
    return this.nodesById.get(nodeId.trim()) ?? null
  }

  findRawNodeById(nodeId: string): ProjectNodeData | null {
    return this.findNodeById(nodeId)?.node ?? null
  }

  findNodeLocation(nodeId: string): ProjectNodeLocation | null {
    return findNodeLocation(this.children, nodeId)
  }

  findConfigPageByPageId(pageId: string): ConfigPageNode | null {
    return this.configPagesByPageId.get(pageId.trim()) ?? null
  }

  findPageNode(pageId: string): ProjectNodeData | null {
    return this.findConfigPageByPageId(pageId)?.node ?? null
  }

  /**
   * 按 pageId 获取或实例化配置页面节点。
   *
   * pageId 会进入 ConfigPageNode 构造参数；ConfigPageNode 构造时同步实例化 rule、dataSet、script、style 四个子模型。
   * 文件内容由页面加载生命周期填充。
   *
   * @param pageId 配置页面 ID。
   * @moduleMutation page-config read 按 pageId 获取或实例化配置页面节点。
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
    const model = createProjectNodeModel({
      node,
      pageId: normalized,
      pid: null,
      descriptionContext: this.readDescriptionContextForNode(node, null),
      resolveChildren: childNode => this.getChildNodes(childNode.id),
      fileApi: this.fileApi,
      fileCache: this.fileCache,
      contentLoaderFactory: this.contentLoaderFactory,
      ...(this.navClient === undefined ? {} : { navClient: this.navClient }),
    })
    if (!isProjectConfigPageNodeModel(model)) {
      throw new Error(`节点 ${normalized} 不是配置页面节点`)
    }
    model.navigation.navNode = null
    this.configPagesByPageId.set(model.pageId, model)
    this.detachedConfigPagesByPageId.set(model.pageId, model)
    return model
  }

  closeConfigPage(pageId: string): void {
    const page = this.findConfigPageByPageId(pageId)
    if (!page) return
    if (!this.detachedConfigPagesByPageId.has(page.pageId)) return
    this.detachedConfigPagesByPageId.delete(page.pageId)
    this.configPagesByPageId.delete(page.pageId)
  }

  configPages(): IterableIterator<ConfigPageNode> {
    return this.configPagesByPageId.values()
  }

  readPageSummaries(): ProjectPageNodeSummary[] {
    const summaries: ProjectPageNodeSummary[] = []
    const seen = new Set<string>()
    for (const node of this.nodes) {
      if (!isProjectConfigPageNodeModel(node) || seen.has(node.pageId)) continue
      seen.add(node.pageId)
      summaries.push(node.toSummary())
    }
    return summaries
  }

  addRootModule(createId: () => string): ProjectNodeData {
    const node = createRootModuleNode(createId)
    node.order = this.nextRootOrder()
    this.insertNode(node, null)
    return node
  }

  addChildPage(createId: () => string, parent: ProjectNodeData | null): ProjectNodeData {
    const node = createChildPageNode(createId)
    const pid = parent?.id ?? null
    node.order = this.nextChildOrder(pid)
    this.insertNode(node, pid)
    return node
  }

  removeNode(nodeId: string): ProjectNodeData | null {
    const normalized = nodeId.trim()
    if (!normalized) {
      throw new Error('nodeId 不能为空')
    }
    const model = this.findNodeById(normalized)
    if (!model) {
      throw new Error(`项目节点未找到: ${normalized}`)
    }
    const removed = model.node
    for (const child of this.collectDescendants(normalized)) {
      this.removeModel(child)
    }
    this.removeModel(model)
    this.syncSessionRoot()
    return removed
  }

  refreshNavRefs(): void {
    this.rebindDescriptionContext()
  }

  private insertNode(node: ProjectNodeData, pid: string | null): ProjectNode {
    if (this.nodesById.has(node.id)) {
      throw new Error(`项目节点已存在: ${node.id}`)
    }
    const model = createProjectNodeModel({
      node,
      pid,
      descriptionContext: this.readDescriptionContextForNode(node, pid),
      resolveChildren: nodeModel => this.getChildNodes(nodeModel.id),
      fileApi: this.fileApi,
      fileCache: this.fileCache,
      contentLoaderFactory: this.contentLoaderFactory,
      ...(this.navClient === undefined ? {} : { navClient: this.navClient }),
    })
    this.nodesById.set(model.id, model)
    if (isProjectConfigPageNodeModel(model)) {
      this.configPagesByPageId.set(model.pageId, model)
    }
    this.syncSessionRoot()
    return model
  }

  private removeModel(model: ProjectNode): void {
    this.nodesById.delete(model.id)
    if (isProjectConfigPageNodeModel(model)) {
      this.configPagesByPageId.delete(model.pageId)
    }
  }

  private collectDescendants(nodeId: string): ProjectNode[] {
    const result: ProjectNode[] = []
    for (const node of this.nodes) {
      if (node.pid !== nodeId) continue
      result.push(node, ...this.collectDescendants(node.id))
    }
    return result
  }

  private getChildNodes(pid: string | null): ProjectNode[] {
    return this.nodes.filter(node => node.pid === pid)
  }

  private nextRootOrder(): number {
    return this.nextChildOrder(null)
  }

  private nextChildOrder(pid: string | null): number {
    const siblings = this.nodes.filter(node => node.pid === pid)
    return siblings.reduce((max, node) => Math.max(max, node.toFlatRow().order), -1) + 1
  }

  private syncSessionRoot(): void {
    const nextRoot: ProjectModelData = {
      ...this.session.root,
      children: this.toTree(),
    }
    this.session.replaceRoot(nextRoot)
  }

  private rebindDescriptionContext(): void {
    for (const model of this.nodes) {
      model.rebindNavigationNode(model.node, model.pid, this.readDescriptionContextForNode(model.node, model.pid))
    }
  }

  private readDescriptionContextForNode(node: ProjectNodeData, pid: string | null): ProjectDescriptionContext[] {
    let context = this.readProjectDescriptionContext()
    const ancestors = this.readAncestorNodes(pid)
    for (const ancestor of ancestors) {
      context = appendProjectDescriptionContext(context, ancestor)
    }
    return appendProjectDescriptionContext(context, node)
  }

  private readProjectDescriptionContext(): ProjectDescriptionContext[] {
    const description = this.session.root.description?.trim() ?? ''
    if (!description) return []
    return [{
      nodeId: this.projectId,
      title: this.projectId,
      nodeKind: 'project',
      description,
    }]
  }

  private readAncestorNodes(pid: string | null): ProjectNodeData[] {
    const ancestors: ProjectNodeData[] = []
    let currentPid = pid
    while (currentPid) {
      const current = this.findNodeById(currentPid)
      if (!current) break
      ancestors.unshift(current.node)
      currentPid = current.pid
    }
    return ancestors
  }
}

export function findProjectRawNodeById(nodes: readonly ProjectNodeData[], nodeId: string): ProjectNodeData | null {
  return findNodeById(nodes, nodeId)
}

export function readProjectPageSummaryFromNode(
  node: ProjectNodeData,
  descriptionContext: readonly ProjectDescriptionContext[],
): ProjectPageNodeSummary | null {
  const pageId = resolvePageNodePageId(node)
  if (!pageId) return null
  const description = readProjectNodeDescription(node)
  return {
    pageId,
    path: node.path ?? `/${pageId}`,
    title: node.title,
    nodeId: node.id,
    nodeKind: node.nodeKind ?? 'page',
    description,
    descriptionContext: [...descriptionContext],
    effectiveDescription: formatProjectDescriptionContext(descriptionContext),
    ...(node.icon === undefined ? {} : { icon: node.icon }),
  }
}

export function projectFlatRowFromNode(node: ProjectNodeData, pid: string | null): ProjectNavigationFlatNode {
  return projectNavNodeToFlatRow(node, pid)
}
