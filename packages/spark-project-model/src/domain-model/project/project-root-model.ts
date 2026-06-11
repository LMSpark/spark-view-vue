import { deepClone, SparkAIModel } from '@spark-appworks/spark-utils'
import type { NavigationClient } from '../../io/navigation-client'
import type { PageContentLoader } from '../../io/page-content-loader'
import type { PageFileApi } from '../../io/page-file-api'
import {
  flattenProjectNavigationRoot,
  isConfigNodeKind,
  resolvePageNodePageId,
} from '../../navigation/navigation-tree'
import { NavigationRowModel } from '../navigation/navigation-row-model'
import { PageConfigModel } from '../page/page-config-model'

/** ProjectRootModel 构造参数。 */
export type ProjectRootModelInitOptions = {
  /** 项目 ID。 */
  projectId: string
  /** 项目名称。 */
  name: string
  /** 租户 ID。 */
  tenantId: string
  /** 初始导航扁平行。 */
  navigationNodes?: NavigationRowModel[]
}

/** ProjectRootModel.save 参数。 */
export type ProjectRootModelSaveOptions = {
  /** 导航客户端（`flushNavigation` 时使用）。 */
  client: NavigationClient
  /** 页面四文件写 API。 */
  fileApi?: PageFileApi
  /** 为 true 时对每行调用 `NavigationRowModel.save({ client })`。 */
  flushNavigation?: boolean
}

/** 项目根模型事件。 */
export class ProjectRootModelEvent {
  type: 'navigation.changed' | 'selection.changed'
  revision: number

  constructor(type: ProjectRootModelEvent['type'], revision: number) {
    this.type = type
    this.revision = revision
  }
}

/**
 * 项目根模型：导航扁平行集合 + 编辑过程态。
 *
 * LLM 可见：public 字段 / 方法 / 本 JSDoc 直接投影。
 *
 * @vcmSession 会话根模型；恢复走 static load，持久化走 save。
 *
 * ```text
 * projectId, name, tenantId     标量
 * navigationNodes: 行[]          子模型集合（扁平行）
 * selectedNodeId, dirty, revision   过程态
 * ```
 *
 * ## 编辑流程（AI / Vue 共实例）
 *
 * **寻址**：`project.navigationNodes[i]`、`row.pageConfig!.ruleJson` — 属性 + 下标 + 子模型链，**不需要** script 路径串。
 *
 * 1. 读：上述属性链。
 * 2. 写：直接赋值。
 * 3. 集合变更：`addNavigationNode` 等 API（辅助，不替代下标寻址）。
 * 4. 选中：`selectNavigationNode(id)`。
 * 5. **结束编辑**：`validate()`；落盘：`save({ ... })` 内自动校验。
 *
 * ## 加载流程 `load({ projectId, tenantId, client, loader? })`
 *
 * 1. `client.loadRoot()` 取导航树 → `flattenProjectNavigationRoot` 转为扁平行。
 * 2. 每行构造 `NavigationRowModel`；配置页且传入 `loader` 时并行 `PageConfigModel.load` 填 `pageConfig`。
 * 3. 过程态 `selectedNodeId` / `dirty` 重置为初始值。
 *
 * ## 保存流程 `save({ client, fileApi?, flushNavigation? })`
 *
 * 1. `fileApi` 存在时：对每个 `row.pageConfig` 调用 `pageConfig.save({ api })`。
 * 2. `flushNavigation: true` 时：对 `navigationNodes` 逐行 `row.save({ client })`（更新已有行；新行须先 `row.save({ client, create: true })`）。
 * 3. 成功后清除 `dirty`（不自动递归未改子模型）。
 *
 * ## UI 刷新
 *
 * `subscribe(listener)` → `navigation.changed` / `selection.changed`；AI 无事件，读字段/API。
 */
export class ProjectRootModel extends SparkAIModel {
  /** 项目 ID。 */
  projectId: string
  /** 项目名称。 */
  name: string
  /** 租户 ID。 */
  tenantId: string
  /** 导航扁平行集合；AI 主寻址 `navigationNodes[i]`。 */
  navigationNodes: NavigationRowModel[]
  /** 当前选中导航行 id；无选中时为 null。 */
  selectedNodeId: string | null
  /** 内存编辑是否未落盘。 */
  dirty: boolean
  /** 订阅事件递增版本号。 */
  revision: number

  private readonly listeners = new Set<(event: ProjectRootModelEvent) => void>()

  /**
   * 创建项目根模型实例。
   *
   * @param options 项目根初始化参数。
   */
  constructor(options: ProjectRootModelInitOptions) {
    super(options)
    this.projectId = options.projectId
    this.name = options.name
    this.tenantId = options.tenantId
    this.navigationNodes = options.navigationNodes ?? []
    this.selectedNodeId = null
    this.dirty = false
    this.revision = 0
  }

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

  /** 结束编辑前校验：项目 id / 名称非空；递归校验全部导航行。 */
  validate(): void {
    if (this.projectId.trim().length === 0) {
      throw new Error('ProjectRootModel.validate: missing projectId')
    }
    if (this.name.trim().length === 0) {
      throw new Error('ProjectRootModel.validate: missing name')
    }
    for (const row of this.navigationNodes) {
      row.validate()
    }
  }

  /**
   * 从导航 API 加载项目根与全部扁平行。
   *
   * @param options.projectId 项目 ID。
   * @param options.tenantId 租户 ID（写入每行扁平静态字段）。
   * @param options.client 导航客户端。
   * @param options.loader 可选；传入时为配置页加载四文件到 `pageConfig`。
   */
  static async load(options: {
    projectId: string
    tenantId: string
    client: NavigationClient
    loader?: PageContentLoader
  }): Promise<ProjectRootModel> {
    const { projectId, tenantId, client, loader } = options
    const rootData = await client.loadRoot()
    const flat = flattenProjectNavigationRoot(deepClone(rootData))
    const navigationNodes: NavigationRowModel[] = []

    for (const { node, pid } of flat) {
      let pageConfig: PageConfigModel | null = null
      if (loader !== undefined && isConfigNodeKind(node.nodeKind)) {
        const pageId = resolvePageNodePageId(node)
        if (pageId.length > 0) {
          pageConfig = await PageConfigModel.load({ pageId, loader })
        }
      }
      navigationNodes.push(
        new NavigationRowModel({
          id: node.id,
          parentId: pid,
          projectId,
          tenantId,
          title: node.title,
          description: node.description ?? '',
          nodeKind: node.nodeKind ?? 'page',
          pageConfig,
        }),
      )
    }

    return new ProjectRootModel({
      projectId,
      name: rootData.title.trim() || projectId,
      tenantId,
      navigationNodes,
    })
  }

  /**
   * 持久化已挂载的页面配置；可选刷导航扁平行。
   *
   * @param options 持久化参数。
   */
  async save(options: ProjectRootModelSaveOptions): Promise<void> {
    this.validate()
    const { client, fileApi, flushNavigation = false } = options

    if (fileApi !== undefined) {
      for (const row of this.navigationNodes) {
        if (row.pageConfig !== null) {
          await row.pageConfig.save({ api: fileApi })
        }
      }
    }

    if (flushNavigation) {
      for (const row of this.navigationNodes) {
        await row.save({ client })
      }
    }

    this.dirty = false
  }

  subscribe(listener: (event: ProjectRootModelEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  selectNavigationNode(id: string | null): void {
    this.selectedNodeId = id
    this.emit('selection.changed')
  }

  findNavigationNode(id: string): NavigationRowModel | null {
    return this.navigationNodes.find((node) => node.id === id) ?? null
  }

  addNavigationNode(node: NavigationRowModel): NavigationRowModel {
    this.navigationNodes.push(node)
    this.dirty = true
    this.emit('navigation.changed')
    return node
  }

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
    this.dirty = true
    this.emit('navigation.changed')
    return node
  }

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
    this.dirty = true
    this.emit('navigation.changed')
    return removed
  }

  private emit(type: ProjectRootModelEvent['type']): void {
    this.revision += 1
    const event = new ProjectRootModelEvent(type, this.revision)
    for (const listener of this.listeners) {
      listener(event)
    }
  }
}
