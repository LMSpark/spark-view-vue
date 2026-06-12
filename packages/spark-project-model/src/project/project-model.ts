/**
 * @module @spark-appworks/spark-project-model:project/project-model
 * 职责：提供项目模型和页面配置域中的 project model 能力，支撑 navigation、page content、project session 或远程 IO。
 * 边界：只描述配置和项目结构，不渲染 Vue 组件，也不直接操作 spark-data 运行态。
 * AI用途：读取、生成或同步项目页面配置时，用本模块确认项目模型字段和 IO 边界。
 */
/**
 * ProjectModel — 软件项目根 class。
 *
 * 组合 design（设计内容 class 树）与 session（编辑状态）。
 */
import type { DataSetCrudTool, SparkNodeTree as SparkNodeTreeModel } from '@spark-appworks/spark-data'
import type { ProjectNode } from '../navigation/project-node'
import { ProjectDesign } from './project-design'
import {
  applyNodeKindPresetToDraft,
  applyNestedConfigPagePresetToDraft,
  createNavigationNodeDraft,
  navigationDraftContentKey,
  type NavigationNodeDraft,
  type NavigationNodeDraftApplyResult,
} from '../navigation/navigation-edit'
import {
  readProjectNodeDescription,
} from '../navigation/project-node'
import type {
  ProjectModelData,
  ProjectNodeData,
  ProjectNodeLocation,
  ProjectPageNodeSummary,
} from '../navigation/project-node'
import type { NavNodeKind } from '../navigation/project-node'
import type { ConfigPageNode } from '../page/config-page'
import type { PageNodeFileName } from '../page/page-file'
import { tryParsePageDataTextError, tryParseRuleTextError } from '../page/page-file'
import { ProjectSession } from './project-session'
import type {
  ProjectInfo,
  ProjectInfoInput,
  ProjectModelEventListener,
  ProjectModelInitOptions,
  ProjectActivePageProjection,
  ProjectDirtyProjection,
  ProjectNavigationProjection,
  ProjectPageFileWriteCommand,
  NavigationPlanningInput,
  ProjectPlanningInput,
} from './project-types'

export type {
  ProjectInfo,
  ProjectInfoInput,
  ProjectModelEvent,
  ProjectModelEventListener,
  ProjectModelInitOptions,
  ProjectActivePageProjection,
  ProjectDirtyProjection,
  ProjectNavigationProjection,
  ProjectNavigationDirtyScope,
} from './project-types'

/**
 * 项目模型根。
 *
 */
export class ProjectModel<TNode extends ProjectNode = ProjectNode> {
    /** design 字段。 */
readonly design: ProjectDesign<TNode>
    /** session 字段。 */
readonly session: ProjectSession

  private revisionCounter = 0
  private readonly listeners = new Set<ProjectModelEventListener>()

  /**
   * 创建项目根模型实例。
   *
   * @param options 项目导航、页面四文件与会话初始化参数。
   */
  constructor(options: ProjectModelInitOptions) {
    this.design = new ProjectDesign<TNode>(options)
    this.session = new ProjectSession({
      findNodeById: (nodeId) => this.design.findNodeById(nodeId),
      findConfigPageByPageId: (pageId) => this.design.findConfigPageByPageId(pageId),
    })
  }

  get family(): 'project' { return 'project' }
  get revision(): number { return this.revisionCounter }
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

  /** 导航树根 DTO，含子节点树与布局元数据。
   *
   */
  get navigationRoot(): ProjectModelData { return this.design.navigationRoot }
  get navigationDraft(): NavigationNodeDraft | null { return this.session.navigationDraft }
  get isNavigationEditing(): boolean { return this.session.isNavigationEditing }
  get navigationDirty(): boolean { return this.session.navigationDirty }

    /** 执行 subscribe 操作。 */
subscribe(listener: ProjectModelEventListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

    /** 读取 Child Nodes。 */
getChildNodes(nodeId?: string): TNode[] { return this.design.getChildNodes(nodeId) }
  /** 导航树扁平节点列表，按遍历顺序排列。 */
  get flatRows(): TNode[] { return this.design.flatRows }

  /**
   * 当前活动配置页；需先 openPageDesign(pageId) 才有值。
   *
   */
  get activePage(): ConfigPageNode | null {
    return this.getActivePage()
  }
    /** 执行 for Each Node 操作。 */
forEachNode(callback: (node: TNode) => void): void { this.design.forEachNode(callback) }

    /** 执行 replace Project Info 操作。 */
replaceProjectInfo(project: ProjectInfoInput): ProjectInfo { return this.design.replaceProjectInfo(project) }

  /**
   * 替换导航根节点的 children，返回更新后的导航根数据。
   *
   * @param input 新的导航 children 树，或 `{ children }` 命令对象（与 ClassModel script 对齐）。
   */
  replaceNavigationChildren(
    input: ProjectNodeData[] | Readonly<{ children: ProjectNodeData[] }>,
  ): ProjectModelData {
    const children = Array.isArray(input) ? input : input.children
    const root = this.design.replaceNavigationChildren(children)
    this.session.markNavigationDirty('root')
    this.emitNavigationChanged({ scope: 'root' })
    return root
  }

    /** find Node By Id 标识。 */
findNodeById(nodeId: string): TNode | null { return this.design.findNodeById(nodeId) }
    /** 执行 find Node Location 操作。 */
findNodeLocation(nodeId: string): ProjectNodeLocation | null { return this.design.findNodeLocation(nodeId) }
    /** find Config Page By Page Id 标识。 */
findConfigPageByPageId(pageId: string): ConfigPageNode | null {
    return this.design.findConfigPageByPageId(pageId)
  }

  /**
   * 按 pageId 打开配置页设计上下文，返回 ConfigPageNode 四文件子模型。
   *
   * @param pageId 目标配置页 pageId，必须来自输入。
   */
  openPageDesign(pageId: string): ConfigPageNode { return this.design.openPageDesign(pageId) }
    /** 执行 close Page Design 操作。 */
closePageDesign(pageId: string): void { this.design.closePageDesign(pageId) }

  /**
   * 读取策划轴投影：各 page/sub-page 的 description 与 descriptionContext。
   */
  readPlanningProjection(): ProjectPageNodeSummary[] { return this.design.readPlanningProjection() }

  /**
   * 读取项目级策划输入：navigation 根 description（短需求）+ 可选策划附件引用。
   *
   */
  readProjectPlanningInput(): ProjectPlanningInput {
    const navigationRoot = toNavigationRootNodeData(this.navigationRoot)
    const rootRequirement = readProjectNodeDescription(navigationRoot)
    const requirement = rootRequirement.length > 0 ? rootRequirement : this.description
    const planningAttachmentRef = resolvePlanningAttachmentRef(
      navigationRoot?.planningAttachmentRef,
      this.projectInfo.planningAttachmentRef,
    )
    return {
      requirement,
      ...(planningAttachmentRef === undefined ? {} : { planningAttachmentRef }),
    }
  }

  /**
   * 读取单个导航节点策划输入。
   *
   * @param nodeId 目标导航节点 id。
   */
  readNavigationNodePlanningInput(nodeId: string): NavigationPlanningInput {
    const model = this.findNodeById(nodeId)
    if (model === null) throw new Error(`项目节点未找到: ${nodeId}`)
    return toNavigationPlanningInput(model.toNodeData())
  }

  /**
   * 读取全部导航节点策划输入（扁平遍历顺序）。
   *
   */
  readNavigationPlanningInputs(): readonly NavigationPlanningInput[] {
    return this.flatRows.map(model => toNavigationPlanningInput(model.toNodeData()))
  }

  /**
   * 更新根模块 childPlacement（项目级 header / sidebar 布局）。
   *
   */
  applyProjectLayoutEdit(childPlacement: 'header' | 'sidebar'): NavigationNodeDraftApplyResult {
    const root = this.design.rootNode
    if (!root) throw new Error('导航 root 未加载')
    const beforeKey = navigationDraftContentKey(createNavigationNodeDraft(root.toNodeData()))
    const draft = createNavigationNodeDraft(root.toNodeData())
    draft.node.childPlacement = childPlacement
    const { node, result } = this.design.applyNavigationNodeEdit(draft)
    const nextDraft = createNavigationNodeDraft(node.toNodeData())
    if (navigationDraftContentKey(nextDraft) !== beforeKey) {
      this.session.markNavigationDirty('root')
    }
    this.emitNavigationChanged({ scope: 'root', nodeId: node.id })
    return result
  }

    /** 执行 add Root Module 操作。 */
addRootModule(createId: () => string): ProjectNodeData {
    const node = this.design.addRootModule(createId)
    this.session.markNavigationDirty('root')
    this.emitNavigationChanged({ scope: 'root', nodeId: node.id })
    return node
  }
    /** 执行 add Child Page 操作。 */
addChildPage(createId: () => string, parent?: ProjectNodeData | null): ProjectNodeData {
    const node = this.design.addChildPage(createId, parent ?? null)
    this.session.markNavigationDirty('root')
    this.emitNavigationChanged({ scope: 'root', nodeId: node.id })
    return node
  }
    /** 删除 Node。 */
removeNode(nodeId: string): ProjectNodeData | null {
    const removed = this.design.removeNode(nodeId)
    this.session.syncWithModel()
    this.session.markNavigationDirty('root')
    this.emitNavigationChanged({ scope: 'root', nodeId })
    return removed
  }
    /** 执行 refresh Nav Refs 操作。 */
refreshNavRefs(): void { this.design.refreshNavRefs() }
    /** 执行 to Tree 操作。 */
toTree(): ProjectNodeData[] { return this.design.toTree() }

    /** 执行 replace Navigation Root 操作。 */
replaceNavigationRoot(
    root: ProjectModelData,
    options: { selectedNodeId?: string | null; dirty?: boolean } = {},
  ): ProjectModelData {
    const result = this.design.replaceNavigationRoot(root)
    const selectedNodeId = options.selectedNodeId ?? null
    if (selectedNodeId && this.design.findNodeById(selectedNodeId)) {
      this.session.setSelectedNodeId(selectedNodeId)
    } else {
      this.session.setSelectedNodeId(null)
    }
    this.session.syncWithModel()
    if (options.dirty === true) this.session.markNavigationDirty('root')
    else this.session.markNavigationClean()
    this.design.refreshNavRefs()
    this.emitNavigationChanged({ scope: 'root' })
    this.emitSelectionChanged()
    return result
  }

    /** 执行 select Node 操作。 */
selectNode(nodeId: string | null): void {
    this.session.setSelectedNodeId(nodeId)
    this.session.setNavigationDraft(null)
    this.emitSelectionChanged()
  }

    /** 设置 Active Page。 */
setActivePage(pageId: string, options: { forceReset?: boolean } = {}): void {
    const normalizedPageId = pageId.trim()
    if (!normalizedPageId) {
      this.clearActivePage()
      return
    }
    if (options.forceReset === true && this.getActivePage()?.pageId === normalizedPageId) {
      this.closePageDesign(normalizedPageId)
    }
    this.openPageDesign(normalizedPageId)
    this.session.setActivePageId(normalizedPageId)
    const mountedNode = this.design.findConfigPageByPageId(normalizedPageId)?.toNodeData() ?? null
    if (mountedNode) {
      this.session.setSelectedNodeId(mountedNode.id, { silentIfMissing: true })
    }
    this.emitSelectionChanged()
  }

    /** 清空 Active Page。 */
clearActivePage(): void {
    const activePageId = this.session.session.activePageId
    this.session.setActivePageId(null)
    if (activePageId) this.closePageDesign(activePageId)
    this.emitSelectionChanged()
  }

    /** 读取 Active Page。 */
getActivePage(): ConfigPageNode | null {
    const activePageId = this.session.session.activePageId
    if (!activePageId) return null
    return this.design.findConfigPageByPageId(activePageId)
  }

    /** 执行 begin Navigation Draft 操作。 */
beginNavigationDraft(): NavigationNodeDraft {
    const node = this.requireSelectedNode('未选中导航节点，无法开始导航编辑')
    return this.session.beginNavigationDraft(createNavigationNodeDraft(node))
  }

    /** 执行 discard Navigation Draft 操作。 */
discardNavigationDraft(): void {
    this.session.discardNavigationDraft()
    this.emitNavigationChanged({ scope: 'node' })
  }

    /** 执行 mark Navigation Clean 操作。 */
markNavigationClean(scope: 'root' | 'node' = 'node'): void {
    this.session.markNavigationClean()
    this.emitNavigationChanged({ scope })
  }

    /** 执行 apply Navigation Node Edit 操作。 */
applyNavigationNodeEdit(draft: NavigationNodeDraft): NavigationNodeDraftApplyResult {
    const selected = this.requireSelectedNode('未选中导航节点，无法编辑导航属性')
    if (selected.id !== draft.node.id) {
      throw new Error(`导航编辑节点不匹配: ${draft.node.id} != ${selected.id}`)
    }
    const beforeKey = navigationDraftContentKey(createNavigationNodeDraft(selected))
    const { node, result } = this.design.applyNavigationNodeEdit(draft)
    this.session.setSelectedNodeId(node.id)
    const nextDraft = createNavigationNodeDraft(node.toNodeData())
    this.session.setNavigationDraft(nextDraft)
    if (navigationDraftContentKey(nextDraft) !== beforeKey) {
      this.session.markNavigationDirty('node')
    }
    this.emitNavigationChanged({ scope: 'node', nodeId: node.id })
    return result
  }

    /** 执行 apply Node Kind Preset 操作。 */
applyNodeKindPreset(kind: NavNodeKind): void {
    const node = this.requireSelectedNode('未选中导航节点，无法修改节点类型')
    const draft = this.session.navigationDraft ?? createNavigationNodeDraft(node)
    const nextDraft: NavigationNodeDraft = {
      ...draft,
      node: applyNodeKindPresetToDraft(draft.node, kind),
    }
    this.applyNavigationNodeEdit(nextDraft)
  }

    /** 嵌套配置页 preset：page + hidden + 无 path。 */
applyNestedConfigPagePreset(): void {
    const node = this.requireSelectedNode('未选中导航节点，无法修改节点类型')
    const draft = this.session.navigationDraft ?? createNavigationNodeDraft(node)
    const nextDraft: NavigationNodeDraft = {
      ...draft,
      node: applyNestedConfigPagePresetToDraft(draft.node),
    }
    this.applyNavigationNodeEdit(nextDraft)
  }

  /**
   * 写入指定配置页四文件文本到内存模型。
   *
   * @param command 页面文件写入命令，包含目标 pageId、文件名和新文本。
   */
  writePageFile(command: ProjectPageFileWriteCommand): void {
    const page = this.requirePageDesign(command.pageId)
    page.setFileText(command.fileName, command.text)
    this.emitPageFileChanged(page.pageId, command.fileName)
  }

  /**
   * 读取指定配置页四文件文本。
   *
   * @param fileName 四文件名。
   * @param pageId 可选 pageId；省略时使用当前 activePage。
   */
  readPageFileText(fileName: PageNodeFileName, pageId?: string): string {
    return this.findPageDesign(pageId)?.getFileText(fileName) ?? ''
  }

    /** 是否 is Active Page Loaded。 */
isActivePageLoaded(): boolean {
    return this.getActivePage()?.isLoaded === true
  }

    /** 是否 can Undo Page File。 */
canUndoPageFile(fileName: PageNodeFileName): boolean {
    return this.getActivePage()?.canUndoFile(fileName) ?? false
  }

    /** 是否 can Redo Page File。 */
canRedoPageFile(fileName: PageNodeFileName): boolean {
    return this.getActivePage()?.canRedoFile(fileName) ?? false
  }

    /** 执行 undo Page File 操作。 */
undoPageFile(fileName: PageNodeFileName): boolean {
    const page = this.getActivePage()
    if (!page) return false
    const ok = page.undoFile(fileName)
    if (ok) this.emitPageFileChanged(page.pageId, fileName)
    return ok
  }

    /** 执行 redo Page File 操作。 */
redoPageFile(fileName: PageNodeFileName): boolean {
    const page = this.getActivePage()
    if (!page) return false
    const ok = page.redoFile(fileName)
    if (ok) this.emitPageFileChanged(page.pageId, fileName)
    return ok
  }

    /** 读取 Data Set Tool。 */
getDataSetTool(): DataSetCrudTool | null {
    return this.getActivePage()?.getDataSetTool() ?? null
  }

  /**
   * 通过 DataSetCrudTool 修改当前 active 页的 pagedata.json 内存模型。
   *
   */
  async editDataSet(run: (tool: DataSetCrudTool) => void | Promise<void>): Promise<void> {
    const page = this.requireActivePageDesign()
    await page.editDataSet(run)
    this.emitPageFileChanged(page.pageId, 'pagedata.json')
  }

    /** 读取 Node Tree。 */
getNodeTree(): SparkNodeTreeModel | null {
    return this.getActivePage()?.getNodeTree() ?? null
  }

  /**
   * 通过 SparkNodeTree 修改当前 active 页的 rule.json 节点树。
   *
   */
  async editNodeTree(run: (tree: SparkNodeTreeModel) => void | Promise<void>): Promise<void> {
    const page = this.requireActivePageDesign()
    await page.editNodeTree(run)
    this.emitPageFileChanged(page.pageId, 'rule.json')
  }

    /** 执行 mark Page File Changed 操作。 */
markPageFileChanged(pageId: string, fileName: PageNodeFileName): void {
    this.emitPageFileChanged(pageId, fileName)
  }

    /** 执行 mark Page Loaded Changed 操作。 */
markPageLoadedChanged(pageId: string, loaded: boolean): void {
    const page = this.design.findConfigPageByPageId(pageId)
    if (page) {
      if (loaded) page.markLoaded()
      else page.markUnloaded()
    }
    this.emitRuntimeChanged({ pageId })
  }

  /**
   * 读取承载轴投影：导航树、选中节点与 pageFeatures。
   *
   */
  readNavigationProjection(): ProjectNavigationProjection {
    const navigationRoot = this.design.navigationRoot
    const treeData = navigationRoot.children
    const selectedNodeId = this.session.session.selectedNodeId
    const selectedNode = selectedNodeId
      ? this.design.findNodeById(selectedNodeId)?.toNodeData() ?? null
      : null
    const navigationLocation = selectedNode
      ? this.design.findNodeLocation(selectedNode.id)
      : null
    const navigationDraft = selectedNode
      ? this.session.navigationDraft ?? createNavigationNodeDraft(selectedNode)
      : null
    const pageFeatures = this.design.readPlanningProjection()

    return {
      navigationRoot,
      treeData,
      selectedNode,
      selectedNodeId,
      navigationLocation,
      navigationDraft,
      pageFeatures,
    }
  }

    /** 执行 read Active Page Projection 操作。 */
readActivePageProjection(): ProjectActivePageProjection {
    const activePage = this.getActivePage()
    const pageId = activePage?.pageId ?? ''
    const parseErrors: Record<PageNodeFileName, string | null> = {
      'rule.json': null,
      'pagedata.json': null,
      'script.js': null,
      'style.css': null,
    }

    if (activePage) {
      parseErrors['rule.json'] = tryParseRuleTextError(activePage.getFileText('rule.json'))
      parseErrors['pagedata.json'] = tryParsePageDataTextError(
        activePage.getFileText('pagedata.json'),
        activePage.pageId,
      )
    }

    return {
      pageId,
      ruleJson: activePage?.getFileText('rule.json') ?? '',
      pageDataJson: activePage?.getFileText('pagedata.json') ?? '',
      script: activePage?.getFileText('script.js') ?? '',
      style: activePage?.getFileText('style.css') ?? '',
      parseErrors,
      isLoaded: activePage?.isLoaded === true,
    }
  }

    /** 执行 read Dirty Projection 操作。 */
readDirtyProjection(): ProjectDirtyProjection {
    const activePage = this.getActivePage()
    const dirtyFiles = new Set<PageNodeFileName>()
    if (activePage) {
      for (const name of activePage.getDirtyFileNames()) dirtyFiles.add(name)
    }
    const hasAnyFileDirty = dirtyFiles.size > 0
    const navigationDirty = this.session.navigationDirty
    return {
      dirtyFiles,
      hasAnyFileDirty,
      navigationDirty,
      hasAnyDirty: hasAnyFileDirty || navigationDirty,
    }
  }

  private requireSelectedNode(message: string): ProjectNodeData {
    const selectedNodeId = this.session.session.selectedNodeId
    if (!selectedNodeId) throw new Error(message)
    const node = this.design.findNodeById(selectedNodeId)?.toNodeData() ?? null
    if (!node) throw new Error(message)
    return node
  }

  private requirePageDesign(pageId: string | undefined): ConfigPageNode {
    const normalized = pageId?.trim() ?? this.session.session.activePageId ?? ''
    if (!normalized) throw new Error('无活动页面')
    return this.openPageDesign(normalized)
  }

  private requireActivePageDesign(): ConfigPageNode {
    const page = this.getActivePage()
    if (!page) throw new Error('无活动页面')
    return page
  }

  private findPageDesign(pageId?: string): ConfigPageNode | null {
    const normalized = pageId?.trim() ?? ''
    return normalized ? this.design.findConfigPageByPageId(normalized) : this.getActivePage()
  }

  private emitNavigationChanged(event: { scope: 'root' | 'node'; nodeId?: string }): void {
    const revision = this.nextRevision()
    const modelEvent = {
      type: 'navigation.changed' as const,
      projectId: this.projectId,
      revision,
      scope: event.scope,
      ...(event.nodeId === undefined ? {} : { nodeId: event.nodeId }),
    }
    this.publish(modelEvent)
  }

  private emitSelectionChanged(): void {
    const revision = this.nextRevision()
    this.publish({
      type: 'selection.changed',
      projectId: this.projectId,
      revision,
      nodeId: this.session.session.selectedNodeId,
      pageId: this.session.session.activePageId,
    })
  }

  private emitPageFileChanged(pageId: string, fileName: PageNodeFileName): void {
    const revision = this.nextRevision()
    this.publish({
      type: 'page.file.changed',
      projectId: this.projectId,
      revision,
      pageId,
      fileName,
    })
  }

  private emitRuntimeChanged(event: { pageId?: string }): void {
    const revision = this.nextRevision()
    this.publish({
      type: 'runtime.changed',
      projectId: this.projectId,
      revision,
      ...(event.pageId === undefined ? {} : { pageId: event.pageId }),
    })
  }

  private nextRevision(): number {
    this.revisionCounter += 1
    return this.revisionCounter
  }

  private publish(event: Parameters<ProjectModelEventListener>[0]): void {
    for (const listener of this.listeners) listener(event)
  }
}

function toNavigationRootNodeData(root: ProjectModelData): ProjectNodeData | null {
  const id = root.id?.trim()
  if (id === undefined || id.length === 0) return null
  return {
    ...root,
    id,
    title: root.title,
    nodeKind: root.nodeKind ?? 'module',
  }
}

function resolvePlanningAttachmentRef(
  primaryRef: string | undefined,
  fallbackRef: string | undefined,
): string | undefined {
  const primary = primaryRef?.trim()
  if (primary !== undefined && primary.length > 0) return primary
  const fallback = fallbackRef?.trim()
  return fallback === undefined || fallback.length === 0 ? undefined : fallback
}

function toNavigationPlanningInput(node: ProjectNodeData): NavigationPlanningInput {
  const requirement = readProjectNodeDescription(node)
  const planningAttachmentRef = resolvePlanningAttachmentRef(node.planningAttachmentRef, undefined)
  return {
    nodeId: node.id,
    title: node.title,
    nodeKind: node.nodeKind ?? 'page',
    requirement,
    ...(planningAttachmentRef === undefined ? {} : { planningAttachmentRef }),
  }
}

