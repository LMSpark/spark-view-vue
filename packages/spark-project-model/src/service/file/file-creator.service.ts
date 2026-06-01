/**
 * PageNode file creation use case.
 *
 * 只负责创建页面四文件，并在创建后清理对应 PageNode 文件缓存。
 */

import type {
  PageNodeCreateFilesParams,
  PageNodeFileApi,
} from './file-api.service'
import type { PageNodeFileCache } from './file-cache.service'

export type PageNodeCreatePageParams = Omit<PageNodeCreateFilesParams, 'pageId'>

export type PageNodeFileCreatorOptions = {
  fileApi: PageNodeFileApi
  fileCache: PageNodeFileCache
}

export class PageNodeFileCreator {
  private readonly fileApi: PageNodeFileApi
  private readonly fileCache: PageNodeFileCache

  constructor(options: PageNodeFileCreatorOptions) {
    this.fileApi = options.fileApi
    this.fileCache = options.fileCache
  }

  async createFiles(params: PageNodeCreateFilesParams): Promise<Record<string, unknown>> {
    const result = await this.fileApi.createFiles(params)
    this.fileCache.clearPageCache(params.pageId)
    return result
  }
}
