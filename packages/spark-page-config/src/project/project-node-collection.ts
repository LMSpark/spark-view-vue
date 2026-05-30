/**
 * Project node collection.
 *
 * 对齐后端 NAVIGATION_NODE_FLAT：平铺保存节点，按节点类型实例化子类。
 * 层级关系只由 pid 表达；需要树时通过 projection 生成 children。
 */

import type { AppNavRoot, NavNode } from '../page-model/navigation/nav-model'
import type { NavigationEditSession, NavNodeLocation } from '../page-model/navigation/nav-editing'
import {
  createChildPageNode,
  createRootModuleNode,
  findNodeById,
  findNodeLocation,
  NavigationEditSession as DefaultNavigationEditSession,
} from '../page-model/navigation/nav-editing'
import type { PageNodeFileApi } from '../page-model/model/page-file-api'
import type { PageNodeFileCache } from '../page-model/model/page-file-cache'
import type { NavigationConfigClient } from '../page-model/navigation/nav-client'
import type { BasePageContentLoader } from '../page-model/read/page-content-types'
import {
  appendProjectRequirementConstraint,
  buildProjectNavigationTree,
  createProjectNodeModel,
  flattenProjectNavigationRoot,
  formatProjectRequirementConstraints,
  isProjectConfigPageNodeModel,
  projectNavNodeToFlatRow,
  readProjectNodeRequirement,
  resolvePageNodePageId,
  type ProjectConfigPageNodeModel,
  type ProjectNavigationFlatNode,
  type ProjectNodeModel,
  type ProjectPageNodeSummary,
  type ProjectRequirementConstraint,
} from './project-node-model'

export type ProjectNodeCollectionOptions = {
  projectId?: string | undefined
  fileApi: PageNodeFileApi
  fileCache: PageNodeFileCache
  contentLoaderFactory: () => BasePageContentLoader
  navClient?: NavigationConfigClient | undefined
  navigationSession?: NavigationEditSession | undefined
  projectRequirement?: string | undefined
}

export class ProjectNodeCollection {
  private readonly fileApi: PageNodeFileApi
  private readonly fileCache: PageNodeFileCache
  private readonly contentLoaderFactory: () => BasePageContentLoader
  private readonly navClient: NavigationConfigClient | undefined
  private readonly session: NavigationEditSession
  private projectId: string
  private readonly nodesById = new Map<string, ProjectNodeModel>()
  private readonly configPagesByPageId = new Map<string, ProjectConfigPageNodeModel>()
  private readonly detachedConfigPagesByPageId = new Map<string, ProjectConfigPageNodeModel>()
  private projectRequirement = ''

  constructor(options: ProjectNodeCollectionOptions) {
    this.fileApi = options.fileApi
    this.fileCache = options.fileCache
    this.contentLoaderFactory = options.contentLoaderFactory
    this.navClient = options.navClient
    const projectId = options.projectId?.trim()
    this.projectId = projectId === undefined || projectId === '' ? 'project' : projectId
    this.session = options.navigationSession ?? new DefaultNavigationEditSession()
    if (options.projectRequirement !== undefined) {
      this.projectRequirement = options.projectRequirement.trim()
    }
    this.replaceRoot(this.session.root)
  }

  get root(): AppNavRoot {
    return {
      ...this.session.root,
      children: this.toTree(),
    }
  }

  get children(): NavNode[] {
    return this.toTree()
  }

  get nodes(): ProjectNodeModel[] {
    return [...this.nodesById.values()]
  }

  get flatRows(): ProjectNavigationFlatNode[] {
    return this.nodes.map(node => node.toFlatRow())
  }

  get requirement(): string {
    return this.projectRequirement
  }

  set requirement(value: string) {
    this.projectRequirement = value.trim()
    this.rebindRequirementConstraints()
  }

  setProjectId(projectId: string): void {
    this.projectId = projectId.trim() || 'project'
    this.rebindRequirementConstraints()
  }

  replaceRoot(root: AppNavRoot): AppNavRoot {
    const previousConfigPages = new Map(this.configPagesByPageId)
    const previousDetachedPages = new Map(this.detachedConfigPagesByPageId)
    this.session.replaceRoot(root)
    this.nodesById.clear()
    this.configPagesByPageId.clear()
    for (const item of flattenProjectNavigationRoot(root)) {
      const constraints = this.readConstraintsForNode(item.node, item.pid)
      const pageId = resolvePageNodePageId(item.node)
      const reusablePage = pageId
        ? previousConfigPages.get(pageId) ?? previousDetachedPages.get(pageId) ?? null
        : null
      const model = reusablePage ?? createProjectNodeModel({
          node: item.node,
          pid: item.pid,
          requirementConstraints: constraints,
          fileApi: this.fileApi,
          fileCache: this.fileCache,
          contentLoaderFactory: this.contentLoaderFactory,
          ...(this.navClient === undefined ? {} : { navClient: this.navClient }),
        })
      model.rebindNavigationNode(item.node, item.pid, constraints)
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

  toTree(): NavNode[] {
    return buildProjectNavigationTree(this.nodes)
  }

  findNodeById(nodeId: string): ProjectNodeModel | null {
    return this.nodesById.get(nodeId.trim()) ?? null
  }

  findRawNodeById(nodeId: string): NavNode | null {
    return this.findNodeById(nodeId)?.node ?? null
  }

  findNodeLocation(nodeId: string): NavNodeLocation | null {
    return findNodeLocation(this.children, nodeId)
  }

  findConfigPageByPageId(pageId: string): ProjectConfigPageNodeModel | null {
    return this.configPagesByPageId.get(pageId.trim()) ?? null
  }

  findPageNode(pageId: string): NavNode | null {
    return this.findConfigPageByPageId(pageId)?.node ?? null
  }

  openConfigPage(pageId: string): ProjectConfigPageNodeModel {
    const normalized = pageId.trim()
    if (!normalized) {
      throw new Error('pageId 不能为空')
    }
    const existing = this.findConfigPageByPageId(normalized)
    if (existing) return existing
    const node: NavNode = {
      id: normalized,
      title: normalized,
      nodeKind: 'page',
      path: `/${normalized}`,
      icon: 'Document',
    }
    const model = createProjectNodeModel({
      node,
      pid: null,
      requirementConstraints: this.readConstraintsForNode(node, null),
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

  configPages(): IterableIterator<ProjectConfigPageNodeModel> {
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

  addRootModule(createId: () => string): NavNode {
    const node = createRootModuleNode(createId)
    node.order = this.nextRootOrder()
    this.insertNode(node, null)
    return node
  }

  addChildPage(createId: () => string, parent: NavNode | null): NavNode {
    const node = createChildPageNode(createId)
    const pid = parent?.id ?? null
    node.order = this.nextChildOrder(pid)
    this.insertNode(node, pid)
    return node
  }

  removeNode(nodeId: string): NavNode | null {
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
    this.rebindRequirementConstraints()
  }

  private insertNode(node: NavNode, pid: string | null): ProjectNodeModel {
    if (this.nodesById.has(node.id)) {
      throw new Error(`项目节点已存在: ${node.id}`)
    }
    const model = createProjectNodeModel({
      node,
      pid,
      requirementConstraints: this.readConstraintsForNode(node, pid),
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

  private removeModel(model: ProjectNodeModel): void {
    this.nodesById.delete(model.id)
    if (isProjectConfigPageNodeModel(model)) {
      this.configPagesByPageId.delete(model.pageId)
    }
  }

  private collectDescendants(nodeId: string): ProjectNodeModel[] {
    const result: ProjectNodeModel[] = []
    for (const node of this.nodes) {
      if (node.pid !== nodeId) continue
      result.push(node, ...this.collectDescendants(node.id))
    }
    return result
  }

  private nextRootOrder(): number {
    return this.nextChildOrder(null)
  }

  private nextChildOrder(pid: string | null): number {
    const siblings = this.nodes.filter(node => node.pid === pid)
    return siblings.reduce((max, node) => Math.max(max, node.toFlatRow().order), -1) + 1
  }

  private syncSessionRoot(): void {
    const nextRoot: AppNavRoot = {
      ...this.session.root,
      children: this.toTree(),
    }
    this.session.replaceRoot(nextRoot)
  }

  private rebindRequirementConstraints(): void {
    for (const model of this.nodes) {
      model.rebindNavigationNode(model.node, model.pid, this.readConstraintsForNode(model.node, model.pid))
    }
  }

  private readConstraintsForNode(node: NavNode, pid: string | null): ProjectRequirementConstraint[] {
    let constraints = this.readProjectConstraints()
    const ancestors = this.readAncestorNodes(pid)
    for (const ancestor of ancestors) {
      constraints = appendProjectRequirementConstraint(constraints, ancestor)
    }
    return appendProjectRequirementConstraint(constraints, node)
  }

  private readProjectConstraints(): ProjectRequirementConstraint[] {
    if (!this.projectRequirement) return []
    return [{
      nodeId: this.projectId,
      title: this.projectId,
      nodeKind: 'project',
      description: this.projectRequirement,
    }]
  }

  private readAncestorNodes(pid: string | null): NavNode[] {
    const ancestors: NavNode[] = []
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

export function findProjectRawNodeById(nodes: readonly NavNode[], nodeId: string): NavNode | null {
  return findNodeById(nodes, nodeId)
}

export function readProjectPageSummaryFromNode(
  node: NavNode,
  constraints: readonly ProjectRequirementConstraint[],
): ProjectPageNodeSummary | null {
  const pageId = resolvePageNodePageId(node)
  if (!pageId) return null
  const requirement = readProjectNodeRequirement(node)
  return {
    pageId,
    path: node.path ?? `/${pageId}`,
    title: node.title,
    nodeId: node.id,
    nodeKind: node.nodeKind ?? 'page',
    description: requirement,
    userRequirement: requirement,
    requirementConstraints: [...constraints],
    effectiveUserRequirement: formatProjectRequirementConstraints(constraints),
    ...(node.icon === undefined ? {} : { icon: node.icon }),
  }
}

export function projectFlatRowFromNode(node: NavNode, pid: string | null): ProjectNavigationFlatNode {
  return projectNavNodeToFlatRow(node, pid)
}
