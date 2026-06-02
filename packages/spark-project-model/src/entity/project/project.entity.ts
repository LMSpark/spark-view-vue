/**
 * ProjectModel — 软件项目模型。
 *
 * 后端 DB 的 NAVIGATION_NODE_FLAT 是项目节点真源；前端模型同样采用平铺节点集合。
 * 模块、配置页、Vue 页面、动作、外链、引用都先落到节点子类；配置页节点直接拥有
 * rule / dataSet / script / style 子模型，不再经过独立 PageNode 中间层。
 */

import type { NavigationEditSession } from '../navigation/session.entity'
import type { ProjectModelData, ProjectNodeData } from '../node/node-base.entity'
import type { ConfigPageNode, ProjectNavigationFlatNode, ProjectNode, ProjectPageNodeSummary } from '../node/node-factory'
import type { NavigationNodePatchWriter } from '../navigation/edit.entity'
import type { PageFileCache, PageFileContentLoader, PageFileWriter } from '../node/page-file-types'
import { ModuleNode } from '../node/module-node.entity'
import { ProjectNodeCollection } from './node-collection.entity'

export type ProjectModelDto = {
  projectId: string
  navigation: ProjectModelData
  pages: ProjectPageNodeSummary[]
}

export type ProjectModelOptions = {
  projectId: string
  fileApi: PageFileWriter
  fileCache: PageFileCache
  contentLoaderFactory: () => PageFileContentLoader
  navClient?: NavigationNodePatchWriter | undefined
  navigationSession?: NavigationEditSession
}

/**
 * 项目模型。
 *
 * 持有项目节点集合，是 page-design VCM 的项目级模型根。
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
export class ProjectModel extends ModuleNode<ProjectNode> {
  private readonly nodeStore: ProjectNodeCollection

  constructor(options: ProjectModelOptions) {
    const projectId = options.projectId.trim()
    if (!projectId) {
      throw new Error('projectId 不能为空')
    }
    super({
      node: createProjectModelNode(projectId),
      pid: null,
      descriptionContext: [],
    })
    this.nodeStore = new ProjectNodeCollection({
      projectId,
      fileApi: options.fileApi,
      fileCache: options.fileCache,
      contentLoaderFactory: options.contentLoaderFactory,
      ...(options.navClient === undefined ? {} : { navClient: options.navClient }),
      ...(options.navigationSession === undefined ? {} : { navigationSession: options.navigationSession }),
    })
    this.bindChildrenResolver(() => this.nodeStore.rootNodes)
  }

  /**
   * 当前项目 ID。
   */
  get projectId(): string { return this.id }

  /**
   * 当前项目导航根快照。
   */
  get root(): ProjectModelData { return this.nodeStore.root }

  /**
   * 当前项目导航树的直接子节点。
   */
  get navigationChildren(): ProjectNodeData[] { return this.nodeStore.children }

  /**
   * 当前项目节点的平铺行投影。
   */
  get flatRows(): ProjectNavigationFlatNode[] { return this.nodeStore.flatRows }

  setProjectId(projectId: string): void { this.nodeStore.setProjectId(projectId) }
  replaceRoot(root: ProjectModelData): ProjectModelData { return this.nodeStore.replaceRoot(root) }
  toTree(): ProjectNodeData[] { return this.nodeStore.toTree() }
  findNodeById(nodeId: string): ProjectNode | null { return this.nodeStore.findNodeById(nodeId) }
  findRawNodeById(nodeId: string): ProjectNodeData | null { return this.nodeStore.findRawNodeById(nodeId) }
  findNodeLocation(nodeId: string): ReturnType<ProjectNodeCollection['findNodeLocation']> { return this.nodeStore.findNodeLocation(nodeId) }
  findConfigPageByPageId(pageId: string): ConfigPageNode | null { return this.nodeStore.findConfigPageByPageId(pageId) }
  findPageNode(pageId: string): ProjectNodeData | null { return this.nodeStore.findPageNode(pageId) }

  /**
   * 按 pageId 获取或实例化配置页面节点。
   *
   * pageId 会进入 ConfigPageNode 构造参数；ConfigPageNode 构造时同步实例化 rule、dataSet、script、style 四个子模型。
   */
  openConfigPage(pageId: string): ConfigPageNode { return this.nodeStore.openConfigPage(pageId) }

  closeConfigPage(pageId: string): void { this.nodeStore.closeConfigPage(pageId) }
  configPages(): IterableIterator<ConfigPageNode> { return this.nodeStore.configPages() }
  readPageSummaries(): ProjectPageNodeSummary[] { return this.nodeStore.readPageSummaries() }
  addRootModule(createId: () => string): ProjectNodeData { return this.nodeStore.addRootModule(createId) }
  addChildPage(createId: () => string, parent: ProjectNodeData | null = null): ProjectNodeData { return this.nodeStore.addChildPage(createId, parent) }
  removeNode(nodeId: string): ProjectNodeData | null { return this.nodeStore.removeNode(nodeId) }
  refreshNavRefs(): void { this.nodeStore.refreshNavRefs() }
}

export type ProjectModelLike = Pick<ProjectModel, 'projectId' | 'children'>

function createProjectModelNode(projectId: string): ProjectNodeData {
  return {
    id: projectId,
    title: projectId,
    nodeKind: 'module',
    icon: 'FolderOpened',
    description: '项目根节点',
  }
}
