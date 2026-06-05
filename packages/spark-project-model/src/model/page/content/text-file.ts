/** PageTextFile——script.js / style.css 的内存模型，负责文本内容的读写与撤销重做。 */
import { SnapshotHistory } from '@spark-appworks/spark-utils'

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

  loadText(text: string): void {
    this.history.clear()
    this.history.push(text)
    this._text = text
    this.savedText = text
  }

  markSaved(): void {
    this.savedText = this._text
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
}
