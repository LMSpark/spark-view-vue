/**
 * PageNode file cache invalidation.
 *
 * 只负责把 PageNode 四文件路径映射到 loader cache key 并清理缓存。
 */

import type { BasePageContentLoader } from '../loader/page-content-types'
import {
  PageNodeFilePath,
  type PageNodeFileName,
} from './page-file-registry'

export type PageNodeFileCacheOptions = {
  contentLoaderFactory: () => BasePageContentLoader
}

export class PageNodeFileCache {
  private readonly contentLoaderFactory: () => BasePageContentLoader

  constructor(options: PageNodeFileCacheOptions) {
    this.contentLoaderFactory = options.contentLoaderFactory
  }

  clearPageCache(pageId: string, filename?: PageNodeFileName): void {
    const loader = this.contentLoaderFactory()
    if (filename !== undefined) {
      loader.clearCache(PageNodeFilePath.forFile(pageId, filename))
      return
    }
    for (const path of PageNodeFilePath.forPage(pageId)) {
      loader.clearCache(path)
    }
  }
}
