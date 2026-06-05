/** PageTextFile——script.js / style.css 的内存模型，负责文本内容的读写与撤销重做。 */
import { SnapshotHistory } from '@spark-appworks/spark-utils'
import type {
  PageFileContentLoader,
  PageFileRestoreCommand,
  PageFileWriter,
} from '../file'

const TEXT_HISTORY_LIMIT = 100

export class PageTextFile {
  private _text: string
  private savedText: string
  private readonly history = new SnapshotHistory<string>(TEXT_HISTORY_LIMIT)

  constructor(
    readonly pageId: string,
    readonly fileName: 'script.js' | 'style.css',
    initialText = '',
  ) {
    this._text = initialText
    this.savedText = initialText
    this.history.push(initialText)
  }

  get text(): string { return this._text }
  get isDirty(): boolean { return this._text !== this.savedText }
  get canUndo(): boolean { return this.history.canUndo }
  get canRedo(): boolean { return this.history.canRedo }

  getText(): string {
    return this._text
  }

  setText(content: string): void {
    if (this.history.current === content) return
    this.history.push(content)
    this._text = content
  }

  undo(): boolean {
    const prev = this.history.undo()
    if (prev === null) return false
    this._text = prev
    return true
  }

  redo(): boolean {
    const next = this.history.redo()
    if (next === null) return false
    this._text = next
    return true
  }

  async load(loader: PageFileContentLoader, options?: { forceReload?: boolean }): Promise<void> {
    const result = await loader.loadPageFileContent(this.pageId, this.fileName, {
      forceReload: options?.forceReload === true,
    })
    if (!result.success) throw new Error(result.error ?? result.reason ?? `${this.fileName} 加载失败`)
    this.replaceSavedText(result.data ?? '')
  }

  async save(api: PageFileWriter): Promise<void> {
    await api.saveFileContent(this.pageId, this.fileName, this._text)
    this.savedText = this._text
  }

  async restoreVersion(command: PageFileRestoreCommand): Promise<void> {
    await command.fileApi.restoreVersion(this.pageId, this.fileName, command.version)
    const result = await command.contentLoader.loadPageFileContent(this.pageId, this.fileName, { forceReload: true })
    if (!result.success) throw new Error(`恢复版本后读取失败: ${this.pageId}/${this.fileName} v${command.version}`)
    this.replaceSavedText(result.data ?? '')
  }

  private replaceSavedText(text: string): void {
    this.history.clear()
    this.history.push(text)
    this._text = text
    this.savedText = text
  }
}
