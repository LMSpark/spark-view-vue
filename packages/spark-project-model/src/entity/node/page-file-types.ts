import type { HttpClientBase } from '@spark-view/spark-utils'

export const PAGE_NODE_FILE_NAMES: readonly ['rule.json', 'pagedata.json', 'script.js', 'style.css'] = [
  'rule.json',
  'pagedata.json',
  'script.js',
  'style.css',
]

export type PageNodeFileName = typeof PAGE_NODE_FILE_NAMES[number]

export type PageNodeFileLoadOptions = {
  forceReload?: boolean
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

export type PageFileContentLoader = {
  loadPageFileContent(
    pageId: string,
    filename: PageNodeFileName,
    options?: PageNodeFileLoadOptions,
  ): Promise<PageContentLoadResult<string>>
  getHttpClient(): HttpClientBase | undefined
}

export type PageFileWriter = {
  saveFileContent(pageId: string, filename: PageNodeFileName, content: string): Promise<void>
  restoreVersion(pageId: string, filename: PageNodeFileName, version: number): Promise<void>
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
