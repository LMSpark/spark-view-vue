import type { DataSet, SparkNode } from "@spark-view/spark-data"
import type { NavDraft, NavContextDraft, NavNodeKind } from "./navigation"
import type { HttpClientBase } from "@spark-view/spark-utils"

export type ProjectNodeFamily = "module" | "config-page" | "vue-page" | "system-action" | "link" | "ref"
export type NodeFamily = ProjectNodeFamily
export type NodeKind = "module" | "page" | "sub-page"
export type ProjectPlanningNodeKind = NodeKind
export type ProjectPagePlanningNodeKind = "page" | "sub-page"
export type ProjectPlanningParentKind = "project" | ProjectPlanningNodeKind
export type ProjectRequirementConstraint = { nodeId: string; title: string; nodeKind: string; description: string }
export type PageNodeLoadOptions = { forceReload?: boolean }
export type PageNodeNavigationConfig = { draft: NavDraft; context: NavContextDraft }
export type PageNodeRenderConfig = { pageId: string; navigation: PageNodeNavigationConfig | null; rule: SparkNode[]; data: DataSet; script: string | undefined; css: string | undefined }
export type PageRenderConfig = PageNodeRenderConfig
export type ProjectPageNodeSummary = Record<string, unknown> & { pageId: string; path: string; title: string; nodeId: string; nodeKind: NavNodeKind; description: string; userRequirement: string; requirementConstraints: ProjectRequirementConstraint[]; effectiveUserRequirement: string; icon?: string }
export type PageSummary = ProjectPageNodeSummary
export type ProjectModelOptions = { projectId: string; fileApi: unknown; fileCache: unknown; contentLoaderFactory: () => unknown; navClient?: unknown; navigationSession?: unknown; description?: string }
export type PageNodeFileStorage = "localStorage" | "sessionStorage" | "memory"
export type PageNodeFactoryOptions = { apiBaseUrl?: string; pagesConfigBaseUrl?: string | (() => string); navigationApiBaseUrl?: string | (() => string); timeout?: number; getHeaders?: () => Record<string, string>; fileStorage?: PageNodeFileStorage; httpClient?: HttpClientBase }
export type PageNodeLike = { readonly pageId: string; readonly isLoaded: boolean; load(options?: PageNodeLoadOptions): Promise<void>; toRenderConfig(): PageNodeRenderConfig; getHttpClient(): HttpClientBase | undefined }
export type PageNodeFactoryLike = { create(pageId: string): PageNodeLike; clearPageCache(pageId: string): void; clearAllCache(): { size: number; keys: string[] }; getCacheStats(): { size: number; keys: string[] }; getHttpClient(): HttpClientBase | undefined }
