/**
 * PageModel — 页面聚合模型。
 *
 * 组合 navigation / rule / dataSet / style / script 五个子模型，
 * 只负责跨子模型的生命周期协调（load / save / dirty 聚合 / 订阅聚合）。
 * 不重复暴露子模型 API。
 */

import type { DataSet, SparkNode } from '@spark-view/spark-data'
import { getSparkNodeChildren } from '@spark-view/spark-data'
import type { HttpClientBase } from '@spark-view/spark-utils'
import type { BasePageConfigLoader, PageConfigFileApi } from '../config'
import type { AppNavRoot, NavNode, NavNodeKind, NavNodeLocation, NavigationConfigClient } from '../navigation'
import {
  canUseModuleNodeKind as canUseNavigationModuleNodeKind,
  createReservedRootGroup as createNavigationReservedRootGroup,
  findConfigNodeByPageId as findNavigationConfigNodeByPageId,
  findNodeById as findNavigationNodeById,
  findNodeLocation as findNavigationNodeLocation,
  isConfigNodeKind as isConfigNavigationNodeKind,
  isSystemRootDirectory as isNavigationSystemRootDirectory,
  normalizePageIdFromPath,
} from '../navigation'
import { PageConfigFileLifecycle } from '../design/page-file-lifecycle'
import { NavigationDraftModel } from './navigation-draft-model'
import { PageRuleModel } from './page-rule-model'
import { PageDataSetModel } from './page-data-set-model'
import { PageTextModel } from './page-text-model'

// ═══════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════

export type DirtyPart = 'navigation' | 'rule' | 'dataSet' | 'style' | 'script'

const ALL_PARTS: readonly DirtyPart[] = ['navigation', 'rule', 'dataSet', 'style', 'script']

export type PageModelLoadOptions = {
  forceReload?: boolean
  allowMissingAsEmpty?: boolean
}

export const PAGE_MODEL_FILE_NAMES = ['rule.json', 'pagedata.json', 'script.js', 'style.css'] as const
export type PageModelFileName = typeof PAGE_MODEL_FILE_NAMES[number]

export type PageModelCreatePageParams = {
  title?: string
  icon?: string
}

export type PageModelMountParams = PageModelCreatePageParams & {
  node?: NavNode
  parentId?: string | null
  index?: number
}

export type PageModelCreateMountedParams = PageModelMountParams & {
  rollbackPageOnNavigationFailure?: boolean
}

export type PageModelCreateMountedResult = {
  page: Record<string, unknown>
  node: NavNode
}

export type PageModelRemoveMountedParams = {
  nodeId?: string
  deleteFiles?: boolean
}

export type PageModelRemoveMountedResult = {
  deletedNode: NavNode | null
  deletedFiles: boolean
}

export type PageModelFileVersionSummary = {
  version: number
  createdAt: string
  isCurrent: boolean
  modifiedBy: string | null
}

export type PageModelPageSummary = Record<string, unknown> & {
  pageId: string
  pageType?: string
  files?: PageModelFileName[]
}

export type PageModelRenderConfig = {
  pageId: string
  rule: SparkNode[]
  data: DataSet
  script: string | undefined
  css: string | undefined
}

// ═══════════════════════════════════════════════════════════
// PageModel
// ═══════════════════════════════════════════════════════════

export class PageModel {
  static readonly fileNames: readonly PageModelFileName[] = PAGE_MODEL_FILE_NAMES

  static isFileName(value: unknown): value is PageModelFileName {
    return typeof value === 'string' && PAGE_MODEL_FILE_NAMES.some(name => name === value)
  }

  static resolvePageIdFromPath(path: string | undefined | null): string {
    return normalizePageIdFromPath(path)
  }

  static isConfigNodeKind(nodeKind: string | undefined | null): boolean {
    return isConfigNavigationNodeKind((nodeKind ?? 'page') as NavNodeKind)
  }

  static findNodeById(nodes: readonly NavNode[], targetId: string): NavNode | null {
    return findNavigationNodeById([...nodes], targetId)
  }

  static findNodeLocation(nodes: readonly NavNode[], targetId: string): NavNodeLocation | null {
    return findNavigationNodeLocation([...nodes], targetId)
  }

  static findConfigNodeByPageId(nodes: readonly NavNode[], pageId: string): NavNode | null {
    return findNavigationConfigNodeByPageId([...nodes], pageId)
  }

  static isSystemRootDirectory(node: NavNode | null | undefined, rootNodes: readonly NavNode[]): boolean {
    return isNavigationSystemRootDirectory(node, rootNodes)
  }

  static canUseModuleNodeKind(node: NavNode | null | undefined, rootNodes: readonly NavNode[]): boolean {
    return canUseNavigationModuleNodeKind(node, [...rootNodes])
  }

  static createReservedRootGroup(
    placement: 'toolbar' | 'user-menu',
    options: { createId: () => string; templateRoot?: AppNavRoot | null },
  ): NavNode {
    return createNavigationReservedRootGroup(placement, options)
  }

  readonly pageId: string

  readonly navigation = new NavigationDraftModel()
  readonly rule = new PageRuleModel()
  readonly dataSet = new PageDataSetModel()
  readonly style = new PageTextModel('style.css')
  readonly script = new PageTextModel('script.js')

  private readonly _listeners = new Set<() => void>()
  private _isLoaded = false

  constructor(
    pageId: string,
    private readonly fileApi: PageConfigFileApi,
    private readonly configLoaderFactory: () => BasePageConfigLoader,
    private readonly navClient?: NavigationConfigClient,
  ) {
    this.pageId = pageId.trim()
    if (!this.pageId) {
      throw new Error('pageId 不能为空')
    }
    this._wireSubModels()
  }

  // ── Dirty 聚合 ─────────────────────────────────────────

  /** 子模型是否已完成首次加载。 */
  get isLoaded(): boolean {
    return this._isLoaded
  }

  isDirty(): boolean {
    return ALL_PARTS.some(part => this._isPartDirty(part))
  }

  dirtyParts(): DirtyPart[] {
    return ALL_PARTS.filter(part => this._isPartDirty(part))
  }

  // ── 生命周期 ───────────────────────────────────────────

  /** 加载全部子模型。navigation 不受 load 影响（由 PageEditor 单独管理 navNode 绑定）。有脏数据的子模型不重新加载，除非 forceReload。 */
  async load(options: PageModelLoadOptions = {}): Promise<void> {
    const forceReload = options.forceReload === true
    if (this._isLoaded && !forceReload) return
    const configLoader = this.configLoaderFactory()
    const tasks: Array<Promise<void>> = []
    if (forceReload || !this.rule.isDirty) tasks.push(this.rule.load(this.pageId, configLoader, options))
    if (forceReload || !this.dataSet.isDirty) tasks.push(this.dataSet.load(this.pageId, configLoader, options))
    if (forceReload || !this.style.isDirty) tasks.push(this.style.load(this.pageId, configLoader, options))
    if (forceReload || !this.script.isDirty) tasks.push(this.script.load(this.pageId, configLoader, options))
    await Promise.all(tasks)
    this._isLoaded = true
  }

  /** 保存所有 dirty 子模型。 */
  async save(): Promise<void> {
    const parts = this.dirtyParts()
    await Promise.all(parts.map(part => this._savePart(part)))
  }

  async loadFile(name: PageModelFileName, options?: PageModelLoadOptions): Promise<void> {
    const configLoader = this.configLoaderFactory()
    switch (name) {
      case 'rule.json': await this.rule.load(this.pageId, configLoader, options); break
      case 'pagedata.json': await this.dataSet.load(this.pageId, configLoader, options); break
      case 'script.js': await this.script.load(this.pageId, configLoader, options); break
      case 'style.css': await this.style.load(this.pageId, configLoader, options); break
    }
  }

  getFileText(name: PageModelFileName): string {
    switch (name) {
      case 'rule.json': return this.rule.getText()
      case 'pagedata.json': return this.dataSet.getText()
      case 'script.js': return this.script.text
      case 'style.css': return this.style.text
    }
  }

  async saveFile(name: PageModelFileName): Promise<void> {
    switch (name) {
      case 'rule.json': await this.rule.save(this.pageId, this.fileApi); break
      case 'pagedata.json': await this.dataSet.save(this.pageId, this.fileApi); break
      case 'script.js': await this.script.save(this.pageId, this.fileApi); break
      case 'style.css': await this.style.save(this.pageId, this.fileApi); break
    }
    this.clearFileCache(name)
  }

  async saveDirtyFiles(): Promise<void> {
    const tasks: Array<Promise<void>> = []
    if (this.rule.isDirty) tasks.push(this.saveFile('rule.json'))
    if (this.dataSet.isDirty) tasks.push(this.saveFile('pagedata.json'))
    if (this.script.isDirty) tasks.push(this.saveFile('script.js'))
    if (this.style.isDirty) tasks.push(this.saveFile('style.css'))
    await Promise.all(tasks)
  }

  async createFiles(params: PageModelCreatePageParams = {}): Promise<Record<string, unknown>> {
    const result = await this.fileApi.createPage({
      pageId: this.pageId,
      ...(params.title === undefined ? {} : { title: params.title }),
      ...(params.icon === undefined ? {} : { icon: params.icon }),
    })
    this.clearFileCache()
    return result
  }

  async deleteFiles(): Promise<void> {
    await this.fileApi.deletePage(this.pageId)
    this.clearFileCache()
  }

  async mount(params: PageModelMountParams = {}): Promise<NavNode> {
    return this.lifecycle().mountPage({
      pageId: this.pageId,
      ...params,
    })
  }

  async createMounted(params: PageModelCreateMountedParams = {}): Promise<PageModelCreateMountedResult> {
    return this.lifecycle().createMountedPage({
      pageId: this.pageId,
      ...params,
    })
  }

  async moveMounted(nodeId: string, newParentId: string | null, index: number): Promise<NavNode> {
    return this.lifecycle().moveMountedPage(nodeId, newParentId, index)
  }

  async unmount(nodeId?: string): Promise<NavNode | null> {
    return this.lifecycle().unmountPage(this.pageId, nodeId)
  }

  async removeMounted(params: PageModelRemoveMountedParams = {}): Promise<PageModelRemoveMountedResult> {
    return this.lifecycle().removeMountedPage({
      pageId: this.pageId,
      ...(params.nodeId === undefined ? {} : { nodeId: params.nodeId }),
      ...(params.deleteFiles === undefined ? {} : { deleteFiles: params.deleteFiles }),
    })
  }

  async listVersions(name: PageModelFileName): Promise<PageModelFileVersionSummary[]> {
    return this.fileApi.listVersions(this.pageId, name)
  }

  async restoreVersion(version: number, name: PageModelFileName): Promise<void> {
    const configLoader = this.configLoaderFactory()
    switch (name) {
      case 'rule.json': await this.rule.restoreVersion(this.pageId, version, this.fileApi, configLoader); break
      case 'pagedata.json': await this.dataSet.restoreVersion(this.pageId, version, this.fileApi, configLoader); break
      case 'script.js': await this.script.restoreVersion(this.pageId, version, this.fileApi, configLoader); break
      case 'style.css': await this.style.restoreVersion(this.pageId, version, this.fileApi, configLoader); break
    }
  }

  async createVersion(name: PageModelFileName): Promise<void> {
    await this.fileApi.createVersion(this.pageId, name)
  }

  async deleteVersion(version: number, name: PageModelFileName): Promise<void> {
    await this.fileApi.deleteVersion(this.pageId, name, version)
  }

  clearFileCache(name?: PageModelFileName): void {
    const loader = this.configLoaderFactory()
    if (name !== undefined) {
      loader.clearCache(`/${encodeURIComponent(this.pageId)}/${encodeURIComponent(name)}`)
      return
    }
    for (const file of PageModel.fileNames) {
      loader.clearCache(`/${encodeURIComponent(this.pageId)}/${encodeURIComponent(file)}`)
    }
  }

  // ── 订阅 ───────────────────────────────────────────────

  subscribe(listener: () => void): () => void {
    this._listeners.add(listener)
    return () => { this._listeners.delete(listener) }
  }

  // ── 内部 ───────────────────────────────────────────────

  private _isPartDirty(part: DirtyPart): boolean {
    switch (part) {
      case 'navigation': return this.navigation.isDirty
      case 'rule': return this.rule.isDirty
      case 'dataSet': return this.dataSet.isDirty
      case 'style': return this.style.isDirty
      case 'script': return this.script.isDirty
    }
  }

  /** 获取内部 HTTP 客户端（渲染层复用认证/租户头）。 */
  getHttpClient(): HttpClientBase | undefined {
    return this.configLoaderFactory().getHttpClient()
  }

  /** 渲染层唯一读取口：直接投影当前内存 PageModel，不重新读取文件。 */
  toRenderConfig(): PageModelRenderConfig {
    if (!this._isLoaded) {
      throw new Error(`页面模型 ${this.pageId} 尚未加载完成`)
    }
    return {
      pageId: this.pageId,
      rule: getSparkNodeChildren(this.rule.tree.root.children),
      data: this.dataSet.tool.dataSet,
      script: optionalText(this.script.text),
      css: optionalText(this.style.text),
    }
  }

  private async _savePart(part: DirtyPart): Promise<void> {
    switch (part) {
      case 'navigation': {
        if (!this.navClient) {
          throw new Error('缺少 NavigationConfigClient，无法保存导航')
        }
        await this.navigation.save(this.navClient)
        break
      }
      case 'rule':
        await this.rule.save(this.pageId, this.fileApi)
        break
      case 'dataSet':
        await this.dataSet.save(this.pageId, this.fileApi)
        break
      case 'style':
        await this.style.save(this.pageId, this.fileApi)
        break
      case 'script':
        await this.script.save(this.pageId, this.fileApi)
        break
    }
  }

  private lifecycle(): PageConfigFileLifecycle {
    if (!this.navClient) {
      throw new Error('缺少 NavigationConfigClient，无法执行页面导航生命周期操作')
    }
    return new PageConfigFileLifecycle({
      fileApi: this.fileApi,
      navigationClient: this.navClient,
      getConfigLoader: () => this.configLoaderFactory(),
    })
  }

  /** 监听所有子模型的 dirty 变化，向上冒泡到 PageModel 的 listener。 */
  private _wireSubModels(): void {
    for (const model of [this.navigation, this.rule, this.dataSet, this.style, this.script]) {
      model.subscribe(() => {
        for (const listener of this._listeners) {
          listener()
        }
      })
    }
  }
}

export type PageModelLike = Pick<PageModel, 'pageId' | 'isLoaded' | 'load' | 'toRenderConfig' | 'getHttpClient'>

function optionalText(value: string): string | undefined {
  return value.trim() === '' ? undefined : value
}
