/**
 * PageRuleModel — rule.json 领域模型。
 *
 * 持有 SparkNodeTree 作为真源，提供 mutate / undo / redo / dirty / subscribe，
 * 以及 IO 能力（load / save / restoreVersion）。
 */

import { SparkNodeTree } from '@spark-view/spark-data'
import type { BasePageConfigLoader, PageConfigFileApi } from '../config'
import { parseRuleText, serializeRuleTree } from './page-file-serialization'

export class PageRuleModel {
  tree: SparkNodeTree = SparkNodeTree.fromPageChildren([])

  private _dirty = false
  private readonly _listeners = new Set<() => void>()

  // ── Dirty ──────────────────────────────────────────────

  get isDirty(): boolean {
    return this._dirty
  }

  markDirty(): void {
    if (this._dirty) return
    this._dirty = true
    this._notify()
  }

  markClean(): void {
    if (!this._dirty) return
    this._dirty = false
    this._notify()
  }

  // ── 投影 ───────────────────────────────────────────────

  /** 只读投影文本（用于文件查看器展示）。 */
  getText(): string {
    return serializeRuleTree(this.tree)
  }

  /** 从文本解析并以 replaceRoot 替换当前 tree，保留 undo 历史。成功时标记 dirty。 */
  setText(text: string): void {
    const parsed = parseRuleText(text)
    this.tree.replaceRoot(parsed.toJSON())
    this.markDirty()
  }

  // ── 编辑 ───────────────────────────────────────────────

  /** 通过回调修改 tree，完成后标记 dirty。 */
  mutate(fn: (tree: SparkNodeTree) => void): void {
    fn(this.tree)
    this.markDirty()
  }

  // ── Undo / Redo ────────────────────────────────────────

  get canUndo(): boolean {
    return this.tree.canUndo
  }

  get canRedo(): boolean {
    return this.tree.canRedo
  }

  undo(): boolean {
    const ok = this.tree.undo() !== null
    if (ok) this.markDirty()
    return ok
  }

  redo(): boolean {
    const ok = this.tree.redo() !== null
    if (ok) this.markDirty()
    return ok
  }

  // ── IO ─────────────────────────────────────────────────

  /** 从远端加载 rule.json 并解析到 tree。 */
  async load(
    pageId: string,
    configLoader: BasePageConfigLoader,
    options?: { forceReload?: boolean; allowMissingAsEmpty?: boolean },
  ): Promise<void> {
    const result = await configLoader.loadPageFileContent(pageId, 'rule.json', {
      forceReload: options?.forceReload === true,
      allowMissingAsEmpty: options?.allowMissingAsEmpty === true,
    })
    if (!result.success) {
      if (result.reason === 'not-found' && options?.allowMissingAsEmpty === true) {
        this.resetToEmpty()
        return
      }
      throw new Error(result.error ?? result.reason ?? 'rule.json 加载失败')
    }
    this.tree = parseRuleText(result.data ?? '')
    this.markClean()
  }

  resetToEmpty(): void {
    this.tree = SparkNodeTree.fromPageChildren([])
    this.markClean()
  }

  /** 序列化并保存到远端。 */
  async save(pageId: string, fileApi: PageConfigFileApi): Promise<void> {
    await fileApi.saveFileContent(pageId, 'rule.json', this.getText())
    this.markClean()
  }

  /** 恢复远端历史版本。恢复成功后以恢复内容为 saved baseline。 */
  async restoreVersion(
    pageId: string,
    version: number,
    fileApi: PageConfigFileApi,
    configLoader: BasePageConfigLoader,
  ): Promise<void> {
    await fileApi.restoreVersion(pageId, 'rule.json', version)
    const result = await configLoader.loadPageFileContent(pageId, 'rule.json', { forceReload: true })
    if (!result.success) {
      throw new Error(`恢复版本后读取失败: ${pageId}/rule.json v${version}`)
    }
    this.tree = parseRuleText(result.data ?? '')
    this.markClean()
  }

  // ── 订阅 ───────────────────────────────────────────────

  subscribe(listener: () => void): () => void {
    this._listeners.add(listener)
    return () => { this._listeners.delete(listener) }
  }

  private _notify(): void {
    for (const listener of this._listeners) {
      listener()
    }
  }
}
