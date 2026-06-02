/** rule.json 本体模型：持有页面根节点、编辑历史和自身文件 IO。 */
import { getSparkNodeChildren, SparkNodeTree } from '@spark-view/spark-data'
import type { SparkNode, SparkNodeTree as SparkNodeTreeModel } from '@spark-view/spark-data'
import type { BasePageContentLoader } from '../../service/content-loader/types'
import type { PageNodeFileApi } from '../../service/file/file-api.service'
import type { PageFileRestoreCommand } from '../../service/file/file-restore-command'
import { parseRuleText, serializeRuleTree } from '../../service/file/file-serialization'

export class RuleContent {
  root: SparkNode = SparkNodeTree.fromPageChildren([]).root

  private readonly undoStack: string[] = []
  private readonly redoStack: string[] = []
  private _dirty = false

  constructor(readonly pageId: string) {}

  get children(): SparkNode[] { return getSparkNodeChildren(this.root.children) }
  get isDirty(): boolean { return this._dirty }
  get canUndo(): boolean { return this.undoStack.length > 0 }
  get canRedo(): boolean { return this.redoStack.length > 0 }

  getText(): string { return serializeRuleTree(this.root) }

  setText(text: string): void {
    this.pushUndo()
    this.root = parseRuleText(text)
    this.markDirty()
  }

  loadText(text: string): void {
    this.root = parseRuleText(text)
    this.clearHistory()
    this.markClean()
  }

  async load(loader: BasePageContentLoader, options?: { forceReload?: boolean }): Promise<void> {
    const result = await loader.loadPageFileContent(this.pageId, 'rule.json', {
      forceReload: options?.forceReload === true,
    })
    if (!result.success) {
      throw new Error(result.error ?? result.reason ?? 'rule.json 加载失败')
    }
    this.loadText(result.data ?? '')
  }

  async save(api: PageNodeFileApi): Promise<void> {
    await api.saveFileContent(this.pageId, 'rule.json', this.getText())
    this.markClean()
  }

  async restoreVersion(command: PageFileRestoreCommand): Promise<void> {
    await command.fileApi.restoreVersion(this.pageId, 'rule.json', command.version)
    const result = await command.contentLoader.loadPageFileContent(this.pageId, 'rule.json', { forceReload: true })
    if (!result.success) {
      throw new Error(`恢复版本后读取失败: ${this.pageId}/rule.json v${command.version}`)
    }
    this.loadText(result.data ?? '')
  }

  getTree(): SparkNodeTreeModel {
    return SparkNodeTree.fromJson(this.root)
  }

  replaceTree(tree: SparkNodeTreeModel): void {
    this.pushUndo()
    this.root = tree.root
    this.markDirty()
  }

  async editTree(run: (tree: SparkNodeTreeModel) => void | Promise<void>): Promise<void> {
    const tree = this.getTree()
    await run(tree)
    this.replaceTree(tree)
  }

  undo(): boolean {
    const text = this.undoStack.pop()
    if (text === undefined) return false
    this.redoStack.push(this.getText())
    this.root = parseRuleText(text)
    this.markDirty()
    return true
  }

  redo(): boolean {
    const text = this.redoStack.pop()
    if (text === undefined) return false
    this.undoStack.push(this.getText())
    this.root = parseRuleText(text)
    this.markDirty()
    return true
  }

  markClean(): void {
    this._dirty = false
  }

  private markDirty(): void {
    this._dirty = true
  }

  private pushUndo(): void {
    this.undoStack.push(this.getText())
    this.redoStack.length = 0
  }

  private clearHistory(): void {
    this.undoStack.length = 0
    this.redoStack.length = 0
  }
}
