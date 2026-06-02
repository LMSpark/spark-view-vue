/** ConfigPageNode——配置页节点，挂接 rule/dataset/script/style。 */
import type { DataSetCrudTool, SparkNodeTree as SparkNodeTreeModel } from '@spark-view/spark-data'
import type { HttpClientBase } from '@spark-view/spark-utils'
import type { NavigationNodePatchWriter } from '../navigation/edit.entity'
import type {
  PageFileCache,
  PageFileContentLoader,
  PageFileWriter,
  PageNodeFileName,
} from './page-file-types'
import { PageNode } from './page-node.entity'
import type { ProjectNodeModelOptions } from './node-base.entity'
import { normalizeConfigPageId, resolvePageNodePageId } from './node-helpers'
import type { ProjectNodeFamily, PageNodeLoadOptions, PageNodeRenderConfig, ProjectPageNodeSummary } from './module-node.entity'
import { PageRuleFile } from '../content/rule.entity'
import { PageDataSetFile } from '../content/dataset.entity'
import { PageTextFile } from '../content/text.entity'

export type ProjectConfigPageNodeModelOptions = ProjectNodeModelOptions & {
  pageId?: string
  fileApi: PageFileWriter
  fileCache: PageFileCache
  contentLoaderFactory: () => PageFileContentLoader
  navClient?: NavigationNodePatchWriter | undefined
}

export type ConfigPageDirtyPart = 'navigation' | 'rule' | 'dataSet' | 'style' | 'script'

const CONFIG_PAGE_DIRTY_PARTS = ['navigation', 'rule', 'dataSet', 'style', 'script'] as const

function optionalText(value: string): string | undefined { return value.trim() === '' ? undefined : value }

/**
 * 配置页面节点。
 *
 * 持有当前页面的 rule.json、pagedata.json、script.js、style.css 子模型，
 * 是 page-design AI 进入页面配置 live model 的根能力提供方。
 *
 * @moduleKind config-page
 * @moduleAbility pageDesign.configPage
 * @moduleName Page Design Config Page
 * @moduleDescription 当前配置页面节点，按真实 PageNode 子模型暴露 rule、pagedata、script 和 style 能力。
 * @moduleEntity configPage 配置页面
 * @moduleScope 当前 ConfigPageNode 实例代表一个已打开页面的配置模型。
 * @moduleAttackSurface page-files high rule.json、pagedata.json、script.js、style.css 写入会改变页面运行与渲染行为。
 * @moduleTrustBoundary 调用方负责选择并加载当前 ConfigPageNode；本类只暴露当前页面节点持有的真实子模型。
 * @moduleGuard 写入前必须确认页面已加载，并优先查询节点树、数据集和脚本文本的当前状态。
 * @moduleMutation page-config read-write 公开写方法会修改当前页面配置文件模型。
 */
export class ConfigPageNode extends PageNode {
  readonly rule: PageRuleFile
  readonly dataSet: PageDataSetFile
  readonly style: PageTextFile
  readonly script: PageTextFile
  readonly pageId: string
  private readonly fileApi: PageFileWriter
  private readonly fileCache: PageFileCache
  private readonly contentLoaderFactory: () => PageFileContentLoader
  private readonly navClient: NavigationNodePatchWriter | undefined
  private readonly _listeners = new Set<() => void>()
  private _isLoaded = false

  /**
   * 创建配置页面节点领域模型。
   *
   * 构造参数由 ProjectEditor/PageNodeFactory 装配，包含导航节点、文件 API、文件缓存和内容加载器。
   * LLM 通常不直接创建 ConfigPageNode，而是使用当前 host 已加载的页面节点实例。
   *
   * @param options 配置页面节点装配参数。
   */
  constructor(options: ProjectConfigPageNodeModelOptions) {
    super(options)
    const pageId = normalizeConfigPageId(options.pageId ?? resolvePageNodePageId(options.node))
    if (!pageId) throw new Error('配置页面节点缺少 pageId')
    this.pageId = pageId
    this.rule = new PageRuleFile(pageId)
    this.dataSet = new PageDataSetFile(pageId)
    this.style = new PageTextFile(pageId, 'style.css')
    this.script = new PageTextFile(pageId, 'script.js')
    this.fileApi = options.fileApi; this.fileCache = options.fileCache
    this.contentLoaderFactory = options.contentLoaderFactory; this.navClient = options.navClient
    this.wireSubModels()
  }

  get family(): ProjectNodeFamily { return 'config-page' }
  get pageNodeKind(): 'config' { return 'config' }

  /**
   * 当前配置页面的直接子页面。
   */
  get children(): ConfigPageNode[] { return this.readChildren<ConfigPageNode>() }

  /**
   * 当前页面的实际路由路径；缺省时使用 pageId 生成。
   */
  get resolvedPath(): string { return this.path ?? `/${this.pageId}` }

  /**
   * 当前页面四个配置文件是否已经加载到内存模型。
   */
  get isLoaded(): boolean { return this._isLoaded }

  /**
   * 判断当前页面是否存在未保存的配置变更。
   *
   * @moduleMutation page-config read 查询当前页面配置脏状态。
   */
  isDirty(): boolean { return CONFIG_PAGE_DIRTY_PARTS.some(p => this.isPartDirty(p)) }

  /**
   * 列出当前存在未保存变更的配置分区。
   *
   * @moduleMutation page-config read 查询当前页面配置脏分区。
   */
  dirtyParts(): ConfigPageDirtyPart[] { return CONFIG_PAGE_DIRTY_PARTS.filter(p => this.isPartDirty(p)) }

  /**
   * 加载当前页面的 rule.json、pagedata.json、script.js 和 style.css。
   *
   * @moduleMutation page-config read 从远端加载当前页面配置文件。
   * @vcmIgnore
   */
  async load(options: PageNodeLoadOptions = {}): Promise<void> {
    const forceReload = options.forceReload === true
    if (this._isLoaded && !forceReload) return
    const l = this.contentLoaderFactory()
    await Promise.all([
      this.rule.load(l, options),
      this.dataSet.load(l, options),
      this.style.load(l, options),
      this.script.load(l, options),
    ])
    this._isLoaded = true
  }

  /**
   * 保存当前页面所有存在未保存变更的配置文件。
   *
   * @moduleMutation page-config write 保存当前页面配置文件。
   * @vcmIgnore
   */
  async save(): Promise<void> { await Promise.all(this.dirtyParts().map(p => this.savePart(p))) }

  /**
   * 加载当前页面指定配置文件。
   *
   * @moduleMutation page-config read 从远端加载指定页面配置文件。
   * @vcmIgnore
   */
  async loadFile(name: PageNodeFileName, options?: PageNodeLoadOptions): Promise<void> {
    const l = this.contentLoaderFactory()
    switch (name) {
      case 'rule.json': await this.rule.load(l, options); return
      case 'pagedata.json': await this.dataSet.load(l, options); return
      case 'script.js': await this.script.load(l, options); return
      case 'style.css': await this.style.load(l, options); return
    }
  }

  /**
   * 读取当前页面指定配置文件的文本内容。
   *
   * @moduleMutation page-config read 读取页面配置文件文本。
   */
  getFileText(name: PageNodeFileName): string {
    switch (name) {
      case 'rule.json': return this.getRuleText()
      case 'pagedata.json': return this.getDataSetText()
      case 'script.js': return this.script.text
      case 'style.css': return this.style.text
    }
  }

  /**
   * 保存当前页面指定配置文件。
   *
   * @moduleMutation page-config write 保存指定页面配置文件。
   * @vcmIgnore
   */
  async saveFile(name: PageNodeFileName): Promise<void> {
    switch (name) {
      case 'rule.json': await this.rule.save(this.fileApi); break
      case 'pagedata.json': await this.dataSet.save(this.fileApi); break
      case 'script.js': await this.script.save(this.fileApi); break
      case 'style.css': await this.style.save(this.fileApi); break
    }
    this.clearFileCache(name)
  }

  /**
   * 保存当前页面所有 dirty 配置文件。
   *
   * @moduleMutation page-config write 保存当前页面所有 dirty 文件。
   * @vcmIgnore
   */
  async saveDirtyFiles(): Promise<void> {
    const tasks: Array<Promise<void>> = []
    if (this.isRuleDirty) tasks.push(this.saveFile('rule.json'))
    if (this.isDataSetDirty) tasks.push(this.saveFile('pagedata.json'))
    if (this.script.isDirty) tasks.push(this.saveFile('script.js'))
    if (this.style.isDirty) tasks.push(this.saveFile('style.css'))
    await Promise.all(tasks)
  }

  subscribe(l: () => void): () => void { this._listeners.add(l); return () => { this._listeners.delete(l) } }
  getHttpClient(): HttpClientBase | undefined { return this.contentLoaderFactory().getHttpClient() }

  /**
   * 获取当前页面 rule.json 的节点树编辑模型。
   *
   * 返回的 SparkNodeTree 是节点树真实能力提供方，后续可继续调用 node-tree 方法。
   *
   * @moduleMutation rule.json read 获取当前页面节点树子模型。
   */
  getNodeTree(): SparkNodeTreeModel {
    return this.rule.getTree()
  }

  /**
   * 替换当前页面 rule.json 的节点树模型。
   *
   * 用于页面设计器把已编辑的 SparkNodeTree 写回当前页面节点；写回后 rule.json 标记为 dirty。
   *
   * @param nodeTree 新的页面节点树模型。
   * @moduleMutation rule.json write 替换当前页面节点树子模型。
   * @vcmIgnore
   */
  replaceNodeTree(nodeTree: SparkNodeTreeModel): void {
    this.rule.replaceTree(nodeTree)
    this.notify()
  }

  /**
   * 在当前页面节点树上执行编辑。
   *
   * 回调由宿主代码传入，适用于非 VCM 的编辑器内部流程；VCM 应优先获取节点树子模块后调用其方法。
   *
   * @param run 节点树编辑回调。
   * @moduleMutation rule.json write 修改当前页面节点树。
   * @vcmIgnore
   */
  async editNodeTree(run: (tree: SparkNodeTreeModel) => void | Promise<void>): Promise<void> {
    await this.rule.editTree(run)
    this.notify()
  }

  /**
   * 获取当前页面 pagedata.json 的 DataSet CRUD 工具。
   *
   * 返回的 DataSetCrudTool 是数据集真实能力提供方，后续可继续调用 dataset 方法。
   *
   * @moduleMutation pagedata.json read 获取当前页面数据集子模型。
   */
  getDataSetTool(): DataSetCrudTool {
    return this.dataSet.getTool()
  }

  /**
   * 替换当前页面 pagedata.json 的 DataSet CRUD 工具。
   *
   * 用于页面设计器把已编辑的 DataSetCrudTool 写回当前页面节点；写回后 pagedata.json 标记为 dirty。
   *
   * @param tool 新的数据集编辑工具。
   * @moduleMutation pagedata.json write 替换当前页面数据集子模型。
   * @vcmIgnore
   */
  replaceDataSetTool(tool: DataSetCrudTool): void {
    this.dataSet.replaceTool(tool)
    this.notify()
  }

  /**
   * 在当前页面数据集工具上执行编辑。
   *
   * 回调由宿主代码传入，适用于非 VCM 的编辑器内部流程；VCM 应优先获取数据集子模块后调用其方法。
   *
   * @param run 数据集编辑回调。
   * @moduleMutation pagedata.json write 修改当前页面数据集。
   * @vcmIgnore
   */
  async editDataSet(run: (tool: DataSetCrudTool) => void | Promise<void>): Promise<void> {
    await this.dataSet.editTool(run)
    this.notify()
  }

  get isRuleDirty(): boolean { return this.rule.isDirty }
  get isDataSetDirty(): boolean { return this.dataSet.isDirty }
  get canUndoRule(): boolean { return this.rule.canUndo }
  get canRedoRule(): boolean { return this.rule.canRedo }
  get canUndoDataSet(): boolean { return this.dataSet.canUndo }
  get canRedoDataSet(): boolean { return this.dataSet.canRedo }
  getRuleText(): string { return this.rule.getText() }
  setRuleText(text: string): void {
    this.rule.setText(text)
    this.notify()
  }
  getDataSetText(): string { return this.dataSet.getText() }
  setDataSetText(text: string): void {
    this.dataSet.setText(text)
    this.notify()
  }
  undoRule(): boolean {
    const ok = this.rule.undo()
    if (ok) this.notify()
    return ok
  }
  redoRule(): boolean {
    const ok = this.rule.redo()
    if (ok) this.notify()
    return ok
  }
  undoDataSet(): boolean {
    const ok = this.dataSet.undo()
    if (ok) this.notify()
    return ok
  }
  redoDataSet(): boolean {
    const ok = this.dataSet.redo()
    if (ok) this.notify()
    return ok
  }
  /**
   * 读取当前页面 script.js 文本。
   *
   * @moduleMutation script.js read 读取当前页面脚本文本。
   */
  readScript(): string {
    return this.script.text
  }

  /**
   * 写入当前页面 script.js 文本。
   *
   * 写入前应先调用 readScript 获取原文，做最小必要修改；不要重写无关逻辑。
   *
   * @param content 新的 script.js 完整文本。
   * @moduleMutation script.js write 更新当前页面脚本文本。
   */
  writeScript(content: string): void {
    this.script.setText(content)
  }

  /**
   * 读取当前页面 style.css 文本。
   *
   * @moduleMutation style.css read 读取当前页面样式文本。
   */
  readStyle(): string {
    return this.style.text
  }

  /**
   * 写入当前页面 style.css 文本。
   *
   * 写入前应先调用 readStyle 获取原文，做最小必要修改；不要覆盖无关样式。
   *
   * @param content 新的 style.css 完整文本。
   * @moduleMutation style.css write 更新当前页面样式文本。
   */
  writeStyle(content: string): void {
    this.style.setText(content)
  }

  /**
   * 转成渲染器所需页面配置快照。
   *
   * @moduleMutation page-config read 生成当前页面渲染配置快照。
   */
  toRenderConfig(): PageNodeRenderConfig {
    if (!this._isLoaded) throw new Error(`配置页面节点 ${this.pageId} 尚未加载完成`)
    return {
      pageId: this.pageId,
      navigation: this.navigation.navNode === null ? null : this.navigation.toEditInputDto(),
      rule: this.rule.children,
      data: this.dataSet.value,
      script: optionalText(this.script.text),
      css: optionalText(this.style.text),
    }
  }

  /**
   * 转成页面列表和诊断使用的概要信息。
   *
   * @moduleMutation page-config read 生成当前页面概要。
   */
  toSummary(): ProjectPageNodeSummary {
    return {
      pageId: this.pageId, path: this.resolvedPath, title: this.name,
      nodeId: this.id, nodeKind: this.nodeKind, description: this.description,
      descriptionContext: this.descriptionContext,
      effectiveDescription: this.effectiveDescription,
      ...(this.icon === undefined ? {} : { icon: this.icon }),
    }
  }

  private clearFileCache(name?: PageNodeFileName): void { this.fileCache.clearPageCache(this.pageId, name) }
  private isPartDirty(part: ConfigPageDirtyPart): boolean {
    if (part === 'navigation') return this.navigation.isDirty
    if (part === 'rule') return this.isRuleDirty
    if (part === 'dataSet') return this.isDataSetDirty
    if (part === 'style') return this.style.isDirty
    return this.script.isDirty
  }
  private async savePart(part: ConfigPageDirtyPart): Promise<void> {
    if (part === 'navigation') { if (!this.navClient) throw new Error('缺少 NavigationConfigClient'); await this.navigation.save(this.navClient) }
    else if (part === 'rule') await this.saveFile('rule.json')
    else if (part === 'dataSet') await this.saveFile('pagedata.json')
    else if (part === 'style') await this.saveFile('style.css')
    else await this.saveFile('script.js')
  }
  private wireSubModels(): void { for (const m of [this.navigation, this.style, this.script]) m.subscribe(() => this.notify()) }
  private notify(): void { for (const l of this._listeners) l() }
}
