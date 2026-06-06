/** PageDataSetFile——pagedata.json 的内存模型，负责 DataSet 的读写与撤销重做。 */
import { DataSet, DataSetCrudTool } from '@spark-appworks/spark-data'
import { parsePageDataText, serializeDataSet } from '../page-file'

export class PageDataSetFile {
  value: DataSet

  private readonly undoStack: string[] = []
  private readonly redoStack: string[] = []
  private dirty = false
  private toolCache: DataSetCrudTool | null = null

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
    this.invalidateToolCache()
    this.dirty = true
  }

  loadText(text: string): void {
    this.value = parsePageDataText(text, this.pageId)
    this.invalidateToolCache()
    this.clearHistory()
    this.dirty = false
  }

  markSaved(): void {
    this.dirty = false
  }

  getTool(): DataSetCrudTool {
    this.toolCache ??= DataSetCrudTool.fromJson(this.value.toJson())
    return this.toolCache
  }

  replaceTool(tool: DataSetCrudTool): void {
    this.pushUndo()
    this.value = DataSet.fromJson(tool.toJson())
    this.invalidateToolCache()
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
    this.invalidateToolCache()
    this.dirty = true
    return true
  }

  redo(): boolean {
    const text = this.redoStack.pop()
    if (text === undefined) return false
    this.undoStack.push(this.getText())
    this.value = parsePageDataText(text, this.pageId)
    this.invalidateToolCache()
    this.dirty = true
    return true
  }

  private invalidateToolCache(): void {
    this.toolCache = null
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
