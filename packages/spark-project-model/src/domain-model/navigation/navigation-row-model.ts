import { SparkAIModel } from '@spark-appworks/spark-utils'
import type { PageConfigModel } from '../page/page-config-model'

/**
 * 导航节点 DB 扁平静态投影。
 *
 * 树结构由 parentId 表达，不含 children。
 */
export class NavigationRowModel extends SparkAIModel {
  id: string
  parentId: string
  projectId: string
  tenantId: string
  title: string
  description: string
  nodeKind: string
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

  save(): void {
    throw new Error('NavigationRowModel.save: not implemented')
  }

  static load(id: string): NavigationRowModel {
    throw new Error(`NavigationRowModel.load: not implemented (${id})`)
  }
}
