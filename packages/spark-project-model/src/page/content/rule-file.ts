/** PageRuleFile——rule.json 的内存模型，负责节点树的读写与撤销重做。 */
import { getSparkNodeChildren, SparkNodeTree } from '@spark-appworks/spark-data'
import type { SparkNodeTree as SparkNodeTreeModel, SparkNode } from '@spark-appworks/spark-data'
import { parseRuleText, serializeRuleTree } from '../page-file'

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
    if (text === this.getText()) return
    this.tree.replaceRoot(parseRuleText(text))
    this.dirty = true
  }

  loadText(text: string): void {
    this.tree = SparkNodeTree.fromJson(parseRuleText(text))
    this.dirty = false
  }

  markSaved(): void {
    this.dirty = false
  }

  getTree(): SparkNodeTreeModel {
    return this.tree
  }

  replaceTree(tree: SparkNodeTreeModel): void {
    this.tree = tree
    this.dirty = true
  }

  async editTree(run: (tree: SparkNodeTreeModel) => void | Promise<void>): Promise<void> {
    const beforeText = this.getText()
    const tree = this.getTree()
    await run(tree)
    if (this.getText() === beforeText) return
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
