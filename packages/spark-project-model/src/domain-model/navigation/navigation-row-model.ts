import { SparkAIModel } from '@spark-appworks/spark-utils'
import type { NavigationClient } from '../../io/navigation-client'
import type { NavNodeKind, ProjectNodeData } from '../../navigation/project-node'
import type { NavigationNodePatch } from '../../navigation/navigation-edit'
import type { PageConfigModel } from '../page/page-config-model'

/** NavigationRowModel 构造参数。 */
export type NavigationRowModelInitOptions = {
  /** 节点 ID。 */
  id: string
  /** 父节点 ID；根下顶级为空字符串。 */
  parentId: string
  /** 所属项目 ID。 */
  projectId: string
  /** 所属租户 ID。 */
  tenantId: string
  /** 导航标题。 */
  title: string
  /** 导航描述 / 策划概要。 */
  description?: string
  /** 节点类型（page / module 等）。 */
  nodeKind?: string
  /** 配置页四文件；非配置页为 null。 */
  pageConfig?: PageConfigModel | null
}

/** NavigationRowModel.save 参数。 */
export type NavigationRowModelSaveOptions = {
  /** 导航 HTTP 客户端。 */
  client: NavigationClient
  /** 为 true 时 POST 新节点；否则 PUT 更新已有节点。 */
  create?: boolean
}

/**
 * 导航节点扁平行（NAVIGATION_NODE_FLAT 内存面）。
 *
 * 一行 DB 记录 ↔ 一个实例；树由 `parentId` 表达，**无** `children` 字段。
 * LLM 可见：public 字段 / 方法 / 本 JSDoc 直接投影。
 *
 * @vcmSession 导航扁平行；由 ProjectRootModel.load 装配，单行 save 走 NavigationClient。
 *
 * ## 编辑流程
 *
 * **寻址**：`row.title`、`row.pageConfig!.script`（`script` 是四文件字段名，不是 script 工具）。
 *
 * 1. 读写字段；集合归属 `project.navigationNodes[i]`。
 * 2. 集合增删改可用根上 API（辅助）。
 *
 * ## 保存流程 `save({ client, create? })`
 *
 * 1. 调用方传入 `NavigationClient`（**不**挂公开字段）。
 * 2. `create: true` → `client.addNode({ parentId, node })`（新行）。
 * 3. 默认 → `client.updateNode(id, patch)`，patch 来自当前 `title` / `description` / `nodeKind`。
 * 4. 若挂有 `pageConfig`，页面四文件由 `pageConfig.save({ api })` 单独写（见 `PageConfigModel`）。
 *
 * ## 加载流程
 *
 * 单行不单独 load；由 `ProjectRootModel.load({ client })` 拉整表后填入 `navigationNodes[]`。
 */
export class NavigationRowModel extends SparkAIModel {
  /** 节点 ID。 */
  id: string
  /** 父节点 ID；根下顶级为空字符串。 */
  parentId: string
  /** 所属项目 ID。 */
  projectId: string
  /** 所属租户 ID。 */
  tenantId: string
  /** 导航标题。 */
  title: string
  /** 导航描述 / 策划概要。 */
  description: string
  /** 节点类型（page / module 等）。 */
  nodeKind: string
  /** 配置页四文件；非配置页为 null。 */
  pageConfig: PageConfigModel | null

  /**
   * 创建导航扁平行实例。
   *
   * @param options 扁平行初始化参数。
   */
  constructor(options: NavigationRowModelInitOptions) {
    super(options)
    this.id = options.id
    this.parentId = options.parentId
    this.projectId = options.projectId
    this.tenantId = options.tenantId
    this.title = options.title
    this.description = options.description ?? ''
    this.nodeKind = options.nodeKind ?? 'page'
    this.pageConfig = options.pageConfig ?? null
  }

  toJson(): Record<string, unknown> {
    return {
      id: this.id,
      parentId: this.parentId,
      projectId: this.projectId,
      tenantId: this.tenantId,
      title: this.title,
      description: this.description,
      nodeKind: this.nodeKind,
      pageConfig: this.pageConfig?.toJson() ?? null,
    }
  }

  /** 结束编辑前校验：`id`、`title` 非空；递归校验 `pageConfig`。 */
  validate(): void {
    if (this.id.trim().length === 0) {
      throw new Error('NavigationRowModel.validate: missing id')
    }
    if (this.title.trim().length === 0) {
      throw new Error('NavigationRowModel.validate: missing title')
    }
    this.pageConfig?.validate()
  }

  /**
   * 持久化本行导航属性到导航 API。
   *
   * @param options 导航行持久化参数。
   */
  async save(options: NavigationRowModelSaveOptions): Promise<void> {
    this.validate()
    const { client, create = false } = options
    if (create) {
      await client.addNode({
        parentId: this.parentId.length > 0 ? this.parentId : null,
        node: rowToProjectNodeData(this),
      })
      return
    }
    await client.updateNode(this.id, rowToNavigationPatch(this))
  }
}

function rowToProjectNodeData(row: NavigationRowModel): ProjectNodeData {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    nodeKind: row.nodeKind as NavNodeKind,
  }
}

function rowToNavigationPatch(row: NavigationRowModel): NavigationNodePatch {
  return {
    title: row.title,
    description: row.description,
    nodeKind: row.nodeKind as NavNodeKind,
  }
}

export { rowToProjectNodeData, rowToNavigationPatch }
