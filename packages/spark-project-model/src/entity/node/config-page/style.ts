/** StyleContent——style.css 领域模型。 */
import { SnapshotHistory } from '@spark-view/spark-utils'
import type { BasePageContentLoader } from '../../../service/loader/page-content-types'
import type { PageNodeFileApi } from '../../../service/file/page-file-api'
import type { PageFileRestoreCommand } from '../../../service/file/page-file-restore-command'

const HISTORY_LIMIT = 100
const FILE_NAME = 'style.css' as const

export class StyleContent {
  private _text: string
  private _savedText: string
  private readonly _history = new SnapshotHistory<string>(HISTORY_LIMIT)
  private readonly _listeners = new Set<() => void>()

  constructor(initialText = '') { this._text = initialText; this._savedText = initialText }

  get text(): string { return this._text }
  get savedText(): string { return this._savedText }
  get isDirty(): boolean { return this._text !== this._savedText }

  setText(content: string): void { if (this._history.current === content) return; this._history.push(content); this._text = content; this._notify() }
  markSaved(): void { this._savedText = this._text; this._notify() }
  get canUndo(): boolean { return this._history.canUndo }
  get canRedo(): boolean { return this._history.canRedo }
  undo(): boolean { const prev = this._history.undo(); if (prev === null) return false; this._text = prev; this._notify(); return true }
  redo(): boolean { const next = this._history.redo(); if (next === null) return false; this._text = next; this._notify(); return true }

  async load(pageId: string, l: BasePageContentLoader, o?: { forceReload?: boolean }): Promise<void> {
    const r = await l.loadPageFileContent(pageId, FILE_NAME, { forceReload: o?.forceReload === true })
    if (!r.success) throw new Error(r.error ?? r.reason ?? 'style.css 加载失败')
    this._history.clear(); this._history.push(r.data ?? ''); this._text = r.data ?? ''; this._savedText = this._text; this._notify()
  }
  async save(pageId: string, api: PageNodeFileApi): Promise<void> { await api.saveFileContent(pageId, FILE_NAME, this._text); this.markSaved() }
  async restoreVersion(cmd: PageFileRestoreCommand): Promise<void> {
    await cmd.fileApi.restoreVersion(cmd.pageId, FILE_NAME, cmd.version)
    const r = await cmd.contentLoader.loadPageFileContent(cmd.pageId, FILE_NAME, { forceReload: true })
    if (!r.success) throw new Error(`恢复版本后读取失败: ${cmd.pageId}/style.css v${cmd.version}`)
    this._history.clear(); this._history.push(r.data ?? ''); this._text = r.data ?? ''; this._savedText = this._text; this._notify()
  }
  subscribe(l: () => void): () => void { this._listeners.add(l); return () => { this._listeners.delete(l) } }
  private _notify(): void { for (const l of this._listeners) l() }
}
