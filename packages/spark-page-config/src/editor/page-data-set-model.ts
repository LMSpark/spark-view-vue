/**
 * PageDataSetModel — pagedata.json 领域模型。
 *
 * 持有 DataSetCrudTool 作为真源，提供 mutate / undo / redo / dirty / subscribe，
 * 以及 IO 能力（load / save / restoreVersion）。
 */

import { DataSetCrudTool } from '@spark-view/spark-data'
import type { BasePageConfigLoader } from '../config/config-types'
import type { PageConfigFileApi } from '../config/page-config-file-api'
import type { PageFileRestoreCommand } from './page-file-restore-command'
import { parsePageDataText, serializeDataSet } from './page-file-serialization'

export class PageDataSetModel {
  tool: DataSetCrudTool = new DataSetCrudTool('')

  private _dirty = false
  private readonly _listeners = new Set<() => void>()

  // ── Dirty ──────────────────────────────────────────────

  get isDirty(): boolean {
    return this._dirty
  }

  markDirty(): void {
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
    return serializeDataSet(this.tool)
  }

  /** 从文本解析并以 reconcileFromJson 替换当前 tool，保留 undo 历史。成功时标记 dirty。 */
  setText(text: string): void {
    if (!text.trim()) {
      this.tool = new DataSetCrudTool(this.tool.toJson().dataSetName)
    } else {
      this.tool = DataSetCrudTool.reconcileFromJson(text, this.tool, { preserveHistory: true })
    }
    this.markDirty()
  }

  // ── 编辑 ───────────────────────────────────────────────

  /** 通过回调修改 tool，完成后标记 dirty。 */
  mutate(fn: (tool: DataSetCrudTool) => void): void {
    fn(this.tool)
    this.markDirty()
  }

  // ── Undo / Redo ────────────────────────────────────────

  get canUndo(): boolean {
    return this.tool.canUndo
  }

  get canRedo(): boolean {
    return this.tool.canRedo
  }

  undo(): boolean {
    const ok = this.tool.undo()
    if (ok) this.markDirty()
    return ok
  }

  redo(): boolean {
    const ok = this.tool.redo()
    if (ok) this.markDirty()
    return ok
  }

  // ── IO ─────────────────────────────────────────────────

  /** 从远端加载 pagedata.json 并解析到 tool。空内容时以 pageId 构造空 DataSetCrudTool。 */
  async load(
    pageId: string,
    configLoader: BasePageConfigLoader,
    options?: { forceReload?: boolean; allowMissingAsEmpty?: boolean },
  ): Promise<void> {
    const result = await configLoader.loadPageFileContent(pageId, 'pagedata.json', {
      forceReload: options?.forceReload === true,
      allowMissingAsEmpty: options?.allowMissingAsEmpty === true,
    })
    if (!result.success) {
      if (result.reason === 'not-found' && options?.allowMissingAsEmpty === true) {
        this.resetToEmpty(pageId)
        return
      }
      throw new Error(result.error ?? result.reason ?? 'pagedata.json 加载失败')
    }
    const rawText = result.data ?? ''
    if (!rawText.trim()) {
      this.tool = new DataSetCrudTool(pageId)
    } else {
      this.tool = parsePageDataText(rawText)
    }
    this.markClean()
  }

  resetToEmpty(pageId: string): void {
    this.tool = new DataSetCrudTool(pageId)
    this.markClean()
  }

  /** 序列化并保存到远端。 */
  async save(pageId: string, fileApi: PageConfigFileApi): Promise<void> {
    await fileApi.saveFileContent(pageId, 'pagedata.json', this.getText())
    this.markClean()
  }

  /** 恢复远端历史版本。恢复成功后以恢复内容为 saved baseline。 */
  async restoreVersion(command: PageFileRestoreCommand): Promise<void> {
    const { pageId, version, fileApi, configLoader } = command
    await fileApi.restoreVersion(pageId, 'pagedata.json', version)
    const result = await configLoader.loadPageFileContent(pageId, 'pagedata.json', { forceReload: true })
    if (!result.success) {
      throw new Error(`恢复版本后读取失败: ${pageId}/pagedata.json v${version}`)
    }
    const rawText = result.data ?? ''
    this.tool = rawText.trim() ? parsePageDataText(rawText) : new DataSetCrudTool(pageId)
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
