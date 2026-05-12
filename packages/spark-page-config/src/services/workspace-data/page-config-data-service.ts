import type { ConfigLoader, PageConfigFileName } from '../../types'
import { PAGE_CONFIG_FILE_NAMES } from '../../types'
import { PageConfigFileApi, type PageConfigFileVersionSummary } from '../../files'
import { createConfigLoader } from '../../loader'
import type {
  CreatePageConfigPageInput,
  PageConfigDataServiceOptions,
  PageConfigFileTextPatch,
  PageConfigFileTextSet,
  ReadPageConfigFileOptions,
  ReadPageConfigFilesOptions,
} from './types'
import {
  PageConfigFileReadError,
  isPageConfigFileNotFoundError,
} from './types'

export class PageConfigDataService {
  private readonly http: PageConfigDataServiceOptions['http']
  private readonly getPageConfigApi: () => string
  private readonly getHeaders: (() => Record<string, string>) | undefined
  private readonly createLoader: NonNullable<PageConfigDataServiceOptions['createLoader']>
  private readonly fileStorage: NonNullable<PageConfigDataServiceOptions['fileStorage']>
  private readonly fileApi: PageConfigFileApi
  private loader: ConfigLoader | null = null
  private loaderBaseUrl = ''

  constructor(options: PageConfigDataServiceOptions) {
    this.http = options.http
    this.getPageConfigApi = options.getPageConfigApi
    this.getHeaders = options.getHeaders
    this.createLoader = options.createLoader ?? createConfigLoader
    this.fileStorage = options.fileStorage ?? 'localStorage'
    this.fileApi = new PageConfigFileApi({
      getPageConfigApi: this.getPageConfigApi,
      http: this.http,
    })
  }

  listPages(): Promise<Array<Record<string, unknown>>> {
    return this.http.get<Array<Record<string, unknown>>>(`${this.getPageConfigApi()}/__list`)
  }

  async createPage(input: CreatePageConfigPageInput): Promise<void> {
    await this.http.post(`${this.getPageConfigApi()}/__create`, input)
    this.clearCache(input.pageId)
  }

  async ensurePage(input: CreatePageConfigPageInput): Promise<{ created: boolean }> {
    const page = (await this.listPages()).find(item => String(item['pageId'] ?? '') === input.pageId)
    if (page !== undefined && page['hasDir'] !== false) return { created: false }
    await this.createPage(input)
    return { created: true }
  }

  async readFileText(
    pageId: string,
    filename: PageConfigFileName,
    options?: ReadPageConfigFileOptions,
  ): Promise<string> {
    const result = await this.getLoader().loadPageFileContent(pageId, filename, {
      forceReload: options?.forceReload === true,
    })
    if (result.success) return result.data ?? ''
    const detail = result.error ?? result.reason ?? 'unknown'
    const error = new PageConfigFileReadError(pageId, filename, result.reason ?? 'unknown', detail)
    if (options?.missing === 'empty' && isPageConfigFileNotFoundError(error)) return ''
    throw error
  }

  async readFiles(
    pageId: string,
    options?: ReadPageConfigFilesOptions,
  ): Promise<PageConfigFileTextSet> {
    const entries = await Promise.all(
      PAGE_CONFIG_FILE_NAMES.map(async (filename) => [
        filename,
        await this.readFileTextForSet(pageId, filename, options),
      ] as const),
    )
    return Object.fromEntries(entries) as PageConfigFileTextSet
  }

  async saveFileContent(pageId: string, filename: PageConfigFileName, content: string): Promise<void> {
    await this.fileApi.saveFileContent(pageId, filename, content)
    this.clearCache(pageId, filename)
  }

  async saveFiles(pageId: string, files: PageConfigFileTextPatch): Promise<void> {
    const writes = PAGE_CONFIG_FILE_NAMES.map(async (filename) => {
      const content = files[filename]
      if (content === undefined) return
      await this.saveFileContent(pageId, filename, content)
    })
    await Promise.all(writes)
  }

  listFileVersions(pageId: string, filename: PageConfigFileName): Promise<PageConfigFileVersionSummary[]> {
    return this.fileApi.listVersions(pageId, filename)
  }

  async restoreFileVersion(pageId: string, filename: PageConfigFileName, version: number): Promise<void> {
    await this.fileApi.restoreVersion(pageId, filename, version)
    this.clearCache(pageId, filename)
  }

  createFileVersion(pageId: string, filename: PageConfigFileName): Promise<void> {
    return this.fileApi.createVersion(pageId, filename)
  }

  deleteFileVersion(pageId: string, filename: PageConfigFileName, version: number): Promise<void> {
    return this.fileApi.deleteVersion(pageId, filename, version)
  }

  clearCache(pageId?: string, filename?: PageConfigFileName): void {
    const loader = this.getLoader()
    if (!pageId) {
      loader.clearCache()
      return
    }
    if (filename !== undefined) {
      loader.clearCache(PageConfigDataService.toLoaderPath(pageId, filename))
      return
    }
    for (const name of PAGE_CONFIG_FILE_NAMES) {
      loader.clearCache(PageConfigDataService.toLoaderPath(pageId, name))
    }
  }

  private getLoader(): ConfigLoader {
    const pagesConfigBaseUrl = this.getPageConfigApi()
    if (this.loader === null || this.loaderBaseUrl !== pagesConfigBaseUrl) {
      this.loader = this.createLoader({
        pagesConfigBaseUrl,
        fileStorage: this.fileStorage,
        ...(this.getHeaders !== undefined ? { getHeaders: this.getHeaders } : {}),
      })
      this.loaderBaseUrl = pagesConfigBaseUrl
    }
    return this.loader
  }

  private async readFileTextForSet(
    pageId: string,
    filename: PageConfigFileName,
    options?: ReadPageConfigFilesOptions,
  ): Promise<string> {
    return await this.readFileText(pageId, filename, options)
  }

  private static toLoaderPath(pageId: string, filename: PageConfigFileName): string {
    return `/${encodeURIComponent(pageId)}/${encodeURIComponent(filename)}`
  }
}
