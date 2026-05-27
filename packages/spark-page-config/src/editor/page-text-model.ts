/**
 * PageTextModel — style.css / script.js 领域模型。
 *
 * 管理文本内容、savedText、dirty、undo/redo，以及 IO（load/save/restoreVersion）。
 */

import { SnapshotHistory } from '@spark-view/spark-utils'
import type { BasePageConfigLoader, PageConfigFileName, PageConfigFileApi } from '../config'

const HISTORY_LIMIT = 100

export class PageTextModel {
  private _text: string
  private _savedText: string
  private readonly _history = new SnapshotHistory<string>(HISTORY_LIMIT)
  private readonly _listeners = new Set<() => void>()

  constructor(
    private readonly _fileName: PageConfigFileName,
    initialText = '',
  ) {
    this._text = initialText
    this._savedText = initialText
  }

  // ── 内容 ───────────────────────────────────────────────

  get text(): string {
    return this._text
  }

  get savedText(): string {
    return this._savedText
  }

  get isDirty(): boolean {
    return this._text !== this._savedText
  }

  // ── 编辑 ───────────────────────────────────────────────

  /** 编辑文本：推入历史，标记 dirty。 */
  setText(content: string): void {
    if (this._history.current === content) return
    this._history.push(content)
    this._text = content
    this._notify()
  }

  /** 标记当前文本为已保存。 */
  markSaved(): void {
    this._savedText = this._text
    this._notify()
  }

  // ── Undo / Redo ────────────────────────────────────────

  get canUndo(): boolean {
    return this._history.canUndo
  }

  get canRedo(): boolean {
    return this._history.canRedo
  }

  undo(): boolean {
    const prev = this._history.undo()
    if (prev === null) return false
    this._text = prev
    this._notify()
    return true
  }

  redo(): boolean {
    const next = this._history.redo()
    if (next === null) return false
    this._text = next
    this._notify()
    return true
  }

  // ── IO ─────────────────────────────────────────────────

  /** 从远端加载文件内容。 */
  async load(
    pageId: string,
    configLoader: BasePageConfigLoader,
    options?: { forceReload?: boolean; allowMissingAsEmpty?: boolean },
  ): Promise<void> {
    const result = await configLoader.loadPageFileContent(pageId, this._fileName, {
      forceReload: options?.forceReload === true,
      allowMissingAsEmpty: options?.allowMissingAsEmpty === true,
    })
    if (!result.success) {
      if (result.reason === 'not-found' && options?.allowMissingAsEmpty === true) {
        this.resetToEmpty()
        return
      }
      throw new Error(result.error ?? result.reason ?? `${this._fileName} 加载失败`)
    }
    this._history.clear()
    this._history.push(result.data ?? '')
    this._text = result.data ?? ''
    this._savedText = this._text
    this._notify()
  }

  resetToEmpty(): void {
    this._history.clear()
    this._text = ''
    this._savedText = ''
    this._notify()
  }

  /** 保存到远端。 */
  async save(pageId: string, fileApi: PageConfigFileApi): Promise<void> {
    await fileApi.saveFileContent(pageId, this._fileName, this._text)
    this.markSaved()
  }

  /** 恢复远端历史版本。恢复成功后以远端内容为 saved baseline。 */
  async restoreVersion(
    pageId: string,
    version: number,
    fileApi: PageConfigFileApi,
    configLoader: BasePageConfigLoader,
  ): Promise<void> {
    await fileApi.restoreVersion(pageId, this._fileName, version)
    const result = await configLoader.loadPageFileContent(pageId, this._fileName, { forceReload: true })
    if (!result.success) {
      throw new Error(`恢复版本后读取失败: ${pageId}/${this._fileName} v${version}`)
    }
    this._history.clear()
    this._history.push(result.data ?? '')
    this._text = result.data ?? ''
    this._savedText = this._text
    this._notify()
  }

  // ── 重置 ───────────────────────────────────────────────

  reset(): void {
    this._history.clear()
    this._text = ''
    this._savedText = ''
    this._notify()
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
