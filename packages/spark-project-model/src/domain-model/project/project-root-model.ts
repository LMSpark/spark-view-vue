/**
 * @module @spark-appworks/spark-project-model:domain-model/project/project-root-model
 * 职责：提供项目模型层 project-root-model 能力，围绕 ProjectRootModelEvent、ProjectRootModel 处理导航、页面文件、配置内容、工作区或远端 IO 契约。
 * 边界：只表达项目/页面配置领域模型，不直接渲染组件，也不绕过 pageDesign 四文件链路。
 * AI用途：规划导航、读写 page files 或理解 ProjectModel/ProjectWorkspace 行为时，用本模块定位 domain-model/project/project-root-model。
 */
import { SparkAIModel } from '@spark-appworks/spark-utils'
import type { NavigationClient } from '../../io/navigation-client'
import { replaceNavigationChildrenRemote } from '../../io/navigation-tree-sync'
import type {
  NavigationPlanningInput,
  ProjectPlanningInput,
} from '../../project/project-types'
import type { ProjectModelData, ProjectNodeData } from '../../navigation/project-node'
import type { NavigationRowModel } from '../navigation/navigation-row-model'
import {
  navigationRowPatch,
  navigationRowSiblingIndex,
  navigationRowsFromRoot,
  navigationRowToNodeData,
} from '../navigation/navigation-row-bridge'
import type { PageConfigModel } from '../page/page-config-model'
import {
  buildProjectRootNavigationData,
  projectRootChildrenFromRows,
} from './project-root-bridge'

type NavigationPendingOp =
  | { kind: 'add'; row: NavigationRowModel }
  | { kind: 'update'; id: string }
  | { kind: 'remove'; id: string }
  | { kind: 'replace-children'; children: ProjectNodeData[] }

/** 项目根模型事件。 */
export class ProjectRootModelEvent {
  /** 事件类型，区分导航结构变化和当前选中节点变化。 */
  type: 'navigation.changed' | 'selection.changed'
  /** 递增修订号，供 UI 订阅者判断事件先后。 */
  revision: number

  /** 创建项目根模型事件。 */
  constructor(type: ProjectRootModelEvent['type'], revision: number) {
    this.type = type
    this.revision = revision
  }
}

/**
 * 项目根领域模型。
 *
 * 持有导航扁平行集合；Vue 经 subscribe 刷新，AI 经公开属性与 API 读写。
 *
 * ## 加载 `static load({ projectId, tenantId, client })`
 *
 * 1. `client.loadRoot()` 拉取导航树。
 * 2. 扁平静态展开为 `navigationNodes[]`（`pageConfig` 需对配置页另行 `PageConfigModel.load`）。
 *
 * ## 保存 `save({ client })`
 *
 * 1. 按内存中记录的 add/update/remove 待办依次调用 NavigationClient。
 * 2. 成功后清空 `dirty` 与待办队列；失败时保留 dirty 供重试。
 */
export class ProjectRootModel extends SparkAIModel {
  /** 项目唯一标识，用于和导航节点 projectId 对齐。 */
  projectId: string
  /** 项目显示名称，通常来自导航根节点标题。 */
  name: string
  /** 租户标识，用于远端导航节点写回。 */
  tenantId: string
  /** 扁平导航节点集合，包含 module 根和所有页面/容器节点。 */
  navigationNodes: NavigationRowModel[]
  /** 当前选中的导航节点 id；为空表示没有选中项。 */
  selectedNodeId: string | null
  /** 导航结构或选中态是否存在未保存变更。 */
  dirty: boolean
  /** 导航事件递增修订号。 */
  revision: number

  private readonly listeners = new Set<(event: ProjectRootModelEvent) => void>()
  private readonly pendingOps: NavigationPendingOp[] = []

  /**
   * @param options.projectId 项目 ID。
   * @param options.name 项目名称。
   * @param options.tenantId 租户 ID。
   * @param options.navigationNodes 初始导航节点。
   */
  constructor(options: {
    projectId: string
    name: string
    tenantId: string
    navigationNodes?: NavigationRowModel[]
  }) {
    super(options)
    this.projectId = options.projectId
    this.name = options.name
    this.tenantId = options.tenantId
    this.navigationNodes = options.navigationNodes ?? []
    this.selectedNodeId = null
    this.dirty = false
    this.revision = 0
  }

  /** 序列化项目根领域模型的当前内存态。 */
  toJson(): Record<string, unknown> {
    return {
      projectId: this.projectId,
      name: this.name,
      tenantId: this.tenantId,
      selectedNodeId: this.selectedNodeId,
      dirty: this.dirty,
      revision: this.revision,
      navigationNodes: this.navigationNodes.map((node) => node.toJson()),
    }
  }

  /**
   * 将待提交的导航变更刷写到远端。
   *
   * @param options.client Workspace 提供的 NavigationClient。
   */
  async save(options: { client: NavigationClient }): Promise<void> {
    if (!this.dirty && this.pendingOps.length === 0) return

    const replaceOp = this.pendingOps.find((op): op is Extract<NavigationPendingOp, { kind: 'replace-children' }> => (
      op.kind === 'replace-children'
    ))
    if (replaceOp !== undefined) {
      const serverRoot = await options.client.loadRoot()
      await replaceNavigationChildrenRemote(options.client, serverRoot, replaceOp.children)
      this.pendingOps.length = 0
      this.dirty = false
      return
    }

    for (const op of this.pendingOps) {
      if (op.kind !== 'remove') continue
      await options.client.deleteNode(op.id)
    }

    for (const op of this.pendingOps) {
      if (op.kind !== 'add') continue
      await options.client.addNode({
        parentId: op.row.parentId === '' ? null : op.row.parentId,
        node: navigationRowToNodeData(op.row),
        index: navigationRowSiblingIndex(this.navigationNodes, op.row),
      })
    }

    for (const op of this.pendingOps) {
      if (op.kind !== 'update') continue
      const row = this.findNavigationNode(op.id)
      if (row === null) continue
      await options.client.updateNode(op.id, navigationRowPatch(row))
    }

    this.pendingOps.length = 0
    this.dirty = false
  }

  /**
   * 从远端加载项目导航并构造根模型。
   *
   * @param options.projectId 项目 id。
   * @param options.tenantId 租户 id。
   * @param options.client NavigationClient。
   * @param options.name 可选项目名称；缺省时用导航 root.title。
   */
  static async load(options: {
    projectId: string
    tenantId: string
    client: NavigationClient
    name?: string
  }): Promise<ProjectRootModel> {
    const root = await options.client.loadRoot()
    return new ProjectRootModel({
      projectId: options.projectId,
      name: options.name ?? root.title,
      tenantId: options.tenantId,
      navigationNodes: navigationRowsFromRoot(root, options.projectId, options.tenantId),
    })
  }

  /** 与旧栈 `ProjectModel.navigationDirty` 对齐的别名。 */
  get navigationDirty(): boolean {
    return this.dirty
  }

  get navigationRoot(): ProjectModelData {
    return buildProjectRootNavigationData(this, this.toTree())
  }

  /** 将扁平导航行恢复为可写回 ProjectModel 的 children 树。 */
  toTree(): ProjectNodeData[] {
    return projectRootChildrenFromRows(this.navigationNodes)
  }

  /** 读取项目级策划输入，根节点 description 是短需求来源。 */
  readProjectPlanningInput(): ProjectPlanningInput {
    const rootRow = this.navigationNodes.find((row) => row.parentId === '')
    const requirement = rootRow?.description.trim() ?? ''
    if (requirement.length === 0) {
      throw new Error('projectPlanning: requirement is empty; set navigation root description.')
    }
    return {
      requirement,
      ...(rootRow?.planningAttachmentRef === undefined
        ? {}
        : { planningAttachmentRef: rootRow.planningAttachmentRef }),
    }
  }

  /** 读取单个导航节点的策划输入。 */
  readNavigationNodePlanningInput(nodeId: string): NavigationPlanningInput {
    const row = this.findNavigationNode(nodeId)
    if (row === null) {
      throw new Error(`ProjectRootModel: navigation node not found: ${nodeId}`)
    }
    return this.toNavigationPlanningInput(row)
  }

  /** 读取所有导航节点的策划输入列表。 */
  readNavigationPlanningInputs(): readonly NavigationPlanningInput[] {
    return this.navigationNodes.map((row) => this.toNavigationPlanningInput(row))
  }

  /** 整体替换导航 children 树，并记录一次 replace-children 待提交操作。 */
  replaceNavigationChildren(
    input: ProjectNodeData[] | { children: ProjectNodeData[] },
  ): ProjectModelData {
    const children = Array.isArray(input) ? input : input.children
    const root = buildProjectRootNavigationData(this, children)
    this.navigationNodes = navigationRowsFromRoot(root, this.projectId, this.tenantId)
    this.pendingOps.length = 0
    this.pendingOps.push({ kind: 'replace-children', children })
    this.dirty = true
    this.emit('navigation.changed')
    return root
  }

  /** 订阅项目根模型事件，返回取消订阅函数。 */
  subscribe(listener: (event: ProjectRootModelEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** 设置当前选中的导航节点。 */
  selectNavigationNode(id: string | null): void {
    this.selectedNodeId = id
    this.emit('selection.changed')
  }

  /** 按节点 id 查找导航行。 */
  findNavigationNode(id: string): NavigationRowModel | null {
    return this.navigationNodes.find((node) => node.id === id) ?? null
  }

  /** 添加导航行，并将新增操作加入待保存队列。 */
  addNavigationNode(node: NavigationRowModel): NavigationRowModel {
    const removedIndex = this.pendingOps.findIndex(
      (op) => op.kind === 'remove' && op.id === node.id,
    )
    if (removedIndex >= 0) {
      this.pendingOps.splice(removedIndex, 1)
      this.queueNavigationUpdate(node.id)
    } else {
      this.pendingOps.push({ kind: 'add', row: node })
    }
    this.navigationNodes.push(node)
    this.dirty = true
    this.emit('navigation.changed')
    return node
  }

  /** 更新导航行字段，并将更新操作加入待保存队列。 */
  updateNavigationNode(
    id: string,
    patch: {
      parentId?: string
      title?: string
      description?: string
      nodeKind?: string
      pageConfig?: PageConfigModel | null
    },
  ): NavigationRowModel {
    const node = this.findNavigationNode(id)
    if (node === null) {
      throw new Error(`ProjectRootModel: navigation node not found: ${id}`)
    }
    Object.assign(node, patch)
    this.queueNavigationUpdate(id)
    this.dirty = true
    this.emit('navigation.changed')
    return node
  }

  /** 删除导航行，并将删除操作加入待保存队列。 */
  removeNavigationNode(id: string): NavigationRowModel {
    const index = this.navigationNodes.findIndex((node) => node.id === id)
    if (index < 0) {
      throw new Error(`ProjectRootModel: navigation node not found: ${id}`)
    }
    const removed = this.navigationNodes[index]
    if (removed === undefined) {
      throw new Error(`ProjectRootModel: navigation node not found: ${id}`)
    }
    this.navigationNodes.splice(index, 1)
    if (this.selectedNodeId === id) {
      this.selectedNodeId = null
    }
    this.queueNavigationRemove(id)
    this.dirty = true
    this.emit('navigation.changed')
    return removed
  }

  private queueNavigationUpdate(id: string): void {
    const isPendingAdd = this.pendingOps.some(
      (op) => op.kind === 'add' && op.row.id === id,
    )
    if (isPendingAdd) return
    const alreadyQueued = this.pendingOps.some(
      (op) => op.kind === 'update' && op.id === id,
    )
    if (!alreadyQueued) {
      this.pendingOps.push({ kind: 'update', id })
    }
  }

  private queueNavigationRemove(id: string): void {
    const addIndex = this.pendingOps.findIndex(
      (op) => op.kind === 'add' && op.row.id === id,
    )
    if (addIndex >= 0) {
      this.pendingOps.splice(addIndex, 1)
      return
    }
    for (let index = this.pendingOps.length - 1; index >= 0; index -= 1) {
      const op = this.pendingOps[index]
      if (op?.kind === 'update' && op.id === id) {
        this.pendingOps.splice(index, 1)
      }
    }
    this.pendingOps.push({ kind: 'remove', id })
  }

  private toNavigationPlanningInput(row: NavigationRowModel): NavigationPlanningInput {
    return {
      nodeId: row.id,
      title: row.title,
      nodeKind: row.nodeKind,
      requirement: row.description,
      ...(row.planningAttachmentRef === undefined ? {} : { planningAttachmentRef: row.planningAttachmentRef }),
    }
  }

  private emit(type: ProjectRootModelEvent['type']): void {
    this.revision += 1
    const event = new ProjectRootModelEvent(type, this.revision)
    for (const listener of this.listeners) {
      listener(event)
    }
  }
}
