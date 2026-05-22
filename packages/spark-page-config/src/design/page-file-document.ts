/**
 * 页面四文件编辑文档注册表。
 *
 * rule.json / pagedata.json 使用领域模型作为真源，script.js / style.css 使用文本模型作为真源；
 * 设计时编辑、预览和版本保存都通过同一组 PageFileDocument 读写。
 */

// ── SECTION 1: 响应式基础原语（原 document-ref.ts）────────────────

export type PageFileDocumentListener = () => void

export class PageConfigValueRef<T> {
  private current: T

  private readonly onChange: PageFileDocumentListener | undefined

  constructor(initialValue: T, onChange?: PageFileDocumentListener) {
    this.current = initialValue
    this.onChange = onChange
  }

  get value(): T {
    return this.current
  }

  set value(next: T) {
    if (Object.is(this.current, next)) return
    this.current = next
    this.onChange?.()
  }
}

export class PageConfigComputedValue<T> {
  private readonly getter: () => T

  constructor(getter: () => T) {
    this.getter = getter
  }

  get value(): T {
    return this.getter()
  }
}

export class PageConfigDocumentChangeNotifier {
  readonly revision = new PageConfigValueRef(0)

  private readonly listeners = new Set<PageFileDocumentListener>()

  readonly notify = (): void => {
    this.revision.value += 1
    for (const listener of this.listeners) {
      listener()
    }
  }

  subscribe(listener: PageFileDocumentListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

// ── SECTION 2: 数据规范化（原 page-data-canonicalize.ts）───────────

import { DataSetCrudTool, type DataSetMetadata } from '@spark-view/spark-data'

function parsePageDataText(rawText: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(rawText)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('pagedata.json 顶层必须是 JSON 对象')
  }
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(parsed)) {
    const desc = Object.getOwnPropertyDescriptor(parsed, key)
    if (desc) result[key] = desc.value
  }
  return result
}

function metadataToRecord(meta: DataSetMetadata): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(meta)) {
    const desc = Object.getOwnPropertyDescriptor(meta, key)
    if (desc) result[key] = desc.value
  }
  return result
}

export function canonicalizePageDataValue(rawValue: Record<string, unknown>): {
  text: string
  value: Record<string, unknown>
  tool: DataSetCrudTool
} {
  const tool = DataSetCrudTool.fromJson(rawValue)
  const value = metadataToRecord(tool.toJson())

  return {
    text: `${JSON.stringify(value, null, 2)}\n`,
    value,
    tool,
  }
}

export function canonicalizePageDataJson(rawText: string): {
  text: string
  value: Record<string, unknown>
  tool: DataSetCrudTool
} {
  return canonicalizePageDataValue(parsePageDataText(rawText))
}

export function canonicalizeDataSetMetadata(metadata: DataSetMetadata): string {
  return canonicalizePageDataValue(metadataToRecord(metadata)).text
}

// ── SECTION 3: 页面文件文档（原 page-file-documents.ts）────────────

import { SnapshotHistory } from '@spark-view/spark-utils'
import { PAGE_CONFIG_FILE_NAMES, type PageConfigFileName, type PageFileRegistry, createDefaultFileRegistry } from '../config'
import { getSparkNodeChildren, SparkNodeTree, type SparkNode } from '../node-tree'

export type PageFileLoadState = 'idle' | 'loading' | 'loaded'

export type LoadFromTextOptions = {
  markSaved?: boolean
}

export abstract class PageFileDocument<TModel = unknown> {
  readonly model: PageConfigValueRef<TModel | null>
  readonly savedText: PageConfigValueRef<string>
  readonly loadState: PageConfigValueRef<PageFileLoadState>
  readonly parseError: PageConfigValueRef<string | null>
  readonly revision: PageConfigValueRef<number>

  protected readonly changes: PageConfigDocumentChangeNotifier

  abstract readonly text: PageConfigComputedValue<string>
  abstract readonly canUndo: PageConfigComputedValue<boolean>
  abstract readonly canRedo: PageConfigComputedValue<boolean>

  constructor(readonly name: string) {
    this.changes = new PageConfigDocumentChangeNotifier()
    this.model = new PageConfigValueRef<TModel | null>(null, this.changes.notify)
    this.savedText = new PageConfigValueRef('', this.changes.notify)
    this.loadState = new PageConfigValueRef<PageFileLoadState>('idle', this.changes.notify)
    this.parseError = new PageConfigValueRef<string | null>(null, this.changes.notify)
    this.revision = this.changes.revision
  }

  subscribe(listener: PageFileDocumentListener): () => void {
    return this.changes.subscribe(listener)
  }

  abstract loadFromText(text: string, options?: LoadFromTextOptions): void
  abstract setText(text: string): void
  abstract mutate(fn: (model: TModel) => void): boolean
  abstract undo(): boolean
  abstract redo(): boolean
  abstract reset(): void
  abstract replaceModel(next: TModel | null): void

  markSaved(): void {
    this.savedText.value = this.text.value
  }

  protected resetDocumentState(): void {
    this.model.value = null
    this.savedText.value = ''
    this.parseError.value = null
    this.loadState.value = 'idle'
  }
}

export function isPageFileDocumentDirty(
  doc: Pick<PageFileDocument, 'text' | 'savedText'>,
): boolean {
  return doc.text.value !== doc.savedText.value
}

type PageDocumentModelMap = {
  'rule.json': SparkNodeTree
  'pagedata.json': DataSetCrudTool
  'script.js': string
  'style.css': string
}

export type PageDocumentRegistry = {
  [K in keyof PageDocumentModelMap]: PageFileDocument<PageDocumentModelMap[K]>
}
export type DynamicPageFileDocument =
  | PageFileDocument<SparkNodeTree>
  | PageFileDocument<DataSetCrudTool>
  | PageFileDocument<string>

type ModelParseResult<TModel> = {
  model: TModel | null
  touchModelRef: boolean
}

type ModelDocumentFactoryOptions<TModel> = {
  toText: (model: TModel) => string
  parseFromText: (rawText: string, current: TModel | null, preserveHistory: boolean) => ModelParseResult<TModel>
  canUndo: (model: TModel) => boolean
  canRedo: (model: TModel) => boolean
  undo: (model: TModel) => boolean
  redo: (model: TModel) => boolean
}

type IngestTextOptions = {
  preserveHistory: boolean
  onErrorResetModel: boolean
  markSaved: boolean
}

class ModelBackedPageFileDocument<TModel> extends PageFileDocument<TModel> {
  readonly text: PageConfigComputedValue<string>
  readonly canUndo: PageConfigComputedValue<boolean>
  readonly canRedo: PageConfigComputedValue<boolean>

  private readonly options: ModelDocumentFactoryOptions<TModel>

  constructor(name: 'rule.json' | 'pagedata.json', options: ModelDocumentFactoryOptions<TModel>) {
    super(name)
    this.options = options
    this.text = new PageConfigComputedValue(() => {
      const currentModel = this.getCurrentModel()
      if (currentModel === null) return ''
      return this.options.toText(currentModel)
    })
    this.canUndo = new PageConfigComputedValue(() => {
      const currentModel = this.getCurrentModel()
      return currentModel === null ? false : this.options.canUndo(currentModel)
    })
    this.canRedo = new PageConfigComputedValue(() => {
      const currentModel = this.getCurrentModel()
      return currentModel === null ? false : this.options.canRedo(currentModel)
    })
  }

  loadFromText(rawText: string, loadOptions?: LoadFromTextOptions): void {
    const shouldMarkSaved = loadOptions?.markSaved ?? true
    this.ingestText(rawText, {
      preserveHistory: false,
      onErrorResetModel: true,
      markSaved: shouldMarkSaved,
    })
  }

  setText(rawText: string): void {
    this.ingestText(rawText, {
      preserveHistory: this.getCurrentModel() !== null,
      onErrorResetModel: false,
      markSaved: false,
    })
  }

  mutate(fn: (currentModel: TModel) => void): boolean {
    const currentModel = this.getCurrentModel()
    if (currentModel === null) return false
    fn(currentModel)
    this.changes.notify()
    return true
  }

  undo(): boolean {
    const currentModel = this.getCurrentModel()
    if (currentModel === null) return false
    if (!this.options.undo(currentModel)) return false
    this.changes.notify()
    return true
  }

  redo(): boolean {
    const currentModel = this.getCurrentModel()
    if (currentModel === null) return false
    if (!this.options.redo(currentModel)) return false
    this.changes.notify()
    return true
  }

  reset(): void {
    this.resetDocumentState()
  }

  replaceModel(next: TModel | null): void {
    this.model.value = next
    this.parseError.value = null
    this.loadState.value = next === null ? 'idle' : 'loaded'
    if (next !== null) {
      this.changes.notify()
    }
  }

  private getCurrentModel(): TModel | null {
    return this.model.value
  }

  private applyParsedResult(result: ModelParseResult<TModel>): void {
    this.model.value = result.model
    if (result.model !== null && result.touchModelRef) {
      this.changes.notify()
    }
    this.parseError.value = null
  }

  private ingestText(rawText: string, ingestOptions: IngestTextOptions): void {
    const { preserveHistory, onErrorResetModel, markSaved: shouldMarkSaved } = ingestOptions
    try {
      const parsed = this.options.parseFromText(rawText, this.getCurrentModel(), preserveHistory)
      this.applyParsedResult(parsed)
      if (shouldMarkSaved) {
        this.savedText.value = this.text.value
      }
      this.loadState.value = 'loaded'
    } catch (error) {
      this.parseError.value = error instanceof Error ? error.message : String(error)
      if (!onErrorResetModel) return
      this.model.value = null
      if (shouldMarkSaved) this.savedText.value = rawText
      this.loadState.value = 'loaded'
    }
  }
}

function createModelBackedDocument<TModel>(
  name: 'rule.json' | 'pagedata.json',
  options: ModelDocumentFactoryOptions<TModel>,
): PageFileDocument<TModel> {
  return new ModelBackedPageFileDocument(name, options)
}

function serializeRuleChildren(children: SparkNode[]): string {
  const rootValue = children.length === 1 ? children[0] : children
  return `${JSON.stringify(rootValue, null, 2)}\n`
}

function readChildrenFromTree(tree: SparkNodeTree): SparkNode[] {
  const root = tree.toJSON()
  return getSparkNodeChildren(root.children)
}

function createRuleDocument(): PageFileDocument<SparkNodeTree> {
  function parseRule(rawText: string, current: SparkNodeTree | null, preserveHistory: boolean): ModelParseResult<SparkNodeTree> {
    if (!rawText.trim()) {
      return { model: null, touchModelRef: false }
    }
    const normalizedRoot = SparkNodeTree.fromRuleJson(rawText).toJSON()
    if (current) {
      if (preserveHistory) {
        current.replaceRoot(normalizedRoot)
      } else {
        current.loadRoot(normalizedRoot)
      }
      return { model: current, touchModelRef: true }
    }
    return {
      model: SparkNodeTree.fromJson(normalizedRoot),
      touchModelRef: false,
    }
  }

  return createModelBackedDocument('rule.json', {
    toText: (tree) => serializeRuleChildren(readChildrenFromTree(tree)),
    parseFromText: parseRule,
    canUndo: (tree) => tree.canUndo,
    canRedo: (tree) => tree.canRedo,
    undo: (tree) => tree.undo() !== null,
    redo: (tree) => tree.redo() !== null,
  })
}

function createPageDataDocument(): PageFileDocument<DataSetCrudTool> {
  function parsePageData(
    rawText: string,
    current: DataSetCrudTool | null,
    preserveHistory: boolean,
  ): ModelParseResult<DataSetCrudTool> {
    if (!rawText.trim()) {
      return { model: null, touchModelRef: false }
    }
    if (!current) {
      return {
        model: DataSetCrudTool.fromJson(rawText),
        touchModelRef: false,
      }
    }
    const next = DataSetCrudTool.reconcileFromJson(rawText, current, { preserveHistory })
    return { model: next, touchModelRef: true }
  }

  return createModelBackedDocument('pagedata.json', {
    toText: (tool) => canonicalizeDataSetMetadata(tool.toJson()),
    parseFromText: parsePageData,
    canUndo: (tool) => tool.canUndo,
    canRedo: (tool) => tool.canRedo,
    undo: (tool) => tool.undo(),
    redo: (tool) => tool.redo(),
  })
}

const HISTORY_LIMIT = 100

class TextPageFileDocument extends PageFileDocument<string> {
  readonly text = new PageConfigComputedValue(() => this.model.value ?? '')
  readonly canUndo = new PageConfigComputedValue(() => this.model.value !== null && this.history.canUndo)
  readonly canRedo = new PageConfigComputedValue(() => this.model.value !== null && this.history.canRedo)

  private readonly history = new SnapshotHistory<string>(HISTORY_LIMIT)

  loadFromText(nextText: string, options?: LoadFromTextOptions): void {
    const shouldMarkSaved = options?.markSaved ?? true
    this.history.clear()
    this.history.push(nextText)
    this.setLoadedText(nextText)
    if (shouldMarkSaved) {
      this.savedText.value = nextText
    }
    this.parseError.value = null
  }

  setText(nextText: string): void {
    if (this.model.value === null) {
      this.history.clear()
      this.history.push('')
      this.savedText.value = ''
    }
    this.pushSnapshot(nextText)
    this.loadState.value = 'loaded'
  }

  mutate(): boolean {
    throw new Error(`${this.name} 不支持 mutate；请使用 setText`)
  }

  undo(): boolean {
    const prev = this.history.undo()
    if (prev === null) return false
    this.setLoadedText(prev)
    return true
  }

  redo(): boolean {
    const next = this.history.redo()
    if (next === null) return false
    this.setLoadedText(next)
    return true
  }

  reset(): void {
    this.history.clear()
    this.resetDocumentState()
  }

  replaceModel(next: string | null): void {
    if (next === null) {
      this.reset()
      return
    }
    this.history.clear()
    this.history.push(next)
    this.setLoadedText(next)
    this.parseError.value = null
    this.loadState.value = 'loaded'
  }

  private setLoadedText(nextText: string): void {
    this.model.value = nextText
    this.loadState.value = 'loaded'
  }

  private pushSnapshot(next: string): void {
    if (this.history.current === next) return
    this.history.push(next)
    this.setLoadedText(next)
  }
}

function createTextDocument(name: string): PageFileDocument<string> {
  return new TextPageFileDocument(name)
}

export function createPageDocuments(): PageDocumentRegistry {
  return {
    'rule.json': createRuleDocument(),
    'pagedata.json': createPageDataDocument(),
    'script.js': createTextDocument('script.js'),
    'style.css': createTextDocument('style.css'),
  }
}

export function forEachDocument(
  registry: PageDocumentRegistry,
  visit: <K extends PageConfigFileName>(name: K, doc: PageDocumentRegistry[K]) => void,
): void {
  for (const name of PAGE_CONFIG_FILE_NAMES) {
    visit(name, registry[name])
  }
}

/**
 * 动态文档注册表：基于 PageFileRegistry 创建文档映射。
 * 返回值中的 key 为注册表中声明的文件名，value 为对应的 PageFileDocument。
 *
 * 对于已知的四文件（rule.json / pagedata.json / script.js / style.css），
 * 使用对应的领域文档工厂；对于未知文件类型，回退为 text-backed 文档。
 */
export function createPageDocumentsFromRegistry(
  registry: PageFileRegistry = createDefaultFileRegistry(),
): Record<string, DynamicPageFileDocument> {
  const result: Record<string, DynamicPageFileDocument> = {}
  for (const [name] of registry) {
    if (name === 'rule.json') {
      result[name] = createRuleDocument()
    } else if (name === 'pagedata.json') {
      result[name] = createPageDataDocument()
    } else {
      result[name] = createTextDocument(name)
    }
  }
  return result
}

/**
 * 遍历动态文档注册表中的所有文档。
 */
export function forEachDynamicDocument(
  documents: Record<string, DynamicPageFileDocument>,
  visit: (name: string, doc: DynamicPageFileDocument) => void,
): void {
  for (const [name, doc] of Object.entries(documents)) {
    visit(name, doc)
  }
}
