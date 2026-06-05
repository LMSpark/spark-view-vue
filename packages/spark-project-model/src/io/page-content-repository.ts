/**
 * PageContentRepository — 配置页四文件的持久化适配（load/save/版本/资产 CRUD）。
 * 领域 ConfigPageNode 只持内存内容；本类负责 IO 与缓存失效。
 */
import type { ConfigPageNode } from '../model/page/config-page'
import type {
  PageFileCreateOptions,
  PageNodeFileName,
  PageNodeFileVersionSummary,
  PageNodeLoadOptions,
} from '../model/page/file'
import { PAGE_NODE_FILE_NAMES } from '../model/page/file'
import type { ProjectModelIoPorts } from '../model/project/ports'

export class PageContentRepository {
  constructor(private readonly io: ProjectModelIoPorts) {}

  async createPageFiles(
    page: ConfigPageNode,
    options: PageFileCreateOptions = {},
  ): Promise<Record<string, unknown>> {
    const result = await this.io.fileApi.createFiles({
      pageId: page.pageId,
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.icon === undefined ? {} : { icon: options.icon }),
    })
    this.clearPageCache(page.pageId)
    return result
  }

  async deletePageFiles(page: ConfigPageNode): Promise<void> {
    await this.io.fileApi.deleteFiles(page.pageId)
    this.clearPageCache(page.pageId)
  }

  async loadPage(page: ConfigPageNode, options: PageNodeLoadOptions = {}): Promise<void> {
    const forceReload = options.forceReload === true
    if (page.isLoaded && !forceReload) return
    const loader = this.io.contentLoaderFactory()
    await Promise.all(
      PAGE_NODE_FILE_NAMES.map(async (name) => {
        const result = await loader.loadPageFileContent(page.pageId, name, {
          forceReload,
        })
        if (!result.success) {
          throw new Error(result.error ?? result.reason ?? `${name} 加载失败`)
        }
        page.hydrateFileText(name, result.data ?? '')
      }),
    )
    page.markLoaded()
  }

  async loadPageFile(
    page: ConfigPageNode,
    name: PageNodeFileName,
    options?: PageNodeLoadOptions,
  ): Promise<void> {
    const loader = this.io.contentLoaderFactory()
    const result = await loader.loadPageFileContent(page.pageId, name, {
      forceReload: options?.forceReload === true,
    })
    if (!result.success) {
      throw new Error(result.error ?? result.reason ?? `${name} 加载失败`)
    }
    page.hydrateFileText(name, result.data ?? '')
  }

  async savePageFile(page: ConfigPageNode, name: PageNodeFileName): Promise<void> {
    await this.io.fileApi.saveFileContent(page.pageId, name, page.getFileText(name))
    page.markFileSaved(name)
    this.clearPageCache(page.pageId, name)
  }

  async saveDirtyPageFiles(page: ConfigPageNode): Promise<void> {
    await Promise.all(page.getDirtyFileNames().map(name => this.savePageFile(page, name)))
  }

  async listFileVersions(page: ConfigPageNode, name: PageNodeFileName): Promise<PageNodeFileVersionSummary[]> {
    return this.io.fileApi.listVersions(page.pageId, name)
  }

  async restoreRemoteFileVersion(
    page: ConfigPageNode,
    name: PageNodeFileName,
    version: number,
  ): Promise<void> {
    await this.io.fileApi.restoreVersion(page.pageId, name, version)
    const loader = this.io.contentLoaderFactory()
    const result = await loader.loadPageFileContent(page.pageId, name, { forceReload: true })
    if (!result.success) {
      throw new Error(`恢复版本后读取失败: ${page.pageId}/${name} v${version}`)
    }
    page.hydrateFileText(name, result.data ?? '')
    page.markFileSaved(name)
    this.clearPageCache(page.pageId, name)
  }

  async createFileVersion(page: ConfigPageNode, name: PageNodeFileName): Promise<void> {
    await this.io.fileApi.createVersion(page.pageId, name)
  }

  async deleteFileVersion(
    page: ConfigPageNode,
    name: PageNodeFileName,
    version: number,
  ): Promise<void> {
    await this.io.fileApi.deleteVersion(page.pageId, name, version)
  }

  clearPageCache(pageId: string, filename?: PageNodeFileName): void {
    this.io.fileCache.clearPageCache(pageId, filename)
  }
}
