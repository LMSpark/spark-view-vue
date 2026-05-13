import type { ConfigLoader } from '../types'
import {
  PAGE_FILE_NAMES,
  createPageDocuments,
  forEachDocument,
  isPageFileDocumentDirty,
  type PageDocumentRegistry,
  type PageFileName,
} from '../documents'
import type {
  PageConfigCreatePageParams,
  PageConfigFileApi,
  PageConfigFileVersionSummary,
  PageConfigPageSummary,
} from '../files'

export interface PageConfigEditWorkspaceOptions {
  fileApi: PageConfigFileApi
  getConfigLoader: () => ConfigLoader
}

export class PageConfigEditWorkspace {
  readonly documents: PageDocumentRegistry = createPageDocuments()

  activePageId = ''

  private readonly fileApi: PageConfigFileApi
  private readonly getConfigLoader: () => ConfigLoader
  private activePageFilesLoadPromise: Promise<void> | null = null
  private activePageFilesLoadPageId = ''
  private activePageFilesLoadEpoch = 0

  constructor(options: PageConfigEditWorkspaceOptions) {
    this.fileApi = options.fileApi
    this.getConfigLoader = options.getConfigLoader
  }

  setActivePage(pageId: string, forceReset = false): boolean {
    const normalizedPageId = pageId.trim()
    if (!normalizedPageId) {
      this.clear()
      return false
    }

    const shouldReset = forceReset || this.activePageId !== normalizedPageId
    if (shouldReset) {
      this.invalidateActivePageFilesLoad()
      this.resetDocuments()
    }
    this.activePageId = normalizedPageId
    return true
  }

  clear(): void {
    this.invalidateActivePageFilesLoad()
    this.activePageId = ''
    this.resetDocuments()
  }

  resetDocuments(): void {
    forEachDocument(this.documents, (_name, doc) => doc.reset())
  }

  isDocumentDirty(name: PageFileName): boolean {
    return isPageFileDocumentDirty(this.documents[name])
  }

  hasAnyFileDirty(): boolean {
    return PAGE_FILE_NAMES.some(name => this.isDocumentDirty(name))
  }

  notifyPageFileChanged(pageId: string, filename: PageFileName | '__created' | '__deleted' | '__bulk'): void {
    if (filename === '__bulk' || filename === '__created' || filename === '__deleted') {
      this.clearPageConfigCache(pageId)
      this.invalidateActivePageFilesLoad()
      return
    }
    this.clearPageConfigCache(pageId, filename)
  }

  clearPageConfigCache(pageId: string, filename?: PageFileName): void {
    const loader = this.getConfigLoader()
    if (filename !== undefined) {
      loader.clearCache(this.toPageConfigLoaderPath(pageId, filename))
      return
    }
    for (const name of PAGE_FILE_NAMES) {
      loader.clearCache(this.toPageConfigLoaderPath(pageId, name))
    }
  }

  async ensureActivePageFilesLoaded(options?: { forceReload?: boolean }): Promise<void> {
    const pageId = this.activePageId
    if (!pageId) return
    const forceReload = options?.forceReload === true

    if (this.activePageFilesLoadPromise && this.activePageFilesLoadPageId === pageId) {
      return this.activePageFilesLoadPromise
    }

    if (!forceReload && this.areAllActivePageFilesLoaded()) return

    if (!forceReload && PAGE_FILE_NAMES.some(entry => this.isDocumentDirty(entry))) {
      this.promoteNonDirtyLoadedDocuments()
      return
    }

    const loadEpoch = this.activePageFilesLoadEpoch
    this.activePageFilesLoadPageId = pageId
    const previousLoadStates = new Map(
      PAGE_FILE_NAMES.map(entry => [entry, this.documents[entry].loadState.value] as const),
    )

    for (const entry of PAGE_FILE_NAMES) {
      const doc = this.documents[entry]
      if (!forceReload && this.isDocumentDirty(entry)) {
        doc.loadState.value = 'loaded'
        continue
      }
      doc.loadState.value = 'loading'
    }

    const loadPromise = (async () => {
      let loadedSnapshots: ReadonlyArray<readonly [PageFileName, string]>
      try {
        loadedSnapshots = await Promise.all(
          PAGE_FILE_NAMES.map(async (entry) => [
            entry,
            await this.fetchRemotePageFileContent(pageId, entry, { forceReload }),
          ] as const),
        )
      } catch (error) {
        if (this.activePageFilesLoadEpoch === loadEpoch && this.activePageId === pageId) {
          for (const entry of PAGE_FILE_NAMES) {
            this.documents[entry].loadState.value = previousLoadStates.get(entry) ?? 'idle'
          }
        }
        throw error
      }

      if (this.activePageFilesLoadEpoch !== loadEpoch || this.activePageId !== pageId) return

      for (const [entry, loadedText] of loadedSnapshots) {
        const doc = this.documents[entry]
        if (!forceReload && this.isDocumentDirty(entry)) {
          doc.loadState.value = 'loaded'
          continue
        }
        doc.loadFromText(loadedText, { markSaved: true })
      }
    })().finally(() => {
      if (this.activePageFilesLoadEpoch === loadEpoch && this.activePageFilesLoadPageId === pageId) {
        this.activePageFilesLoadPromise = null
        this.activePageFilesLoadPageId = ''
      }
    })

    this.activePageFilesLoadPromise = loadPromise
    return loadPromise
  }

  async loadPageFile(_name: PageFileName, options?: { forceReload?: boolean }): Promise<void> {
    await this.ensureActivePageFilesLoaded(options)
  }

  async savePageFile(name: PageFileName): Promise<void> {
    if (!this.activePageId) return
    const doc = this.documents[name]
    await this.fileApi.saveFileContent(this.activePageId, name, doc.text.value)
    doc.markSaved()
    this.notifyPageFileChanged(this.activePageId, name)
  }

  async listPages(): Promise<PageConfigPageSummary[]> {
    return this.fileApi.listPages()
  }

  async createPage(params: PageConfigCreatePageParams): Promise<Record<string, unknown>> {
    const result = await this.fileApi.createPage(params)
    this.notifyPageFileChanged(params.pageId, '__created')
    return result
  }

  async deletePage(pageId: string): Promise<void> {
    await this.fileApi.deletePage(pageId)
    this.notifyPageFileChanged(pageId, '__deleted')
  }

  async listRemotePageVersions(filename: PageFileName): Promise<PageConfigFileVersionSummary[]> {
    if (!this.activePageId) return []
    return this.fileApi.listVersions(this.activePageId, filename)
  }

  async restoreRemotePageVersion(version: number, filename: PageFileName): Promise<void> {
    if (!this.activePageId) return
    const pageId = this.activePageId
    await this.fileApi.restoreVersion(pageId, filename, version)
    this.clearPageConfigCache(pageId, filename)
    this.invalidateActivePageFilesLoad()
    const restoredText = await this.fetchRemotePageFileContent(pageId, filename, { forceReload: true })
    this.documents[filename].loadFromText(restoredText, { markSaved: true })
    this.notifyPageFileChanged(pageId, filename)
  }

  async createRemotePageVersion(filename: PageFileName): Promise<void> {
    if (!this.activePageId) return
    await this.fileApi.createVersion(this.activePageId, filename)
  }

  async deleteRemotePageVersion(version: number, filename: PageFileName): Promise<void> {
    if (!this.activePageId) return
    await this.fileApi.deleteVersion(this.activePageId, filename, version)
  }

  private async fetchRemotePageFileContent(
    pageId: string,
    name: PageFileName,
    options?: { forceReload?: boolean },
  ): Promise<string> {
    const result = await this.getConfigLoader().loadPageFileContent(pageId, name, {
      forceReload: options?.forceReload === true,
    })
    if (result.success) return result.data ?? ''
    const detail = result.error ?? result.reason ?? 'unknown'
    throw new Error(`读取页面文件失败: ${pageId}/${name} (${detail})`)
  }

  private areAllActivePageFilesLoaded(): boolean {
    return PAGE_FILE_NAMES.every(entry => this.documents[entry].loadState.value === 'loaded')
  }

  private promoteNonDirtyLoadedDocuments(): void {
    for (const entry of PAGE_FILE_NAMES) {
      const doc = this.documents[entry]
      if (doc.loadState.value !== 'loading' && !this.isDocumentDirty(entry) && doc.loadState.value === 'idle') {
        if (doc.text.value || doc.savedText.value) doc.loadState.value = 'loaded'
      }
    }
  }

  private invalidateActivePageFilesLoad(): void {
    this.activePageFilesLoadPromise = null
    this.activePageFilesLoadPageId = ''
    this.activePageFilesLoadEpoch += 1
  }

  private toPageConfigLoaderPath(pageId: string, name: PageFileName): string {
    return `/${encodeURIComponent(pageId)}/${encodeURIComponent(name)}`
  }
}

export type {
  PageConfigPageSummary,
  PageConfigCreatePageParams,
}
