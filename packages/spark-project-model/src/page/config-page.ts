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

/** Page Node Render Config 的配置结构。 */
export type PageNodeRenderConfig = {
    /** page Id 标识。 */
pageId: string
    /** navigation 字段。 */
navigation: ProjectNodeData | null
    /** rule 字段。 */
rule: SparkNode[]
    /** 业务数据载荷。 */
data: DataSet
    /** script 字段。 */
script: string | undefined
    /** css 字段。 */
css: string | undefined
}

/** Page Node Like 的语义模型。 */
export type PageNodeLike = {
    /** page Id 标识。 */
readonly pageId: string
    /** 是否 is Loaded。 */
readonly isLoaded: boolean
  load(options?: PageNodeLoadOptions): Promise<void>
  toRenderConfig(): PageNodeRenderConfig
}

/** Project Config Page Node Model Options 的调用配置。 */
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
 */
export class ConfigPageNode extends ProjectNode {
    /** rule 字段。 */
readonly rule: PageRuleFile
    /** data Set 字段。 */
readonly dataSet: PageDataSetFile
    /** style 字段。 */
readonly style: PageTextFile
    /** script 字段。 */
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

    /** 是否 is Dirty。 */
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

    /** 执行 mark Loaded 操作。 */
markLoaded(): void {
    this._isLoaded = true
  }

    /** 执行 mark Unloaded 操作。 */
markUnloaded(): void {
    this._isLoaded = false
  }

    /** 执行 mark File Saved 操作。 */
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
   * @param name 要读取的页面文件名。
   */
  getFileText(name: PageNodeFileName): string {
    return this.files[name].getText()
  }

  /**
   * 写入四文件文本到内存模型。
   *
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

    /** 是否 can Undo File。 */
canUndoFile(name: PageNodeFileName): boolean {
    switch (name) {
      case 'rule.json': return this.rule.canUndo
      case 'pagedata.json': return this.dataSet.canUndo
      case 'script.js': return this.script.canUndo
      case 'style.css': return this.style.canUndo
    }
  }

    /** 是否 can Redo File。 */
canRedoFile(name: PageNodeFileName): boolean {
    switch (name) {
      case 'rule.json': return this.rule.canRedo
      case 'pagedata.json': return this.dataSet.canRedo
      case 'script.js': return this.script.canRedo
      case 'style.css': return this.style.canRedo
    }
  }

    /** 执行 undo File 操作。 */
undoFile(name: PageNodeFileName): boolean {
    switch (name) {
      case 'rule.json': return this.rule.undo()
      case 'pagedata.json': return this.dataSet.undo()
      case 'script.js': return this.script.undo()
      case 'style.css': return this.style.undo()
    }
  }

    /** 执行 redo File 操作。 */
redoFile(name: PageNodeFileName): boolean {
    switch (name) {
      case 'rule.json': return this.rule.redo()
      case 'pagedata.json': return this.dataSet.redo()
      case 'script.js': return this.script.redo()
      case 'style.css': return this.style.redo()
    }
  }

    /** 读取 Dirty File Names。 */
getDirtyFileNames(): PageNodeFileName[] {
    return PAGE_NODE_FILE_NAMES.filter(name => this.files[name].isDirty)
  }

  /**
   * rule.json 节点树根；结构读写入口。
   */
  get nodeTree(): SparkNodeTreeModel {
    return this.getNodeTree()
  }

  /**
   * pagedata.json 数据集 CRUD 工具入口。
   */
  get dataSetTool(): DataSetCrudTool {
    return this.getDataSetTool()
  }

  /**
   * 读取 rule.json 节点树。
   *
   */
  getNodeTree(): SparkNodeTreeModel {
    return this.rule.getTree()
  }

  /**
   * 修改 rule.json 节点树。
   *
   * @param run 节点树编辑回调；回调参数是当前页面 SparkNodeTree。
   */
  async editNodeTree(run: (tree: SparkNodeTreeModel) => void | Promise<void>): Promise<void> {
    await this.rule.editTree(run)
  }

  /**
   * 读取 pagedata 数据集工具入口。
   *
   */
  getDataSetTool(): DataSetCrudTool {
    return this.dataSet.getTool()
  }

  /**
   * 修改 pagedata.json 数据集模型。
   *
   * @param run 数据集编辑回调；回调参数是当前页面 DataSetCrudTool。
   */
  async editDataSet(run: (tool: DataSetCrudTool) => void | Promise<void>): Promise<void> {
    await this.dataSet.editTool(run)
  }

    /** to Render Config 配置。 */
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

    /** 执行 to Summary 操作。 */
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

    /** 执行 to Summary 操作。 */
override toSummary(): ProjectPageNodeSummary {
    const summary = super.toSummary()
    return {
      ...summary,
      nodeKind: 'sub-page',
      designSurface: 'config-files',
    }
  }
}

