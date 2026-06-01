import type { DataSet, SparkNode } from '@spark-view/spark-data'
import type { NavigationContextEditDto, NavigationNodeEditDto, NavNodeKind } from './navigation.contract'
import type { HttpClientBase } from '@spark-view/spark-utils'

export type ProjectNodeFamily = 'module' | 'config-page' | 'vue-page' | 'system-action' | 'link' | 'ref'
export type NodeKind = 'module' | 'page' | 'sub-page'
export type ProjectEditNodeKind = NodeKind
export type ProjectPageEditNodeKind = 'page' | 'sub-page'
export type ProjectEditParentKind = 'project' | ProjectEditNodeKind
export type ProjectDescriptionContext = { nodeId: string; title: string; nodeKind: string; description: string }
export type PageNodeLoadOptions = { forceReload?: boolean }
export type PageNodeNavigationConfig = { node: NavigationNodeEditDto; context: NavigationContextEditDto }
export type PageNodeRenderConfig = { pageId: string; navigation: PageNodeNavigationConfig | null; rule: SparkNode[]; data: DataSet; script: string | undefined; css: string | undefined }
export type ProjectPageNodeSummary = Record<string, unknown> & { pageId: string; path: string; title: string; nodeId: string; nodeKind: NavNodeKind; description: string; descriptionContext: ProjectDescriptionContext[]; effectiveDescription: string; icon?: string }
export type PageNodeFileStorage = 'localStorage' | 'sessionStorage' | 'memory'
export type PageNodeFactoryOptions = { apiBaseUrl?: string; pagesConfigBaseUrl?: string | (() => string); navigationApiBaseUrl?: string | (() => string); timeout?: number; getHeaders?: () => Record<string, string>; fileStorage?: PageNodeFileStorage; httpClient?: HttpClientBase }
export type PageNodeLike = { readonly pageId: string; readonly isLoaded: boolean; load(options?: PageNodeLoadOptions): Promise<void>; toRenderConfig(): PageNodeRenderConfig; getHttpClient(): HttpClientBase | undefined }
export type PageNodeFactoryLike = { create(pageId: string): PageNodeLike; clearPageCache(pageId: string): void; clearAllCache(): { size: number; keys: string[] }; getCacheStats(): { size: number; keys: string[] }; getHttpClient(): HttpClientBase | undefined }
