/**
 * @module @spark-appworks/spark-project-model:page/content/text-file
 * @spark-appworks/spark-project-model 的 page/content/text-file 模块。
 * 导出 ClassModel symbol: PageTextFile（共 1 个 symbol）。
 */
/**
 * PageTextFile——script.js / style.css 的内存模型，负责文本内容的读写与撤销重做。
 */
import { SnapshotHistory } from '@spark-appworks/spark-utils'

const TEXT_HISTORY_LIMIT = 100

/** Page Text File 的语义模型。 */
export class PageTextFile {
  private _text: string
  private savedText: string
  private readonly history = new SnapshotHistory<string>(TEXT_HISTORY_LIMIT)

    /** 创建 Page Text File 实例。 */
constructor(
    /** 页面 ID，用于标识当前文本资源所属页面。 */
    readonly pageId: string,
    /** 页面文本资源文件名。 */
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

    /** get Text 文本。 */
getText(): string {
    return this._text
  }

    /** set Text 文本。 */
setText(content: string): void {
    if (this.history.current === content) return
    this.history.push(content)
    this._text = content
  }

    /** load Text 文本。 */
loadText(text: string): void {
    this.history.clear()
    this.history.push(text)
    this._text = text
    this.savedText = text
  }

    /** 执行 mark Saved 操作。 */
markSaved(): void {
    this.savedText = this._text
  }

    /** 执行 undo 操作。 */
undo(): boolean {
    const prev = this.history.undo()
    if (prev === null) return false
    this._text = prev
    return true
  }

    /** 执行 redo 操作。 */
redo(): boolean {
    const next = this.history.redo()
    if (next === null) return false
    this._text = next
    return true
  }
}
