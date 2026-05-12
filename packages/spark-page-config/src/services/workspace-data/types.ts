import type { ConfigLoader, ConfigLoaderOptions, PageConfigFileName } from '../../types'
import type { HttpClient } from '@spark-view/spark-utils'

export type PageConfigNavNodeKind =
  | 'system-directory'
  | 'module'
  | 'system-page'
  | 'system-action'
  | 'page'
  | 'link'
  | 'sub-page'
  | 'ref'

export type PageConfigLinkTarget = 'iframe' | 'new-tab' | 'self'
export type PageConfigChildPlacement = 'header' | 'sidebar' | 'toolbar' | 'user-menu' | 'parent' | 'flat'
export type PageConfigRootChildPlacement = 'header' | 'sidebar'

export interface PageConfigNavNode {
  id: string
  title: string
  icon?: string
  path?: string
  redirect?: string
  nodeKind?: PageConfigNavNodeKind
  linkTarget?: PageConfigLinkTarget
  parentPageId?: string
  childPlacement?: PageConfigChildPlacement
  children?: PageConfigNavNode[]
}

export interface PageConfigNavConfig {
  title?: string
  childPlacement?: PageConfigRootChildPlacement
  children?: PageConfigNavNode[]
  homePath?: string
}

export interface CreatePageConfigPageInput {
  pageId: string
  title: string
  icon: string
}

export interface CreatePageConfigNavNodeInput {
  node: PageConfigNavNode
  parentId?: string
  index?: number
}

export interface PageConfigLinkProbeResult {
  embeddable: boolean
  reason: string
}

export type PageConfigNavNodeSummary = Pick<PageConfigNavNode, 'id' | 'title' | 'path' | 'nodeKind'>

export type PageConfigFileTextSet = Record<PageConfigFileName, string>
export type PageConfigFileTextPatch = Partial<PageConfigFileTextSet>

export interface ReadPageConfigFileOptions {
  forceReload?: boolean
  missing?: 'throw' | 'empty'
}

export interface ReadPageConfigFilesOptions extends ReadPageConfigFileOptions {}

export interface EnsurePageConfigEntryResult {
  pageCreated: boolean
  navNodeCreated: boolean
}

export type PageConfigNavigationChangeHandler = () => void | Promise<void>

export interface PageConfigDataServiceOptions {
  http: HttpClient
  getPageConfigApi: () => string
  getHeaders?: () => Record<string, string>
  createLoader?: (options: Partial<ConfigLoaderOptions>) => ConfigLoader
  fileStorage?: ConfigLoaderOptions['fileStorage']
}

export interface PageConfigNavigationDataServiceOptions {
  http: HttpClient
  getNavApi: () => string
  onNavigationChanged?: PageConfigNavigationChangeHandler
}

export interface PageConfigProjectDataServiceOptions {
  http: HttpClient
  getProjectApi: () => string
  getTenantId?: () => string | undefined
}

export class PageConfigFileReadError extends Error {
  readonly pageId: string
  readonly filename: PageConfigFileName
  readonly reason: string

  constructor(pageId: string, filename: PageConfigFileName, reason: string, detail?: string) {
    super(`读取页面文件失败: ${pageId}/${filename} (${detail ?? reason})`)
    this.name = 'PageConfigFileReadError'
    this.pageId = pageId
    this.filename = filename
    this.reason = reason
  }
}

export function isPageConfigFileNotFoundError(error: unknown): error is PageConfigFileReadError {
  return error instanceof PageConfigFileReadError && error.reason === 'not-found'
}
