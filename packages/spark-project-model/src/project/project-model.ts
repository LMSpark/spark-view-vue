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
 * @moduleAbility pageDesign.project
 * @moduleKind project
 * @vcmSession 编排会话；无整包 toJson；跨页经 openPageDesign 等 action。
 * @moduleActionMode explicit
 */
export class ProjectModel<TNode extends ProjectNode = ProjectNode> {
  readonly design: ProjectDesign<TNode>
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
   * @vcmIgnore 承载轴过大；策划用 readPlanningProjection，结构化导航用 readNavigationProjection。
   */
  get navigationRoot(): ProjectModelData { return this.design.navigationRoot }
  get navigationDraft(): NavigationNodeDraft | null { return this.session.navigationDraft }
  get isNavigationEditing(): boolean { return this.session.isNavigationEditing }
  get navigationDirty(): boolean { return this.session.navigationDirty }

  subscribe(listener: ProjectModelEventListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getChildNodes(nodeId?: string): TNode[] { return this.design.getChildNodes(nodeId) }
  /** 导航树扁平节点列表，按遍历顺序排列。 */
  get flatRows(): TNode[] { return this.design.flatRows }

  /**
   * 当前活动配置页；需先 openPageDesign(pageId) 才有值。
   *
   * @usageRule 页面四文件读写先取 activePage，再访问 nodeTree / dataSetTool。
   */
  get activePage(): ConfigPageNode | null {
    return this.getActivePage()
  }
  forEachNode(callback: (node: TNode) => void): void { this.design.forEachNode(callback) }

  replaceProjectInfo(project: ProjectInfoInput): ProjectInfo { return this.design.replaceProjectInfo(project) }
  replaceNavigationChildren(children: ProjectNodeData[]): ProjectModelData {
    const root = this.design.replaceNavigationChildren(children)
    this.session.markNavigationDirty('root')
    this.emitNavigationChanged({ scope: 'root' })
    return root
  }

  findNodeById(nodeId: string): TNode | null { return this.design.findNodeById(nodeId) }
  findNodeLocation(nodeId: string): ProjectNodeLocation | null { return this.design.findNodeLocation(nodeId) }
  findConfigPageByPageId(pageId: string): ConfigPageNode | null {
    return this.design.findConfigPageByPageId(pageId)
  }

  /**
   * 按 pageId 打开配置页设计上下文，返回 ConfigPageNode 四文件子模型。
   *
   * @moduleMutation config-page read 进入页面四文件编辑面，不直接落盘。
   * @requiredBeforeCall 先用 vcm_query / vcm_model_guide 确认 project 能力，并确认 pageId 存在于 readPlanningProjection。
   * @usageRule 进入 config-page 后再调用 getNodeTree / getDataSetTool / editNodeTree / editDataSet。
   * @failureMode PAGE_NOT_FOUND pageId 不存在 => 先 readPlanningProjection 确认 pageFeatures，必要时 human_question
   * @failureMode INVALID_TOOL_ARGS 参数形状错误 => 先读 vcm_action_guide，脚本内使用 this.openPageDesign({ pageId: "<pageId>" }) 或 this.openPageDesign("<pageId>")
   * @failureMode SCRIPT_EXECUTION_FAILED editDataSet 或 editNodeTree is not a function => 必须先 await this.openPageDesign({ pageId: "<pageId>" }) 得到 page，再调用 page.editDataSet / page.editNodeTree
   * @param pageId 目标配置页 pageId，必须来自输入。
   */
  openPageDesign(pageId: string): ConfigPageNode { return this.design.openPageDesign(pageId) }
  closePageDesign(pageId: string): void { this.design.closePageDesign(pageId) }

  /**
   * 读取策划轴投影：各 page/sub-page 的 description 与 descriptionContext。
   */
  readPageSummaries(): ProjectPageNodeSummary[] { return this.design.readPageSummaries() }

  /**
   * 策划轴投影别名；与 readPageSummaries 同源。
   *
   * @moduleMutation planning read 只读策划事实，不修改模型。
   */
  readPlanningProjection(): ProjectPageNodeSummary[] { return this.readPageSummaries() }

  /**
   * 读取项目级策划输入：navigation 根 description（短需求）+ 可选策划附件引用。
   *
   * @moduleMutation planning read 只读策划输入，不修改模型。
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
   * @moduleMutation planning read 只读节点策划输入，不修改模型。
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
   * @moduleMutation planning read 只读节点策划输入，不修改模型。
   */
  readNavigationPlanningInputs(): readonly NavigationPlanningInput[] {
    return this.flatRows.map(model => toNavigationPlanningInput(model.toNodeData()))
  }

  /**
   * 更新根模块 childPlacement（项目级 header / sidebar 布局）。
   *
   * @vcmIgnore app-list 项目设置专用，不在 pageDesign AI 面暴露。
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

  addRootModule(createId: () => string): ProjectNodeData {
    const node = this.design.addRootModule(createId)
    this.session.markNavigationDirty('root')
    this.emitNavigationChanged({ scope: 'root', nodeId: node.id })
    return node
  }
  addChildPage(createId: () => string, parent?: ProjectNodeData | null): ProjectNodeData {
    const node = this.design.addChildPage(createId, parent ?? null)
    this.session.markNavigationDirty('root')
    this.emitNavigationChanged({ scope: 'root', nodeId: node.id })
    return node
  }
  removeNode(nodeId: string): ProjectNodeData | null {
    const removed = this.design.removeNode(nodeId)
    this.session.syncWithModel()
    this.session.markNavigationDirty('root')
    this.emitNavigationChanged({ scope: 'root', nodeId })
    return removed
  }
  refreshNavRefs(): void { this.design.refreshNavRefs() }
  toTree(): ProjectNodeData[] { return this.design.toTree() }

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

  selectNode(nodeId: string | null): void {
    this.session.setSelectedNodeId(nodeId)
    this.session.setNavigationDraft(null)
    this.emitSelectionChanged()
  }

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

  clearActivePage(): void {
    const activePageId = this.session.session.activePageId
    this.session.setActivePageId(null)
    if (activePageId) this.closePageDesign(activePageId)
    this.emitSelectionChanged()
  }

  getActivePage(): ConfigPageNode | null {
    const activePageId = this.session.session.activePageId
    if (!activePageId) return null
    return this.design.findConfigPageByPageId(activePageId)
  }

  beginNavigationDraft(): NavigationNodeDraft {
    const node = this.requireSelectedNode('未选中导航节点，无法开始导航编辑')
    return this.session.beginNavigationDraft(createNavigationNodeDraft(node))
  }

  discardNavigationDraft(): void {
    this.session.discardNavigationDraft()
    this.emitNavigationChanged({ scope: 'node' })
  }

  markNavigationClean(scope: 'root' | 'node' = 'node'): void {
    this.session.markNavigationClean()
    this.emitNavigationChanged({ scope })
  }

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

  applyNodeKindPreset(kind: NavNodeKind): void {
    const node = this.requireSelectedNode('未选中导航节点，无法修改节点类型')
    const draft = this.session.navigationDraft ?? createNavigationNodeDraft(node)
    const nextDraft: NavigationNodeDraft = {
      ...draft,
      node: applyNodeKindPresetToDraft(draft.node, kind),
    }
    this.applyNavigationNodeEdit(nextDraft)
  }

  /**
   * 写入指定配置页四文件文本到内存模型。
   *
   * @moduleMutation page-files write 修改内存四文件；落盘由 ProjectWorkspace 编排。
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
   * @moduleMutation page-files read 只读内存中的 rule/pagedata/script/style 文本。
   * @param fileName 四文件名。
   * @param pageId 可选 pageId；省略时使用当前 activePage。
   */
  readPageFileText(fileName: PageNodeFileName, pageId?: string): string {
    return this.findPageDesign(pageId)?.getFileText(fileName) ?? ''
  }

  isActivePageLoaded(): boolean {
    return this.getActivePage()?.isLoaded === true
  }

  canUndoPageFile(fileName: PageNodeFileName): boolean {
    return this.getActivePage()?.canUndoFile(fileName) ?? false
  }

  canRedoPageFile(fileName: PageNodeFileName): boolean {
    return this.getActivePage()?.canRedoFile(fileName) ?? false
  }

  undoPageFile(fileName: PageNodeFileName): boolean {
    const page = this.getActivePage()
    if (!page) return false
    const ok = page.undoFile(fileName)
    if (ok) this.emitPageFileChanged(page.pageId, fileName)
    return ok
  }

  redoPageFile(fileName: PageNodeFileName): boolean {
    const page = this.getActivePage()
    if (!page) return false
    const ok = page.redoFile(fileName)
    if (ok) this.emitPageFileChanged(page.pageId, fileName)
    return ok
  }

  getDataSetTool(): DataSetCrudTool | null {
    return this.getActivePage()?.getDataSetTool() ?? null
  }

  /**
   * 通过 DataSetCrudTool 修改当前 active 页的 pagedata.json 内存模型。
   *
   * @vcmIgnore 请先 openPageDesign(pageId)，在 ConfigPageNode 上 editDataSet。
   * @vcmScriptOnly
   */
  async editDataSet(run: (tool: DataSetCrudTool) => void | Promise<void>): Promise<void> {
    const page = this.requireActivePageDesign()
    await page.editDataSet(run)
    this.emitPageFileChanged(page.pageId, 'pagedata.json')
  }

  getNodeTree(): SparkNodeTreeModel | null {
    return this.getActivePage()?.getNodeTree() ?? null
  }

  /**
   * 通过 SparkNodeTree 修改当前 active 页的 rule.json 节点树。
   *
   * @vcmIgnore 请先 openPageDesign(pageId)，在 ConfigPageNode 上 editNodeTree。
   * @vcmScriptOnly
   */
  async editNodeTree(run: (tree: SparkNodeTreeModel) => void | Promise<void>): Promise<void> {
    const page = this.requireActivePageDesign()
    await page.editNodeTree(run)
    this.emitPageFileChanged(page.pageId, 'rule.json')
  }

  markPageFileChanged(pageId: string, fileName: PageNodeFileName): void {
    this.emitPageFileChanged(pageId, fileName)
  }

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
   * @vcmIgnore pageDesign 请优先 readPlanningProjection；本 action 供 DevSystem 承载轴 UI。
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
    const pageFeatures = this.design.readPageSummaries()

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
