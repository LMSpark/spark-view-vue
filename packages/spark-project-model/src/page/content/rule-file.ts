/** PageRuleFile——rule.json 的内存模型，负责节点树的读写与撤销重做。 */
import { getSparkNodeChildren, SparkNodeTree } from '@spark-appworks/spark-data'
import type { SparkNodeTree as SparkNodeTreeModel, SparkNode } from '@spark-appworks/spark-data'
import type {
  PageFileContentLoader,
  PageFileRestoreCommand,
  PageFileWriter,
} from '../file'
import { parseRuleText, serializeRuleTree } from '../serial'
import type { PageNodeLoadOptions } from '../config-page'

export class PageRuleFile {
  tree: SparkNodeTreeModel = SparkNodeTree.fromPageChildren([])

  private dirty = false

  constructor(readonly pageId: string) {}

  get root(): SparkNode { return this.tree.root }
  get children(): SparkNode[] { return getSparkNodeChildren(this.root.children) }
  get isDirty(): boolean { return this.dirty }
  get canUndo(): boolean { return this.tree.canUndo }
  get canRedo(): boolean { return this.tree.canRedo }

  getText(): string { return serializeRuleTree(this.root) }

  setText(text: string): void {
    this.tree.replaceRoot(parseRuleText(text))
    this.dirty = true
  }

  loadText(text: string): void {
    this.tree = SparkNodeTree.fromJson(parseRuleText(text))
    this.dirty = false
  }

  async load(loader: PageFileContentLoader, options?: PageNodeLoadOptions): Promise<void> {
    const result = await loader.loadPageFileContent(this.pageId, 'rule.json', {
      forceReload: options?.forceReload === true,
    })
    if (!result.success) throw new Error(result.error ?? result.reason ?? 'rule.json 加载失败')
    this.loadText(result.data ?? '')
  }

  async save(api: PageFileWriter): Promise<void> {
    await api.saveFileContent(this.pageId, 'rule.json', this.getText())
    this.dirty = false
  }

  async restoreVersion(command: PageFileRestoreCommand): Promise<void> {
    await command.fileApi.restoreVersion(this.pageId, 'rule.json', command.version)
    const result = await command.contentLoader.loadPageFileContent(this.pageId, 'rule.json', { forceReload: true })
    if (!result.success) throw new Error(`恢复版本后读取失败: ${this.pageId}/rule.json v${command.version}`)
    this.loadText(result.data ?? '')
  }

  getTree(): SparkNodeTreeModel {
    return this.tree
  }

  replaceTree(tree: SparkNodeTreeModel): void {
    this.tree = tree
    this.dirty = true
  }

  async editTree(run: (tree: SparkNodeTreeModel) => void | Promise<void>): Promise<void> {
    const tree = this.getTree()
    await run(tree)
    this.replaceTree(tree)
  }

  undo(): boolean {
    const ok = this.tree.undo() !== null
    if (ok) this.dirty = true
    return ok
  }

  redo(): boolean {
    const ok = this.tree.redo() !== null
    if (ok) this.dirty = true
    return ok
  }
}
