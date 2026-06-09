/** ConfigPageNode——配置页节点，挂接 rule/dataset/script/style（纯内存领域模型）。 */
import type { DataSet, DataSetCrudTool, SparkNode, SparkNodeTree as SparkNodeTreeModel } from '@spark-appworks/spark-data'
import type {
  PageNodeLoadOptions,
  PageNodeFileName,
} from './page-file'
import { PAGE_NODE_FILE_NAMES } from './page-file'
import {
  ProjectNode,
  type ProjectNodeFamily,
  type ProjectNodeData,
  type ProjectNodeModelOptions,
  type ProjectPageNodeSummary,
} from '../navigation/project-node'
import { normalizeConfigPageId, resolveProjectPageSurface, resolvePageNodePageId } from '../navigation/navigation-tree'
import { PageRuleFile } from './content/rule-file'
import { PageDataSetFile } from './content/dataset-file'
import { PageTextFile } from './content/text-file'

export type { PageNodeLoadOptions } from './page-file'

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
  /** 配置页唯一 pageId；省略时从导航节点解析。 */
  pageId?: string
}

function optionalText(value: string): string | undefined { return value.trim() === '' ? undefined : value }

type ConfigPageFileModel = {
  readonly isDirty: boolean
  getText(): string
}

/**
 * 配置页面节点。
 *
 * 持有当前页面的 rule.json、pagedata.json、script.js、style.css 子模型。
 * 四文件持久化由 ProjectWorkspace 或 PageContentLoader 编排。
 *
 * @moduleKind config-page
 * @moduleAbility pageDesign.configPage
 * @moduleActionMode explicit
 */
export class ConfigPageNode extends ProjectNode {
  readonly rule: PageRuleFile
  readonly dataSet: PageDataSetFile
  readonly style: PageTextFile
  readonly script: PageTextFile
  /** 配置页唯一 pageId，与四文件存储目录一致。 */
  readonly pageId: string
  private readonly files: Record<PageNodeFileName, ConfigPageFileModel>
  private _isLoaded = false

  /**
   * 创建配置页节点实例，并初始化 rule/pagedata/script/style 四文件内存模型。
   *
   * @param options 配置页导航节点、pageId 与基础 ProjectNode 初始化参数。
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
  }

  override get family(): ProjectNodeFamily { return 'config-page' }

  protected get resolvedPath(): string { return this.path ?? `/${this.pageId}` }

  get isLoaded(): boolean { return this._isLoaded }

  get isSubPage(): boolean { return false }

  isDirty(): boolean {
    return this.getDirtyFileNames().length > 0
  }

  /** 由 ProjectWorkspace 或 PageContentLoader 在远端加载后灌入，不标 dirty。 */
  hydrateFileText(name: PageNodeFileName, text: string): void {
    switch (name) {
      case 'rule.json':
        this.rule.loadText(text)
        break
      case 'pagedata.json':
        this.dataSet.loadText(text)
        break
      case 'script.js':
        this.script.loadText(text)
        break
      case 'style.css':
        this.style.loadText(text)
        break
    }
  }

  markLoaded(): void {
    this._isLoaded = true
  }

  markUnloaded(): void {
    this._isLoaded = false
  }

  markFileSaved(name: PageNodeFileName): void {
    switch (name) {
      case 'rule.json':
        this.rule.markSaved()
        break
      case 'pagedata.json':
        this.dataSet.markSaved()
        break
      case 'script.js':
        this.script.markSaved()
        break
      case 'style.css':
        this.style.markSaved()
        break
    }
  }

  /**
   * 读取四文件文本。
   *
   * @moduleMutation page-files read 只读内存四文件文本。
   * @param name 要读取的页面文件名。
   */
  getFileText(name: PageNodeFileName): string {
    return this.files[name].getText()
  }

  /**
   * 写入四文件文本到内存模型。
   *
   * @moduleMutation page-files write 修改内存四文件文本，不直接落盘。
   * @param name 要写入的页面文件名。
   * @param text 新的文件文本内容。
   */
  setFileText(name: PageNodeFileName, text: string): void {
    switch (name) {
      case 'rule.json':
        this.rule.setText(text)
        break
      case 'pagedata.json':
        this.dataSet.setText(text)
        break
      case 'script.js':
        this.script.setText(text)
        break
      case 'style.css':
        this.style.setText(text)
        break
    }
  }

  canUndoFile(name: PageNodeFileName): boolean {
    switch (name) {
      case 'rule.json': return this.rule.canUndo
      case 'pagedata.json': return this.dataSet.canUndo
      case 'script.js': return this.script.canUndo
      case 'style.css': return this.style.canUndo
    }
  }

  canRedoFile(name: PageNodeFileName): boolean {
    switch (name) {
      case 'rule.json': return this.rule.canRedo
      case 'pagedata.json': return this.dataSet.canRedo
      case 'script.js': return this.script.canRedo
      case 'style.css': return this.style.canRedo
    }
  }

  undoFile(name: PageNodeFileName): boolean {
    switch (name) {
      case 'rule.json': return this.rule.undo()
      case 'pagedata.json': return this.dataSet.undo()
      case 'script.js': return this.script.undo()
      case 'style.css': return this.style.undo()
    }
  }

  redoFile(name: PageNodeFileName): boolean {
    switch (name) {
      case 'rule.json': return this.rule.redo()
      case 'pagedata.json': return this.dataSet.redo()
      case 'script.js': return this.script.redo()
      case 'style.css': return this.style.redo()
    }
  }

  getDirtyFileNames(): PageNodeFileName[] {
    return PAGE_NODE_FILE_NAMES.filter(name => this.files[name].isDirty)
  }

  /**
   * 读取 rule.json 节点树。
   *
   * @moduleMutation rule.json read 只读当前页面 SparkNodeTree。
   */
  getNodeTree(): SparkNodeTreeModel {
    return this.rule.getTree()
  }

  /**
   * 修改 rule.json 节点树。
   *
   * @moduleMutation rule.json write 在 mutator 内修改 SparkNodeTree。
   * @vcmScriptOnly
   * @requiredBeforeCall 写 node-tree 前必须先通过 VCM 元数据确认 SparkNode 结构、组件 type 和 props schema。
   * @usageRule 结构批量改写优先 vcm_script；direct call 不支持。
   * @usageRule openPageDesign 返回 ConfigPageNode 链式对象：用 page.editNodeTree(async tree=>...) / page.editDataSet(async ds=>...)，勿用 page.call()。
   * @failureMode SCHEMA_VALIDATION_FAILED 节点 props 不符合 SparkNode 契约 => 按 paramsSchema 与组件原生 props schema 修正
   * @failureMode SCRIPT_EXECUTION_FAILED 误用 call 链式代理 => 改用 page.editNodeTree / page.editDataSet 等方法
   * @param run 节点树编辑回调；回调参数是当前页面 SparkNodeTree。
   */
  async editNodeTree(run: (tree: SparkNodeTreeModel) => void | Promise<void>): Promise<void> {
    await this.rule.editTree(run)
  }

  /**
   * 读取 pagedata 数据集工具入口。
   *
   * @moduleMutation pagedata.json read 进入 DataSetCrudTool 操作面。
   */
  getDataSetTool(): DataSetCrudTool {
    return this.dataSet.getTool()
  }

  /**
   * 修改 pagedata.json 数据集模型。
   *
   * @moduleMutation pagedata.json write 在 mutator 内通过 DataSetCrudTool 修改 DataSet。
   * @vcmScriptOnly
   * @requiredBeforeCall 先 getDataSetTool 确认当前页 DataSet 已加载。
   * @usageRule DataViewKey 必须使用 table@viewId 格式；禁止旧成员拼接键。
   * @failureMode TABLE_NOT_FOUND 表名不存在 => 先在 dataset 上 createTable 或 vcm_action_guide 查 getTable 契约
   * @param run 数据集编辑回调；回调参数是当前页面 DataSetCrudTool。
   */
  async editDataSet(run: (tool: DataSetCrudTool) => void | Promise<void>): Promise<void> {
    await this.dataSet.editTool(run)
  }

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

  toSummary(): ProjectPageNodeSummary {
    const node = this.toNodeData()
    return {
      pageId: this.pageId, path: this.resolvedPath, title: this.name,
      nodeId: this.id, nodeKind: this.nodeKind,
      designSurface: resolveProjectPageSurface(node),
      description: this.description,
      ...(this.planningAttachmentRef === undefined
        ? {}
        : { planningAttachmentRef: this.planningAttachmentRef }),
      descriptionContext: this.descriptionContext,
      effectiveDescription: this.effectiveDescription,
      ...(this.planningStatus !== undefined ? { planningStatus: this.planningStatus } : {}),
      ...(this.implGate !== undefined ? { implGate: this.implGate } : {}),
      ...(this.upstreamContractsSatisfied !== undefined
        ? { upstreamContractsSatisfied: this.upstreamContractsSatisfied }
        : {}),
      ...(this.icon === undefined ? {} : { icon: this.icon }),
    }
  }
}

/** sub-page 配置页：四文件模型，nodeKind=sub-page，无独立 path。 */
export class ConfigSubPageNode extends ConfigPageNode {
  override get isSubPage(): boolean { return true }

  override get family() {
    return 'config-page' as const
  }

  override toSummary(): ProjectPageNodeSummary {
    const summary = super.toSummary()
    return {
      ...summary,
      nodeKind: 'sub-page',
      designSurface: 'config-files',
    }
  }
}
