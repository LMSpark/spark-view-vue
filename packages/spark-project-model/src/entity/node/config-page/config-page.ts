/** ConfigPageNode——配置页节点，挂接 rule/dataset/script/style。 */
import { getSparkNodeChildren } from '@spark-view/spark-data'
import type { HttpClientBase } from '@spark-view/spark-utils'
import type { NavigationConfigClient } from '../../../service/navigation/client'
import type { BasePageContentLoader } from '../../../service/loader/page-content-types'
import type { PageNodeFileApi } from '../../../service/file/page-file-api'
import type { PageNodeFileCache } from '../../../service/file/page-file-cache'
import type { PageNodeFileName } from '../../../service/file/page-file-registry'
import { PageNode } from '../base'
import type { ProjectConfigPageNodeModelOptions, ConfigPageContentPart, ProjectConfigPageDirtyPart } from '../base'
import { RuleContent } from './rule'
import { DataSetContent } from './dataset'
import { ScriptContent } from './script'
import { StyleContent } from './style'
import { normalizeConfigPageId, resolvePageNodePageId } from '../helpers'
import type { ProjectNodeFamily, PageNodeLoadOptions, PageNodeRenderConfig, ProjectPageNodeSummary } from '../../../contract/node'

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

  isDirty(): boolean { return CONFIG_PAGE_DIRTY_PARTS.some(p => this.isPartDirty(p as ProjectConfigPageDirtyPart)) }
  dirtyParts(): ProjectConfigPageDirtyPart[] { return CONFIG_PAGE_DIRTY_PARTS.filter(p => this.isPartDirty(p as ProjectConfigPageDirtyPart)) as ProjectConfigPageDirtyPart[] }

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
    if (name === 'rule.json') await this.rule.load(this.pageId, l, options)
    else if (name === 'pagedata.json') await this.dataSet.load(this.pageId, l, options)
    else if (name === 'script.js') await this.script.load(this.pageId, l, options)
    else if (name === 'style.css') await this.style.load(this.pageId, l, options)
  }

  getFileText(name: PageNodeFileName): string {
    if (name === 'rule.json') return this.rule.getText()
    if (name === 'pagedata.json') return this.dataSet.getText()
    if (name === 'script.js') return this.script.text
    if (name === 'style.css') return this.style.text
    return ''
  }

  async saveFile(name: PageNodeFileName): Promise<void> {
    if (name === 'rule.json') await this.rule.save(this.pageId, this.fileApi)
    else if (name === 'pagedata.json') await this.dataSet.save(this.pageId, this.fileApi)
    else if (name === 'script.js') await this.script.save(this.pageId, this.fileApi)
    else if (name === 'style.css') await this.style.save(this.pageId, this.fileApi)
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
      navigation: this.navigation.navNode === null ? null : this.navigation.toDraftInput(),
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
      userRequirement: this.userRequirement,
      requirementConstraints: this.requirementConstraints,
      effectiveUserRequirement: this.effectiveUserRequirement,
      ...(this.icon === undefined ? {} : { icon: this.icon }),
    }
  }

  private clearFileCache(name?: PageNodeFileName): void { this.fileCache.clearPageCache(this.pageId, name) }
  private isPartDirty(part: ProjectConfigPageDirtyPart): boolean {
    if (part === 'navigation') return this.navigation.isDirty
    if (part === 'rule') return this.rule.isDirty
    if (part === 'dataSet') return this.dataSet.isDirty
    if (part === 'style') return this.style.isDirty
    if (part === 'script') return this.script.isDirty
    return false
  }
  private async savePart(part: ProjectConfigPageDirtyPart): Promise<void> {
    if (part === 'navigation') { if (!this.navClient) throw new Error('缺少 NavigationConfigClient'); await this.navigation.save(this.navClient) }
    else if (part === 'rule') await this.saveFile('rule.json')
    else if (part === 'dataSet') await this.saveFile('pagedata.json')
    else if (part === 'style') await this.saveFile('style.css')
    else if (part === 'script') await this.saveFile('script.js')
  }
  private wireSubModels(): void { for (const m of [this.navigation, this.rule, this.dataSet, this.style, this.script]) m.subscribe(() => this.notify()) }
  private notify(): void { for (const l of this._listeners) l() }
}
