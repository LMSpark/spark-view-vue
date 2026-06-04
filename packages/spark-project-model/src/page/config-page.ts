/** ConfigPageNode——配置页节点，挂接 rule/dataset/script/style。 */
import type { DataSet, DataSetCrudTool, SparkNode, SparkNodeTree as SparkNodeTreeModel } from '@spark-appworks/spark-data'
import type {
  PageFileCache,
  PageFileContentLoader,
  PageFileCreateOptions,
  PageNodeLoadOptions,
  PageFileWriter,
  PageNodeFileName,
  PageNodeFileVersionSummary,
} from './file'
import { PAGE_NODE_FILE_NAMES } from './file'
import {
  ProjectNode,
  type ProjectNodeFamily,
  type ProjectNodeData,
  type ProjectNodeModelOptions,
  type ProjectPageNodeSummary,
} from '../navigation/node'
import { normalizeConfigPageId, resolvePageNodePageId } from '../navigation/helpers'
import { PageRuleFile } from './content/rule-file'
import { PageDataSetFile } from './content/dataset-file'
import { PageTextFile } from './content/text-file'

export type { PageNodeLoadOptions } from './file'

export type PageNodeRenderConfig = {
  pageId: string
  navigation: ProjectNodeData | null
  rule: SparkNode[]
  data: DataSet
  script: string | undefined
  css: string | undefined
}

export type PageNodeLike = {
  readonly pageId: string
  readonly isLoaded: boolean
  load(options?: PageNodeLoadOptions): Promise<void>
  toRenderConfig(): PageNodeRenderConfig
}

export type ProjectConfigPageNodeModelOptions = ProjectNodeModelOptions & {
  pageId?: string
  fileApi: PageFileWriter
  fileCache: PageFileCache
  contentLoaderFactory: () => PageFileContentLoader
}

function optionalText(value: string): string | undefined { return value.trim() === '' ? undefined : value }

type ConfigPageFileModel = {
  readonly isDirty: boolean
  getText(): string
  load(loader: PageFileContentLoader, options?: PageNodeLoadOptions): Promise<void>
  save(api: PageFileWriter): Promise<void>
  restoreVersion(command: Parameters<PageRuleFile['restoreVersion']>[0]): Promise<void>
}

/**
 * 配置页面节点。
 *
 * 持有当前页面的 rule.json、pagedata.json、script.js、style.css 子模型，
 * 是编辑器进入页面配置 live model 的根能力提供方。
 *
 * @moduleKind config-page
 * @moduleAbility pageDesign.configPage
 * @moduleName Page Design Config Page
 * @moduleDescription 当前配置页面节点，按真实配置页子模型暴露 rule、pagedata、script 和 style 能力。
 * @moduleEntity configPage 配置页面
 * @moduleScope 当前 ConfigPageNode 实例代表一个已打开页面的配置模型。
 * @moduleAttackSurface page-files high rule.json、pagedata.json、script.js、style.css 写入会改变页面运行与渲染行为。
 * @moduleTrustBoundary 调用方负责选择并加载当前 ConfigPageNode；本类只暴露当前页面节点持有的真实子模型。
 * @moduleGuard 写入前必须确认页面已加载，并优先查询节点树、数据集和脚本文本的当前状态。
 * @moduleMutation page-config read-write 公开写方法会修改当前页面配置文件模型。
 */
export class ConfigPageNode extends ProjectNode {
  readonly rule: PageRuleFile
  readonly dataSet: PageDataSetFile
  readonly style: PageTextFile
  readonly script: PageTextFile
  readonly pageId: string
  private readonly fileApi: PageFileWriter
  private readonly fileCache: PageFileCache
  private readonly contentLoaderFactory: () => PageFileContentLoader
  private readonly files: Record<PageNodeFileName, ConfigPageFileModel>
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
    this.files = {
      'rule.json': this.rule,
      'pagedata.json': this.dataSet,
      'script.js': this.script,
      'style.css': this.style,
    }
    this.fileApi = options.fileApi; this.fileCache = options.fileCache
    this.contentLoaderFactory = options.contentLoaderFactory
  }

  override get family(): ProjectNodeFamily { return 'config-page' }

  protected get resolvedPath(): string { return this.path ?? `/${this.pageId}` }

  /**
   * 当前页面四个配置文件是否已经加载到内存模型。
   */
  get isLoaded(): boolean { return this._isLoaded }

  /**
   * 判断当前页面是否存在未保存的配置变更。
   *
   * @moduleMutation page-config read 查询当前页面配置脏状态。
   */
  isDirty(): boolean {
    return this.getDirtyFileNames().length > 0
  }

  /**
   * 创建当前配置页面的四文件资产。
   *
   * @moduleMutation page-config write 创建当前页面配置文件集合。
   */
  async createFiles(options: PageFileCreateOptions = {}): Promise<Record<string, unknown>> {
    const result = await this.fileApi.createFiles({
      pageId: this.pageId,
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.icon === undefined ? {} : { icon: options.icon }),
    })
    this.clearFileCache()
    return result
  }

  /**
   * 删除当前配置页面的四文件资产。
   *
   * @moduleMutation page-config write 删除当前页面配置文件集合。
   */
  async deleteFiles(): Promise<void> {
    await this.fileApi.deleteFiles(this.pageId)
    this.clearFileCache()
  }

  /**
   * 加载当前页面的 rule.json、pagedata.json、script.js 和 style.css。
   *
   * @moduleMutation page-config read 从远端加载当前页面配置文件。
   */
  async load(options: PageNodeLoadOptions = {}): Promise<void> {
    const forceReload = options.forceReload === true
    if (this._isLoaded && !forceReload) return
    const l = this.contentLoaderFactory()
    await Promise.all(PAGE_NODE_FILE_NAMES.map(name => this.files[name].load(l, options)))
    this._isLoaded = true
  }

  /**
   * 加载当前页面指定配置文件。
   *
   * @moduleMutation page-config read 从远端加载指定页面配置文件。
   */
  async loadFile(name: PageNodeFileName, options?: PageNodeLoadOptions): Promise<void> {
    const l = this.contentLoaderFactory()
    await this.files[name].load(l, options)
  }

  /**
   * 读取当前页面指定配置文件的文本内容。
   *
   * @moduleMutation page-config read 读取页面配置文件文本。
   */
  getFileText(name: PageNodeFileName): string {
    return this.files[name].getText()
  }

  /**
   * 保存当前页面指定配置文件。
   *
   * @moduleMutation page-config write 保存指定页面配置文件。
   */
  async saveFile(name: PageNodeFileName): Promise<void> {
    await this.files[name].save(this.fileApi)
    this.clearFileCache(name)
  }

  /**
   * 保存当前页面所有 dirty 配置文件。
   *
   * @moduleMutation page-config write 保存当前页面所有 dirty 文件。
   */
  async saveDirtyFiles(): Promise<void> {
    await Promise.all(this.getDirtyFileNames().map(name => this.saveFile(name)))
  }
  getDirtyFileNames(): PageNodeFileName[] {
    return PAGE_NODE_FILE_NAMES.filter(name => this.files[name].isDirty)
  }
  async restoreFileVersion(name: PageNodeFileName, command: Parameters<PageRuleFile['restoreVersion']>[0]): Promise<void> {
    await this.files[name].restoreVersion(command)
  }
  async listFileVersions(name: PageNodeFileName): Promise<PageNodeFileVersionSummary[]> {
    return this.fileApi.listVersions(this.pageId, name)
  }
  async restoreRemoteFileVersion(name: PageNodeFileName, version: number): Promise<void> {
    await this.restoreFileVersion(name, {
      pageId: this.pageId,
      version,
      fileApi: this.fileApi,
      contentLoader: this.contentLoaderFactory(),
    })
    this.clearFileCache(name)
  }
  async createFileVersion(name: PageNodeFileName): Promise<void> {
    await this.fileApi.createVersion(this.pageId, name)
  }
  async deleteFileVersion(name: PageNodeFileName, version: number): Promise<void> {
    await this.fileApi.deleteVersion(this.pageId, name, version)
  }

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
   * 在当前页面节点树上执行编辑。
   *
   * 回调由宿主代码传入，适用于编辑器内部流程；外部自动化应优先获取节点树子模块后调用其方法。
   *
   * @param run 节点树编辑回调。
   * @moduleMutation rule.json write 修改当前页面节点树。
   */
  async editNodeTree(run: (tree: SparkNodeTreeModel) => void | Promise<void>): Promise<void> {
    await this.rule.editTree(run)
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
   * 在当前页面数据集工具上执行编辑。
   *
   * 回调由宿主代码传入，适用于编辑器内部流程；外部自动化应优先获取数据集子模块后调用其方法。
   *
   * @param run 数据集编辑回调。
   * @moduleMutation pagedata.json write 修改当前页面数据集。
   */
  async editDataSet(run: (tool: DataSetCrudTool) => void | Promise<void>): Promise<void> {
    await this.dataSet.editTool(run)
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
      navigation: null,
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
}

