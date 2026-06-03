/** PageDataSetFile——pagedata.json 的内存模型，负责 DataSet 的读写与撤销重做。 */
import { DataSet, DataSetCrudTool } from '@spark-view/spark-data'
import type {
  PageFileContentLoader,
  PageFileRestoreCommand,
  PageFileWriter,
} from '../node/page-file-types'
import { parsePageDataText, serializeDataSet } from '../node/page-file-serialization'
import type { PageNodeLoadOptions } from '../node/config-page.entity'

export class PageDataSetFile {
  value: DataSet

  private readonly undoStack: string[] = []
  private readonly redoStack: string[] = []
  private dirty = false

  constructor(readonly pageId: string) {
    this.value = DataSet.fromJson({ dataSetName: pageId, tables: {} })
  }

  get isDirty(): boolean { return this.dirty }
  get canUndo(): boolean { return this.undoStack.length > 0 }
  get canRedo(): boolean { return this.redoStack.length > 0 }

  getText(): string { return serializeDataSet(this.value) }

  setText(text: string): void {
    this.pushUndo()
    this.value = parsePageDataText(text, this.pageId)
    this.dirty = true
  }

  loadText(text: string): void {
    this.value = parsePageDataText(text, this.pageId)
    this.clearHistory()
    this.dirty = false
  }

  async load(loader: PageFileContentLoader, options?: PageNodeLoadOptions): Promise<void> {
    const result = await loader.loadPageFileContent(this.pageId, 'pagedata.json', {
      forceReload: options?.forceReload === true,
    })
    if (!result.success) throw new Error(result.error ?? result.reason ?? 'pagedata.json 加载失败')
    this.loadText(result.data ?? '')
  }

  async save(api: PageFileWriter): Promise<void> {
    await api.saveFileContent(this.pageId, 'pagedata.json', this.getText())
    this.dirty = false
  }

  async restoreVersion(command: PageFileRestoreCommand): Promise<void> {
    await command.fileApi.restoreVersion(this.pageId, 'pagedata.json', command.version)
    const result = await command.contentLoader.loadPageFileContent(this.pageId, 'pagedata.json', { forceReload: true })
    if (!result.success) throw new Error(`恢复版本后读取失败: ${this.pageId}/pagedata.json v${command.version}`)
    this.loadText(result.data ?? '')
  }

  getTool(): DataSetCrudTool {
    return DataSetCrudTool.fromJson(this.value.toJson())
  }

  replaceTool(tool: DataSetCrudTool): void {
    this.pushUndo()
    this.value = DataSet.fromJson(tool.toJson())
    this.dirty = true
  }

  async editTool(run: (tool: DataSetCrudTool) => void | Promise<void>): Promise<void> {
    const tool = this.getTool()
    await run(tool)
    this.replaceTool(tool)
  }

  undo(): boolean {
    const text = this.undoStack.pop()
    if (text === undefined) return false
    this.redoStack.push(this.getText())
    this.value = parsePageDataText(text, this.pageId)
    this.dirty = true
    return true
  }

  redo(): boolean {
    const text = this.redoStack.pop()
    if (text === undefined) return false
    this.undoStack.push(this.getText())
    this.value = parsePageDataText(text, this.pageId)
    this.dirty = true
    return true
  }

  private pushUndo(): void {
    this.undoStack.push(this.getText())
    this.redoStack.length = 0
  }

  private clearHistory(): void {
    this.undoStack.length = 0
    this.redoStack.length = 0
  }
}
