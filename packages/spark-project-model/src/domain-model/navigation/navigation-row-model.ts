/**
 * @module @spark-appworks/spark-project-model:domain-model/navigation/navigation-row-model
 * 职责：提供项目模型层 navigation-row-model 能力，围绕 NavigationRowModel 处理导航、页面文件、配置内容、工作区或远端 IO 契约。
 * 边界：只表达项目/页面配置领域模型，不直接渲染组件，也不绕过 pageDesign 四文件链路。
 * AI用途：规划导航、读写 page files 或理解 ProjectModel/ProjectWorkspace 行为时，用本模块定位 domain-model/navigation/navigation-row-model。
 */
import { SparkAIModel } from '@spark-appworks/spark-utils'
import type { NavigationClient } from '../../io/navigation-client'
import type { PageConfigModel } from '../page/page-config-model'
import {
  navigationRowPatch,
  navigationRowsFromRoot,
} from './navigation-row-bridge'

/**
 * 导航节点 DB 扁平静态投影。
 *
 * 树结构由 parentId 表达，不含 children。
 */
export class NavigationRowModel extends SparkAIModel {
    /** 唯一标识。 */
id: string
    /** parent Id 标识。 */
parentId: string
    /** project Id 标识。 */
projectId: string
    /** tenant Id 标识。 */
tenantId: string
    /** 显示标题。 */
title: string
    /** description 字段。 */
description: string
    /** node Kind 字段。 */
nodeKind: string
    /** planning Attachment Ref 字段。 */
planningAttachmentRef?: string
    /** 资源路径。 */
path?: string
    /** icon 字段。 */
icon?: string
    /** page Config 配置。 */
pageConfig: PageConfigModel | null

  /**
   * @param options.id 节点 ID（NODE_ID）。
   * @param options.parentId 父节点 ID（PARENT_ID）。
   * @param options.projectId 项目 ID（PROJECT_ID）。
   * @param options.tenantId 租户 ID（TENANT_ID）。
   * @param options.title 节点标题（TITLE）。
   * @param options.description 节点描述（DESCRIPTION）。
   * @param options.nodeKind 节点类型（NODE_KIND）。
   * @param options.pageConfig 页面配置；非配置页为 null。
   */
  constructor(options: {
    id: string
    parentId: string
    projectId: string
    tenantId: string
    title: string
    description?: string
    nodeKind?: string
    planningAttachmentRef?: string
    path?: string
    icon?: string
    pageConfig?: PageConfigModel | null
  }) {
    super(options)
    this.id = options.id
    this.parentId = options.parentId
    this.projectId = options.projectId
    this.tenantId = options.tenantId
    this.title = options.title
    this.description = options.description ?? ''
    this.nodeKind = options.nodeKind ?? 'page'
    if (options.planningAttachmentRef !== undefined) {
      this.planningAttachmentRef = options.planningAttachmentRef
    }
    if (options.path !== undefined) this.path = options.path
    if (options.icon !== undefined) this.icon = options.icon
    this.pageConfig = options.pageConfig ?? null
  }

    /** 执行 to Json 操作。 */
toJson(): Record<string, unknown> {
    return {
      id: this.id,
      parentId: this.parentId,
      projectId: this.projectId,
      tenantId: this.tenantId,
      title: this.title,
      description: this.description,
      nodeKind: this.nodeKind,
      ...(this.planningAttachmentRef === undefined ? {} : { planningAttachmentRef: this.planningAttachmentRef }),
      ...(this.path === undefined ? {} : { path: this.path }),
      ...(this.icon === undefined ? {} : { icon: this.icon }),
      pageConfig: this.pageConfig?.toJson() ?? null,
    }
  }

  /**
   * 将当前行导航属性写入远端（不含 pageConfig 四文件）。
   *
   * @param options.client Workspace 提供的 NavigationClient。
   */
  async save(options: { client: NavigationClient }): Promise<void> {
    await options.client.updateNode(this.id, navigationRowPatch(this))
  }

  /**
   * 从项目导航树中按 id 定位并恢复单行。
   *
   * @param options.id 导航节点 id。
   * @param options.projectId 项目 id（用于扁平行字段）。
   * @param options.tenantId 租户 id。
   * @param options.client NavigationClient。
   */
  static async load(options: {
    id: string
    projectId: string
    tenantId: string
    client: NavigationClient
  }): Promise<NavigationRowModel> {
    const root = await options.client.loadRoot()
    const rows = navigationRowsFromRoot(root, options.projectId, options.tenantId)
    const found = rows.find((row) => row.id === options.id) ?? null
    if (found === null) {
      throw new Error(`NavigationRowModel.load: node not found: ${options.id}`)
    }
    return found
  }
}
