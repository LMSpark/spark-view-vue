/**
 * PageNode file deletion use case.
 *
 * 只负责删除页面四文件，并在删除后清理对应 PageNode 文件缓存。
 */

import type { PageNodeFileApi } from './page-file-api'
import type { PageNodeFileCache } from './page-file-cache'

export type PageNodeFileDeleterOptions = {
  fileApi: PageNodeFileApi
  fileCache: PageNodeFileCache
}

export class PageNodeFileDeleter {
  private readonly fileApi: PageNodeFileApi
  private readonly fileCache: PageNodeFileCache

  constructor(options: PageNodeFileDeleterOptions) {
    this.fileApi = options.fileApi
    this.fileCache = options.fileCache
  }

  async deleteFiles(pageId: string): Promise<void> {
    await this.fileApi.deleteFiles(pageId)
    this.fileCache.clearPageCache(pageId)
  }
}
