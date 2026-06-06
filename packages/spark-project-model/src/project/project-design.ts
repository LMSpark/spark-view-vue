/**
 * ProjectDesign — 项目设计内容聚合（NavigationDesign + 配置页 Map）。
 */
import type {
  ProjectModelData,
  ProjectNodeData,
  ProjectNodeLocation,
  ProjectPageNodeSummary,
  ProjectNode,
} from '../navigation/project-node'
import type { NavigationNodeDraft } from '../navigation/navigation-edit'
import type { ConfigPageNode } from '../page/config-page'
import {
  NavigationDesign,
  type NavigationDesignEditResult,
} from './navigation-design'
import type { ProjectInfo, ProjectInfoInput, ProjectModelInitOptions } from './project-types'

export type { ProjectInfo, ProjectInfoInput } from './project-types'

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
