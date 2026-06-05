/**
 * ProjectModel — 软件项目根 class。
 *
 * 组合 design（设计内容 class 树）与 runtime（运行投影）。
 * 根级便捷方法保留为对 design 的委托，新代码优先使用 project.design / project.runtime。
 */
import type { ProjectNode } from '../navigation/node'
import { ProjectDesign } from './design'
import { ProjectRuntime } from './runtime'
import type {
  ProjectModelData,
  ProjectNodeData,
  ProjectNodeLocation,
  ProjectPageNodeSummary,
} from '../navigation/node'
import type { ConfigPageNode } from '../page/config-page'
import type { ProjectInfo, ProjectInfoInput, ProjectModelInitOptions, ProjectModelOptions } from './types'

export type { ProjectModelDto, ProjectInfo, ProjectInfoInput, ProjectModelInitOptions, ProjectModelOptions } from './types'

/** 运行时领域实例（`editor.project`）；与门面实例 `ProjectEditor` 区分。 */
export type ProjectModelInstance = ProjectModel

/**
 * 项目模型根。
 *
 * @moduleAbility pageDesign.project
 * @moduleKind project
 */
export class ProjectModel<TNode extends ProjectNode = ProjectNode> {
  readonly design: ProjectDesign<TNode>
  readonly runtime: ProjectRuntime

  /** 纯领域实例：无 IO 端口，仅内存导航与设计。 */
  static create(init: ProjectModelInitOptions): ProjectModel {
    return new ProjectModel(init)
  }

  constructor(options: ProjectModelOptions) {
    this.design = new ProjectDesign<TNode>(options)
    this.runtime = new ProjectRuntime(this.design)
  }

  get family(): 'project' { return 'project' }
  /** 项目唯一标识，与租户内存储锚点一致。 */
  get projectId(): string { return this.design.projectId }
  get id(): string { return this.projectId }
  get tenantId(): string | undefined { return this.design.tenantId }
  get name(): string { return this.design.name }
  get title(): string { return this.design.name }
  get projectType(): string { return this.design.projectType }
  get icon(): string | undefined { return this.design.icon }
  get description(): string { return this.design.description }
  get homeNodeId(): string | undefined { return this.design.homeNodeId }
  get homeNode(): TNode | null { return this.design.homeNode }
  get rootNode(): TNode | null { return this.design.rootNode }
  get order(): number { return this.design.order }
  get createdAt(): string | undefined { return this.design.createdAt }
  get updatedAt(): string | undefined { return this.design.updatedAt }
  get projectInfo(): ProjectInfo { return this.design.projectInfo }

  /** 导航树根 DTO，含子节点树与布局元数据。 */
  get navigationRoot(): ProjectModelData { return this.design.navigationRoot }

  getChildNodes(nodeId?: string): TNode[] { return this.design.getChildNodes(nodeId) }
  /** 导航树扁平节点列表，按遍历顺序排列。 */
  get flatRows(): TNode[] { return this.design.flatRows }
  forEachNode(callback: (node: TNode) => void): void { this.design.forEachNode(callback) }

  replaceRoot(root: ProjectModelData): ProjectModelData { return this.design.replaceRoot(root) }
  replaceProjectInfo(project: ProjectInfoInput): ProjectInfo { return this.design.replaceProjectInfo(project) }
  replaceNavigationChildren(children: ProjectNodeData[]): ProjectModelData {
    return this.design.replaceNavigationChildren(children)
  }

  findNodeById(nodeId: string): TNode | null { return this.design.findNodeById(nodeId) }
  findNodeLocation(nodeId: string): ProjectNodeLocation | null { return this.design.findNodeLocation(nodeId) }
  findConfigPageByPageId(pageId: string): ConfigPageNode | null {
    return this.design.findConfigPageByPageId(pageId)
  }

  openConfigPage(pageId: string): ConfigPageNode { return this.design.openConfigPage(pageId) }
  closeConfigPage(pageId: string): void { this.design.closeConfigPage(pageId) }
  readPageSummaries(): ProjectPageNodeSummary[] { return this.design.readPageSummaries() }
  addRootModule(createId: () => string): ProjectNodeData { return this.design.addRootModule(createId) }
  addChildPage(createId: () => string, parent?: ProjectNodeData | null): ProjectNodeData {
    return this.design.addChildPage(createId, parent ?? null)
  }
  removeNode(nodeId: string): ProjectNodeData | null { return this.design.removeNode(nodeId) }
  refreshNavRefs(): void { this.design.refreshNavRefs() }
  toTree(): ProjectNodeData[] { return this.design.toTree() }
}
