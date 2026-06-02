/** ModuleNode——分支节点。 */
import type { DataSet, SparkNode } from '@spark-view/spark-data'
import type { HttpClientBase } from '@spark-view/spark-utils'
import { ProjectNode } from './node-base.entity'
import type { ChildPlacement, NavContextConfig, NavContextItem, NavNodeKind, NavPermissionMode } from './node-base.entity'
import type { NavigationContextEditDto, NavigationNodeEditDto } from '../navigation/edit.entity'

export type ProjectNodeFamily = 'module' | 'config-page' | 'vue-page' | 'system-action' | 'link' | 'ref'
export type NodeKind = 'module' | 'page' | 'sub-page'
export type ProjectEditNodeKind = NodeKind
export type ProjectPageEditNodeKind = 'page' | 'sub-page'
export type ProjectEditParentKind = 'project' | ProjectEditNodeKind
export type ProjectDescriptionContext = { nodeId: string; title: string; nodeKind: string; description: string }
export type PageNodeLoadOptions = { forceReload?: boolean }
export type PageNodeNavigationConfig = { node: NavigationNodeEditDto; context: NavigationContextEditDto }
export type PageNodeRenderConfig = {
  pageId: string
  navigation: PageNodeNavigationConfig | null
  rule: SparkNode[]
  data: DataSet
  script: string | undefined
  css: string | undefined
}
export type ProjectPageNodeSummary = Record<string, unknown> & {
  pageId: string
  path: string
  title: string
  nodeId: string
  nodeKind: NavNodeKind
  description: string
  descriptionContext: ProjectDescriptionContext[]
  effectiveDescription: string
  icon?: string
}
export type PageNodeFileStorage = 'localStorage' | 'sessionStorage' | 'memory'
export type PageNodeFactoryOptions = {
  apiBaseUrl?: string
  pagesConfigBaseUrl?: string | (() => string)
  navigationApiBaseUrl?: string | (() => string)
  timeout?: number
  getHeaders?: () => Record<string, string>
  fileStorage?: PageNodeFileStorage
  httpClient?: HttpClientBase
}
export type PageNodeLike = {
  readonly pageId: string
  readonly isLoaded: boolean
  load(options?: PageNodeLoadOptions): Promise<void>
  toRenderConfig(): PageNodeRenderConfig
  getHttpClient(): HttpClientBase | undefined
}
export type PageNodeFactoryLike = {
  create(pageId: string): PageNodeLike
  clearPageCache(pageId: string): void
  clearAllCache(): { size: number; keys: string[] }
  getCacheStats(): { size: number; keys: string[] }
  getHttpClient(): HttpClientBase | undefined
}

export class ModuleNode<TChild extends ProjectNode = ProjectNode> extends ProjectNode {
  get family(): ProjectNodeFamily { return 'module' }
  get isSystemModule(): boolean { return this.nodeKind === 'system-directory' }
  /**
   * 当前模块节点的直接子节点。
   */
  get children(): TChild[] { return this.readChildren<TChild>() }
  get icon(): string | undefined { return this.node.icon }
  get nodeKind(): NavNodeKind { return this.node.nodeKind ?? 'module' }
  get childPlacement(): ChildPlacement | undefined { return this.node.childPlacement }
  get context(): string | NavContextItem[] | NavContextConfig | undefined { return this.node.context }
  get order(): number | undefined { return this.node.order }
  get hidden(): boolean | undefined { return this.node.hidden }
  get disabled(): boolean | undefined { return this.node.disabled }
  get dividerAfter(): boolean | undefined { return this.node.dividerAfter }
  get permissionMode(): NavPermissionMode | undefined { return this.node.permissionMode }
  get redirect(): string | undefined { return this.node.redirect }
}
