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
   * @vcmIgnore
   */
  get navigationChildren(): ProjectNodeData[] { return this.nodeStore.children }

  /**
   * 当前项目节点的平铺行投影。
   */
  get flatRows(): ProjectNavigationFlatNode[] { return this.nodeStore.flatRows }

  /** @vcmIgnore */
  replaceRoot(root: ProjectModelData): ProjectModelData { return this.nodeStore.replaceRoot(root) }
  /**
   * 按节点 ID 查找并返回项目节点模型；找不到返回 null。
   */
  findNodeById(nodeId: string): ProjectNode | null { return this.nodeStore.findNodeById(nodeId) }
  /** @vcmIgnore */
  findRawNodeById(nodeId: string): ProjectNodeData | null { return this.nodeStore.findRawNodeById(nodeId) }
  /** @vcmIgnore */
  findNodeLocation(nodeId: string): ReturnType<ProjectNodeCollection['findNodeLocation']> { return this.nodeStore.findNodeLocation(nodeId) }
  /** @vcmIgnore */
  findConfigPageByPageId(pageId: string): ConfigPageNode | null { return this.nodeStore.findConfigPageByPageId(pageId) }
  /** @vcmIgnore */
  findPageNode(pageId: string): ProjectNodeData | null { return this.nodeStore.findPageNode(pageId) }

  /**
   * 按 pageId 获取或实例化配置页面节点。
   *
   * pageId 会进入 ConfigPageNode 构造参数；ConfigPageNode 构造时同步实例化 rule、dataSet、script、style 四个子模型。
   */
  openConfigPage(pageId: string): ConfigPageNode { return this.nodeStore.openConfigPage(pageId) }

  /** @vcmIgnore */
  closeConfigPage(pageId: string): void { this.nodeStore.closeConfigPage(pageId) }
  /**
   * 读取当前项目所有配置页面的概要列表（pageId、路径、标题、描述）。
   */
  readPageSummaries(): ProjectPageNodeSummary[] { return this.nodeStore.readPageSummaries() }
  /**
   * 在项目根节点下新建一个模块节点并返回其数据。
   */
  addRootModule(createId: () => string): ProjectNodeData { return this.nodeStore.addRootModule(createId) }
  /**
   * 在指定父节点下新建一个配置页面节点并返回其数据；parent 为 null 时挂在根下。
   */
  addChildPage(createId: () => string, parent: ProjectNodeData | null = null): ProjectNodeData { return this.nodeStore.addChildPage(createId, parent) }
  /**
   * 移除指定 nodeId 的节点及其所有子孙，返回被移除节点数据；节点不存在则 throw。
   */
  removeNode(nodeId: string): ProjectNodeData | null { return this.nodeStore.removeNode(nodeId) }
  /** @vcmIgnore */
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
