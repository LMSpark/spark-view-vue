import type { HttpClientBase } from '@spark-appworks/spark-utils'

/** 断言 pageId 是非空字符串，返回 trim 后的值。 */
export function assertNonEmptyPageId(pageId: string): string {
  const normalized = pageId.trim()
  if (normalized.length === 0) {
    throw new Error('pageId must be a non-empty string')
  }
  return normalized
}

export const PAGE_NODE_FILE_NAMES: readonly ['rule.json', 'pagedata.json', 'script.js', 'style.css'] = [
  'rule.json',
  'pagedata.json',
  'script.js',
  'style.css',
]

export type PageNodeFileName = typeof PAGE_NODE_FILE_NAMES[number]

export type PageNodeLoadOptions = {
  forceReload?: boolean
}

export class PageNodeFilePath {
  static forFile(pageId: string, filename: string): string {
    return `/${encodeURIComponent(pageId)}/${encodeURIComponent(filename)}`
  }

  static forPage(pageId: string): readonly string[] {
    return PAGE_NODE_FILE_NAMES.map(filename => PageNodeFilePath.forFile(pageId, filename))
  }
}

export type PageContentLoadResult<T = unknown> = {
  success: boolean
  data?: T
  error?: string
  reason?: string
  source?: 'remote'
  timestamp?: number
  sourceTimestamp?: string
  fromCache?: boolean
  notModified?: boolean
}

export type PageNodeFileVersionSummary = {
  version: number
  createdAt: string
  isCurrent: boolean
  modifiedBy: string | null
}

export type PageFileCreateOptions = {
  title?: string
  icon?: string
}

export type PageFileContentLoader = {
  loadPageFileContent(
    pageId: string,
    filename: PageNodeFileName,
    options?: PageNodeLoadOptions,
  ): Promise<PageContentLoadResult<string>>
  getHttpClient(): HttpClientBase | undefined
}

export type PageFileWriter = {
  createFiles(params: PageFileCreateOptions & { pageId: string }): Promise<Record<string, unknown>>
  deleteFiles(pageId: string): Promise<void>
  saveFileContent(pageId: string, filename: PageNodeFileName, content: string): Promise<void>
  listVersions(pageId: string, filename: PageNodeFileName): Promise<PageNodeFileVersionSummary[]>
  restoreVersion(pageId: string, filename: PageNodeFileName, version: number): Promise<void>
  createVersion(pageId: string, filename: PageNodeFileName): Promise<void>
  deleteVersion(pageId: string, filename: PageNodeFileName, version: number): Promise<void>
}

export type PageFileCache = {
  clearPageCache(pageId: string, filename?: PageNodeFileName): void
}

export type PageFileRestoreCommand = {
  pageId: string
  version: number
  fileApi: PageFileWriter
  contentLoader: PageFileContentLoader
}
