/**
 * PageConfigEditWorkspace 与 PageConfigFileLifecycle。
 *
 * 提供页面文件编辑工作区和页面文件生命周期管理能力。
 */

import type { BasePageConfigLoader } from '../page/config-types'
import {
  PAGE_FILE_NAMES,
  createPageDocuments,
  forEachDocument,
  isPageFileDocumentDirty,
  type PageDocumentRegistry,
  type PageFileLoadState,
  type PageFileName,
} from './page-file-document'
import type {
  PageConfigCreatePageParams,
  PageConfigFileApi,
  PageConfigFileVersionSummary,
  PageConfigPageSummary,
} from '../page/page-config-file-api'
import {
  PAGE_CONFIG_FILE_NAMES,
  type PageConfigFileName,
} from '../page/config-types'

// ── SECTION 7: PageConfigEditWorkspace ──

export type PageConfigEditWorkspaceOptions = {
  fileApi: PageConfigFileApi
  getConfigLoader: () => BasePageConfigLoader
}

export class PageConfigEditWorkspace {
  readonly documents: PageDocumentRegistry = createPageDocuments()

  activePageId = ''

  private readonly fileApi: PageConfigFileApi
  private readonly getConfigLoader: () => BasePageConfigLoader
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

  async ensureActivePageFilesLoaded(options?: { forceReload?: boolean; allowMissingAsEmpty?: boolean }): Promise<void> {
    const pageId = this.activePageId
    if (!pageId) return
    const forceReload = options?.forceReload === true
    const allowMissingAsEmpty = options?.allowMissingAsEmpty === true

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
    const previousLoadStates = new Map<PageFileName, PageFileLoadState>()
    for (const entry of PAGE_FILE_NAMES) {
      previousLoadStates.set(entry, this.documents[entry].loadState.value)
    }

    for (const entry of PAGE_FILE_NAMES) {
      const doc = this.documents[entry]
      if (!forceReload && this.isDocumentDirty(entry)) {
        doc.loadState.value = 'loaded'
        continue
      }
      doc.loadState.value = 'loading'
    }

    const loadPromise = (async () => {
      let loadedSnapshots: Array<{ name: PageFileName; text: string }>
      try {
        loadedSnapshots = await Promise.all(
          PAGE_FILE_NAMES.map(async (entry) => ({
            name: entry,
            text: await this.fetchRemotePageFileContent(pageId, entry, { forceReload, allowMissingAsEmpty }),
          })),
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

      for (const snapshot of loadedSnapshots) {
        const doc = this.documents[snapshot.name]
        if (!forceReload && this.isDocumentDirty(snapshot.name)) {
          doc.loadState.value = 'loaded'
          continue
        }
        doc.loadFromText(snapshot.text, { markSaved: true })
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

  async loadPageFile(_name: PageFileName, options?: { forceReload?: boolean; allowMissingAsEmpty?: boolean }): Promise<void> {
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
    options?: { forceReload?: boolean; allowMissingAsEmpty?: boolean },
  ): Promise<string> {
    const result = await this.getConfigLoader().loadPageFileContent(pageId, name, {
      forceReload: options?.forceReload === true,
    })
    if (result.success) return result.data ?? ''
    if (result.reason === 'not-found' && options?.allowMissingAsEmpty === true) return ''
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

// ── SECTION 8: PageConfigFileLifecycle ──

import type { NavNode } from '../page/nav-model'
import {
  defaultNavIconByKind,
  findConfigNodeByPageId,
  normalizeNavNode,
} from '../page/nav-editing'
import type { NavigationConfigClient } from '../page/nav-client'

export type PageConfigFileLifecycleOptions = {
  fileApi: PageConfigFileApi
  navigationClient: NavigationConfigClient
  getConfigLoader?: () => Pick<BasePageConfigLoader, 'clearCache'>
}

export type PageNavigationMountParams = PageConfigCreatePageParams & {
  node?: NavNode
  parentId?: string | null
  index?: number
}

export type CreateMountedPageParams = PageNavigationMountParams & {
  rollbackPageOnNavigationFailure?: boolean
}

export type CreateMountedPageResult = {
  page: Record<string, unknown>
  node: NavNode
}

export type RemoveMountedPageParams = {
  pageId: string
  nodeId?: string
  deleteFiles?: boolean
}

export type RemoveMountedPageResult = {
  deletedNode: NavNode | null
  deletedFiles: boolean
}

function assertNonEmptyPageId(pageId: string): string {
  const normalized = pageId.trim()
  if (normalized.length === 0) {
    throw new Error('pageId must be a non-empty string')
  }
  return normalized
}

function defaultPageNavigationNode(params: PageNavigationMountParams): NavNode {
  const pageId = assertNonEmptyPageId(params.pageId)
  const title = params.title?.trim()
  const icon = params.icon?.trim()
  const node = params.node ?? {
    id: pageId,
    title: title !== undefined && title.length > 0 ? title : pageId,
    icon: icon !== undefined && icon.length > 0 ? icon : defaultNavIconByKind('page'),
    nodeKind: 'page',
    path: `/${pageId}`,
  }
  return normalizeNavNode(node)
}

export class PageConfigFileLifecycle {
  private readonly fileApi: PageConfigFileApi
  private readonly navigationClient: NavigationConfigClient
  private readonly getConfigLoader: (() => Pick<BasePageConfigLoader, 'clearCache'>) | undefined

  constructor(options: PageConfigFileLifecycleOptions) {
    this.fileApi = options.fileApi
    this.navigationClient = options.navigationClient
    this.getConfigLoader = options.getConfigLoader
  }

  async createPage(params: PageConfigCreatePageParams): Promise<Record<string, unknown>> {
    const pageId = assertNonEmptyPageId(params.pageId)
    const result = await this.fileApi.createPage({
      pageId,
      ...(params.title === undefined ? {} : { title: params.title }),
      ...(params.icon === undefined ? {} : { icon: params.icon }),
    })
    this.clearPageCache(pageId)
    return result
  }

  async deletePage(pageId: string): Promise<void> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    await this.fileApi.deletePage(normalizedPageId)
    this.clearPageCache(normalizedPageId)
  }

  async mountPage(params: PageNavigationMountParams): Promise<NavNode> {
    assertNonEmptyPageId(params.pageId)
    return this.navigationClient.addNode({
      ...(params.parentId === undefined ? {} : { parentId: params.parentId }),
      node: defaultPageNavigationNode(params),
      ...(params.index === undefined ? {} : { index: params.index }),
    })
  }

  async createMountedPage(params: CreateMountedPageParams): Promise<CreateMountedPageResult> {
    const pageId = assertNonEmptyPageId(params.pageId)
    const page = await this.createPage(params)
    try {
      const node = await this.mountPage(params)
      return { page, node }
    } catch (error) {
      if (params.rollbackPageOnNavigationFailure === true) {
        await this.fileApi.deletePage(pageId)
        this.clearPageCache(pageId)
      }
      throw error
    }
  }

  async moveMountedPage(nodeId: string, newParentId: string | null, index: number): Promise<NavNode> {
    if (nodeId.trim().length === 0) {
      throw new Error('nodeId must be a non-empty string')
    }
    return this.navigationClient.moveNode(nodeId, newParentId, index)
  }

  async unmountPage(pageId: string, nodeId?: string): Promise<NavNode | null> {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    const resolvedNodeId = await this.resolveNavigationNodeId(normalizedPageId, nodeId)
    return this.navigationClient.deleteNode(resolvedNodeId)
  }

  async removeMountedPage(params: RemoveMountedPageParams): Promise<RemoveMountedPageResult> {
    const pageId = assertNonEmptyPageId(params.pageId)
    const deletedNode = await this.unmountPage(pageId, params.nodeId)
    const shouldDeleteFiles = params.deleteFiles !== false
    if (shouldDeleteFiles) {
      await this.deletePage(pageId)
    }
    return { deletedNode, deletedFiles: shouldDeleteFiles }
  }

  clearPageCache(pageId: string, filename?: PageConfigFileName): void {
    const normalizedPageId = assertNonEmptyPageId(pageId)
    const loader = this.getConfigLoader?.()
    if (loader === undefined) return
    if (filename !== undefined) {
      loader.clearCache(this.toPageConfigLoaderPath(normalizedPageId, filename))
      return
    }
    for (const name of PAGE_CONFIG_FILE_NAMES) {
      loader.clearCache(this.toPageConfigLoaderPath(normalizedPageId, name))
    }
  }

  private async resolveNavigationNodeId(pageId: string, nodeId?: string): Promise<string> {
    const explicitNodeId = nodeId?.trim()
    if (explicitNodeId) return explicitNodeId

    const root = await this.navigationClient.loadRoot()
    const found = findConfigNodeByPageId(root.children, assertNonEmptyPageId(pageId))
    if (found === null) {
      throw new Error(`navigation node not found for pageId: ${pageId}`)
    }
    return found.id
  }

  private toPageConfigLoaderPath(pageId: string, name: PageConfigFileName): string {
    return `/${encodeURIComponent(pageId)}/${encodeURIComponent(name)}`
  }
}
