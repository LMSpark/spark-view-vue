/** ConfigPageNode——配置页节点，挂接 rule/dataset/script/style（纯内存领域模型）。 */
import type { DataSet, DataSetCrudTool, SparkNode, SparkNodeTree as SparkNodeTreeModel } from '@spark-appworks/spark-data'
import type {
  PageNodeLoadOptions,
  PageNodeFileName,
} from './file'
import {
  ProjectNode,
  type ProjectNodeFamily,
  type ProjectNodeData,
  type ProjectNodeModelOptions,
  type ProjectPageNodeSummary,
} from '../navigation/node'
import { normalizeConfigPageId, resolvePageDesignSurface, resolvePageNodePageId } from '../navigation/helpers'
import { PageRuleFile } from './content/rule-file'
import { PageDataSetFile } from './content/dataset-file'
import { PageTextFile } from './content/text-file'
import { PageDesign } from './design'
import { PageRuntime } from './runtime'

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
 * 持久化（load/save/版本）由 io/PageContentRepository 经门面编排。
 *
 * @moduleKind config-page
 * @moduleAbility pageDesign.configPage
 */
export class ConfigPageNode extends ProjectNode {
  readonly design: PageDesign
  readonly runtime: PageRuntime
  readonly rule: PageRuleFile
  readonly dataSet: PageDataSetFile
  readonly style: PageTextFile
  readonly script: PageTextFile
  readonly pageId: string
  private readonly files: Record<PageNodeFileName, ConfigPageFileModel>
  private _isLoaded = false

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
    this.design = new PageDesign(this.rule, this.dataSet, this.script, this.style, this.files)
    this.runtime = new PageRuntime(this)
  }

  override get family(): ProjectNodeFamily { return 'config-page' }

  protected get resolvedPath(): string { return this.path ?? `/${this.pageId}` }

  get isLoaded(): boolean { return this._isLoaded }

  get isSubPage(): boolean { return false }

  isDirty(): boolean {
    return this.design.isDirty()
  }

  /** 由 PageContentRepository 在远端加载后灌入，不标 dirty。 */
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

  getFileText(name: PageNodeFileName): string {
    return this.files[name].getText()
  }

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
    return this.design.getDirtyFileNames()
  }

  getNodeTree(): SparkNodeTreeModel {
    return this.rule.getTree()
  }

  async editNodeTree(run: (tree: SparkNodeTreeModel) => void | Promise<void>): Promise<void> {
    await this.rule.editTree(run)
  }

  getDataSetTool(): DataSetCrudTool {
    return this.dataSet.getTool()
  }

  async editDataSet(run: (tool: DataSetCrudTool) => void | Promise<void>): Promise<void> {
    await this.dataSet.editTool(run)
  }

  readScript(): string {
    return this.script.text
  }

  writeScript(content: string): void {
    this.script.setText(content)
  }

  readStyle(): string {
    return this.style.text
  }

  writeStyle(content: string): void {
    this.style.setText(content)
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
      designSurface: resolvePageDesignSurface(node),
      description: this.description,
      descriptionContext: this.descriptionContext,
      effectiveDescription: this.effectiveDescription,
      ...(this.icon === undefined ? {} : { icon: this.icon }),
    }
  }
}
