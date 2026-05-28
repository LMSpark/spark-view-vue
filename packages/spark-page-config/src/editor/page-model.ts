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
import type { NavigationConfigClient } from '../navigation'
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
