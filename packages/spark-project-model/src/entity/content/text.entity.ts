/** TextContent — script.js / style.css 文本文件领域模型。 */
import { SnapshotHistory } from '@spark-view/spark-utils'
import type { BasePageContentLoader } from '../../service/content-loader/types'
import type { PageNodeFileApi } from '../../service/file/file-api.service'
import type { PageFileRestoreCommand } from '../../service/file/file-restore-command'

const HISTORY_LIMIT = 100

export type PageTextFileName = 'script.js' | 'style.css'

export class TextContent {
  private _text: string
  private _savedText: string
  private readonly _history = new SnapshotHistory<string>(HISTORY_LIMIT)
  private readonly _listeners = new Set<() => void>()

  constructor(
    readonly pageId: string,
    readonly fileName: PageTextFileName,
    initialText = '',
  ) {
    this._text = initialText
    this._savedText = initialText
    this._history.push(initialText)
  }

  get text(): string { return this._text }
  get savedText(): string { return this._savedText }
  get isDirty(): boolean { return this._text !== this._savedText }
  get canUndo(): boolean { return this._history.canUndo }
  get canRedo(): boolean { return this._history.canRedo }

  setText(content: string): void {
    if (this._history.current === content) return
    this._history.push(content)
    this._text = content
    this._notify()
  }

  markSaved(): void {
    this._savedText = this._text
    this._notify()
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

  async load(loader: BasePageContentLoader, options?: { forceReload?: boolean }): Promise<void> {
    const result = await loader.loadPageFileContent(this.pageId, this.fileName, {
      forceReload: options?.forceReload === true,
    })
    if (!result.success) {
      throw new Error(result.error ?? result.reason ?? `${this.fileName} 加载失败`)
    }
    this.replaceSavedText(result.data ?? '')
  }

  async save(api: PageNodeFileApi): Promise<void> {
    await api.saveFileContent(this.pageId, this.fileName, this._text)
    this.markSaved()
  }

  async restoreVersion(command: PageFileRestoreCommand): Promise<void> {
    await command.fileApi.restoreVersion(this.pageId, this.fileName, command.version)
    const result = await command.contentLoader.loadPageFileContent(this.pageId, this.fileName, { forceReload: true })
    if (!result.success) {
      throw new Error(`恢复版本后读取失败: ${this.pageId}/${this.fileName} v${command.version}`)
    }
    this.replaceSavedText(result.data ?? '')
  }

  subscribe(listener: () => void): () => void {
    this._listeners.add(listener)
    return () => { this._listeners.delete(listener) }
  }

  private replaceSavedText(text: string): void {
    this._history.clear()
    this._history.push(text)
    this._text = text
    this._savedText = text
    this._notify()
  }

  private _notify(): void {
    for (const listener of this._listeners) listener()
  }
}

export class ScriptContent extends TextContent {
  constructor(pageId: string, initialText = '') { super(pageId, 'script.js', initialText) }
}

export class StyleContent extends TextContent {
  constructor(pageId: string, initialText = '') { super(pageId, 'style.css', initialText) }
}
