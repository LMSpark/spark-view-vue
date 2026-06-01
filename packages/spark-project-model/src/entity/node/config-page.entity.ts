/** ConfigPageNode——配置页节点，挂接 rule/dataset/script/style。 */
import { getSparkNodeChildren } from '@spark-view/spark-data'
import type { HttpClientBase } from '@spark-view/spark-utils'
import type { NavigationConfigClient } from '../../service/navigation/client.service'
import type { BasePageContentLoader } from '../../service/content-loader/types'
import type { PageNodeFileApi } from '../../service/file/file-api.service'
import type { PageNodeFileCache } from '../../service/file/file-cache.service'
import type { PageNodeFileName } from '../../service/file/file-registry.service'
import { PageNode } from './node-base.entity'
import type { ProjectConfigPageNodeModelOptions, ConfigPageContentPart, ProjectConfigPageDirtyPart } from './node-base.entity'
import { RuleContent } from '../content/rule.entity'
import { DataSetContent } from '../content/dataset.entity'
import { ScriptContent, StyleContent } from '../content/text.entity'
import { normalizeConfigPageId, resolvePageNodePageId } from './node-helpers'
import type { ProjectNodeFamily, PageNodeLoadOptions, PageNodeRenderConfig, ProjectPageNodeSummary } from '../../contract/node.contract'

export type { ProjectConfigPageNodeModelOptions, ConfigPageContentPart, ProjectConfigPageDirtyPart }

const CONFIG_PAGE_DIRTY_PARTS = ['navigation', 'rule', 'dataSet', 'style', 'script'] as const

function optionalText(value: string): string | undefined { return value.trim() === '' ? undefined : value }

export class ConfigPageNode extends PageNode {
  readonly rule = new RuleContent()
  readonly dataSet = new DataSetContent()
  readonly style = new StyleContent()
  readonly script = new ScriptContent()
  private readonly _pageId: string
  private readonly fileApi: PageNodeFileApi
  private readonly fileCache: PageNodeFileCache
  private readonly contentLoaderFactory: () => BasePageContentLoader
  private readonly navClient: NavigationConfigClient | undefined
  private readonly _listeners = new Set<() => void>()
  private _isLoaded = false

  constructor(options: ProjectConfigPageNodeModelOptions) {
    super(options)
    this._pageId = normalizeConfigPageId(options.pageId ?? resolvePageNodePageId(options.node))
    if (!this._pageId) throw new Error('配置页面节点缺少 pageId')
    this.fileApi = options.fileApi; this.fileCache = options.fileCache
    this.contentLoaderFactory = options.contentLoaderFactory; this.navClient = options.navClient
    this.wireSubModels()
  }

  get family(): ProjectNodeFamily { return 'config-page' }
  get pageNodeKind(): 'config' { return 'config' }
  get pageId(): string { return this._pageId }
  get resolvedPath(): string { return this.path ?? `/${this.pageId}` }
  get isLoaded(): boolean { return this._isLoaded }

  isDirty(): boolean { return CONFIG_PAGE_DIRTY_PARTS.some(p => this.isPartDirty(p)) }
  dirtyParts(): ProjectConfigPageDirtyPart[] { return CONFIG_PAGE_DIRTY_PARTS.filter(p => this.isPartDirty(p)) }

  async load(options: PageNodeLoadOptions = {}): Promise<void> {
    const forceReload = options.forceReload === true
    if (this._isLoaded && !forceReload) return
    const l = this.contentLoaderFactory()
    await Promise.all([
      this.rule.load(this.pageId, l, options),
      this.dataSet.load(this.pageId, l, options),
      this.style.load(this.pageId, l, options),
      this.script.load(this.pageId, l, options),
    ])
    this._isLoaded = true
  }

  async save(): Promise<void> { await Promise.all(this.dirtyParts().map(p => this.savePart(p))) }

  async loadFile(name: PageNodeFileName, options?: PageNodeLoadOptions): Promise<void> {
    const l = this.contentLoaderFactory()
    switch (name) {
      case 'rule.json': await this.rule.load(this.pageId, l, options); return
      case 'pagedata.json': await this.dataSet.load(this.pageId, l, options); return
      case 'script.js': await this.script.load(this.pageId, l, options); return
      case 'style.css': await this.style.load(this.pageId, l, options); return
    }
  }

  getFileText(name: PageNodeFileName): string {
    switch (name) {
      case 'rule.json': return this.rule.getText()
      case 'pagedata.json': return this.dataSet.getText()
      case 'script.js': return this.script.text
      case 'style.css': return this.style.text
    }
  }

  async saveFile(name: PageNodeFileName): Promise<void> {
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

  subscribe(l: () => void): () => void { this._listeners.add(l); return () => { this._listeners.delete(l) } }
  getHttpClient(): HttpClientBase | undefined { return this.contentLoaderFactory().getHttpClient() }

  toRenderConfig(): PageNodeRenderConfig {
    if (!this._isLoaded) throw new Error(`配置页面节点 ${this.pageId} 尚未加载完成`)
    return {
      pageId: this.pageId,
      navigation: this.navigation.navNode === null ? null : this.navigation.toEditInputDto(),
      rule: getSparkNodeChildren(this.rule.tree.root.children),
      data: this.dataSet.tool.dataSet,
      script: optionalText(this.script.text),
      css: optionalText(this.style.text),
    }
  }

  toSummary(): ProjectPageNodeSummary {
    return {
      pageId: this.pageId, path: this.resolvedPath, title: this.title,
      nodeId: this.id, nodeKind: this.nodeKind, description: this.description,
      descriptionContext: this.descriptionContext,
      effectiveDescription: this.effectiveDescription,
      ...(this.icon === undefined ? {} : { icon: this.icon }),
    }
  }

  private clearFileCache(name?: PageNodeFileName): void { this.fileCache.clearPageCache(this.pageId, name) }
  private isPartDirty(part: ProjectConfigPageDirtyPart): boolean {
    if (part === 'navigation') return this.navigation.isDirty
    if (part === 'rule') return this.rule.isDirty
    if (part === 'dataSet') return this.dataSet.isDirty
    if (part === 'style') return this.style.isDirty
    return this.script.isDirty
  }
  private async savePart(part: ProjectConfigPageDirtyPart): Promise<void> {
    if (part === 'navigation') { if (!this.navClient) throw new Error('缺少 NavigationConfigClient'); await this.navigation.save(this.navClient) }
    else if (part === 'rule') await this.saveFile('rule.json')
    else if (part === 'dataSet') await this.saveFile('pagedata.json')
    else if (part === 'style') await this.saveFile('style.css')
    else await this.saveFile('script.js')
  }
  private wireSubModels(): void { for (const m of [this.navigation, this.rule, this.dataSet, this.style, this.script]) m.subscribe(() => this.notify()) }
  private notify(): void { for (const l of this._listeners) l() }
}
