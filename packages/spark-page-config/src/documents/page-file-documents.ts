/**
 * 页面四文件编辑文档注册表。
 *
 * rule.json / pagedata.json 使用领域模型作为真源，script.js / style.css 使用文本模型作为真源；
 * 设计时编辑、预览和版本保存都通过同一组 PageFileDocument 读写。
 */
import { DataSetCrudTool, type IDataSetMetadata } from '@spark-view/spark-data'
import { SnapshotHistory } from '@spark-view/spark-utils'
import { PAGE_CONFIG_FILE_NAMES, type PageConfigFileName } from '../types'
import { SparkNodeTree } from '../core/spark-node-tree'
import type { SparkNode } from '../core/spark-node'

export interface PageConfigValueRef<T> {
  value: T
}

export interface PageConfigComputedRef<T> {
  readonly value: T
}

export type PageFileDocumentListener = () => void

function createValueRef<T>(initialValue: T, onChange?: PageFileDocumentListener): PageConfigValueRef<T> {
  let current = initialValue
  return {
    get value() {
      return current
    },
    set value(next) {
      if (Object.is(current, next)) return
      current = next
      onChange?.()
    },
  }
}

function createComputedValue<T>(getter: () => T): PageConfigComputedRef<T> {
  return {
    get value() {
      return getter()
    },
  }
}

function createDocumentChangeNotifier(): {
  revision: PageConfigValueRef<number>
  notify: () => void
  subscribe: (listener: PageFileDocumentListener) => () => void
} {
  const revision = createValueRef(0)
  const listeners = new Set<PageFileDocumentListener>()

  function notify(): void {
    revision.value += 1
    for (const listener of listeners) {
      listener()
    }
  }

  function subscribe(listener: PageFileDocumentListener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return { revision, notify, subscribe }
}

function parsePageDataText(rawText: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(rawText)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('pagedata.json 顶层必须是 JSON 对象')
  }
  return parsed as Record<string, unknown>
}

export function canonicalizePageDataValue(rawValue: Record<string, unknown>): {
  text: string
  value: Record<string, unknown>
  tool: DataSetCrudTool
} {
  const tool = DataSetCrudTool.fromJson(rawValue)
  const value = tool.toJson() as unknown as Record<string, unknown>

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

export type PageFileLoadState = 'idle' | 'loading' | 'loaded'

export interface LoadFromTextOptions {
  markSaved?: boolean
}

export interface PageFileDocument<TModel = unknown> {
  readonly name: PageConfigFileName
  readonly model: PageConfigValueRef<TModel | null>
  readonly text: PageConfigComputedRef<string>
  readonly savedText: PageConfigValueRef<string>
  readonly loadState: PageConfigValueRef<PageFileLoadState>
  readonly parseError: PageConfigValueRef<string | null>
  readonly canUndo: PageConfigComputedRef<boolean>
  readonly canRedo: PageConfigComputedRef<boolean>
  readonly revision: PageConfigValueRef<number>
  subscribe(listener: PageFileDocumentListener): () => void
  loadFromText(text: string, options?: LoadFromTextOptions): void
  setText(text: string): void
  mutate(fn: (model: TModel) => void): boolean
  undo(): boolean
  redo(): boolean
  markSaved(): void
  reset(): void
  replaceModel(next: TModel | null): void
}

export function isPageFileDocumentDirty(
  doc: Pick<PageFileDocument, 'text' | 'savedText'>,
): boolean {
  return doc.text.value !== doc.savedText.value
}

interface PageDocumentModelMap {
  'rule.json': SparkNodeTree
  'pagedata.json': DataSetCrudTool
  'script.js': string
  'style.css': string
}

export type PageDocumentRegistry = {
  [K in keyof PageDocumentModelMap]: PageFileDocument<PageDocumentModelMap[K]>
}

interface ModelParseResult<TModel> {
  model: TModel | null
  touchModelRef: boolean
}

interface ModelDocumentFactoryOptions<TModel> {
  toText: (model: TModel) => string
  parseFromText: (rawText: string, current: TModel | null, preserveHistory: boolean) => ModelParseResult<TModel>
  canUndo: (model: TModel) => boolean
  canRedo: (model: TModel) => boolean
  undo: (model: TModel) => boolean
  redo: (model: TModel) => boolean
}

interface IngestTextOptions {
  preserveHistory: boolean
  onErrorResetModel: boolean
  markSaved: boolean
}

function createModelBackedDocument<TModel>(
  name: 'rule.json' | 'pagedata.json',
  options: ModelDocumentFactoryOptions<TModel>,
): PageFileDocument<TModel> {
  const changes = createDocumentChangeNotifier()
  const model = createValueRef<TModel | null>(null, changes.notify)
  const savedText = createValueRef('', changes.notify)
  const loadState = createValueRef<PageFileLoadState>('idle', changes.notify)
  const parseError = createValueRef<string | null>(null, changes.notify)

  function getCurrentModel(): TModel | null {
    return model.value
  }

  const text = createComputedValue(() => {
    const currentModel = getCurrentModel()
    if (currentModel === null) return ''
    return options.toText(currentModel)
  })

  const canUndo = createComputedValue(() => {
    const currentModel = getCurrentModel()
    return currentModel === null ? false : options.canUndo(currentModel)
  })

  const canRedo = createComputedValue(() => {
    const currentModel = getCurrentModel()
    return currentModel === null ? false : options.canRedo(currentModel)
  })

  function applyParsedResult(result: ModelParseResult<TModel>): void {
    model.value = result.model
    if (result.model !== null && result.touchModelRef) {
      changes.notify()
    }
    parseError.value = null
  }

  function ingestText(rawText: string, ingestOptions: IngestTextOptions): void {
    const { preserveHistory, onErrorResetModel, markSaved: shouldMarkSaved } = ingestOptions
    try {
      const parsed = options.parseFromText(rawText, getCurrentModel(), preserveHistory)
      applyParsedResult(parsed)
      if (shouldMarkSaved) {
        savedText.value = text.value
      }
      loadState.value = 'loaded'
    } catch (error) {
      parseError.value = error instanceof Error ? error.message : String(error)
      if (!onErrorResetModel) return
      model.value = null
      if (shouldMarkSaved) savedText.value = rawText
      loadState.value = 'loaded'
    }
  }

  function loadFromText(rawText: string, loadOptions?: LoadFromTextOptions): void {
    const shouldMarkSaved = loadOptions?.markSaved ?? true
    ingestText(rawText, {
      preserveHistory: false,
      onErrorResetModel: true,
      markSaved: shouldMarkSaved,
    })
  }

  function setText(rawText: string): void {
    if (loadState.value === 'loaded' && parseError.value === null && rawText === text.value) return
    ingestText(rawText, {
      preserveHistory: getCurrentModel() !== null,
      onErrorResetModel: false,
      markSaved: false,
    })
  }

  function mutate(fn: (currentModel: TModel) => void): boolean {
    const currentModel = getCurrentModel()
    if (currentModel === null) return false
    fn(currentModel)
    changes.notify()
    return true
  }

  function undo(): boolean {
    const currentModel = getCurrentModel()
    if (currentModel === null) return false
    if (!options.undo(currentModel)) return false
    changes.notify()
    return true
  }

  function redo(): boolean {
    const currentModel = getCurrentModel()
    if (currentModel === null) return false
    if (!options.redo(currentModel)) return false
    changes.notify()
    return true
  }

  function markSaved(): void {
    savedText.value = text.value
  }

  function reset(): void {
    model.value = null
    savedText.value = ''
    parseError.value = null
    loadState.value = 'idle'
  }

  function replaceModel(next: TModel | null): void {
    model.value = next
    parseError.value = null
    loadState.value = next === null ? 'idle' : 'loaded'
    if (next !== null) {
      changes.notify()
    }
  }

  return {
    name,
    model,
    text,
    savedText,
    loadState,
    parseError,
    canUndo,
    canRedo,
    revision: changes.revision,
    subscribe: changes.subscribe,
    loadFromText,
    setText,
    mutate,
    undo,
    redo,
    markSaved,
    reset,
    replaceModel,
  }
}

function serializeRuleChildren(children: SparkNode[]): string {
  const rootValue = children.length === 1 ? children[0] : children
  return `${JSON.stringify(rootValue, null, 2)}\n`
}

function readChildrenFromTree(tree: SparkNodeTree): SparkNode[] {
  const root = tree.toJSON()
  return Array.isArray(root.children) ? (root.children as SparkNode[]) : []
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

function canonicalizeMetadata(metadata: IDataSetMetadata): string {
  return canonicalizePageDataValue(metadata as unknown as Record<string, unknown>).text
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
    toText: (tool) => canonicalizeMetadata(tool.toJson()),
    parseFromText: parsePageData,
    canUndo: (tool) => tool.canUndo,
    canRedo: (tool) => tool.canRedo,
    undo: (tool) => tool.undo(),
    redo: (tool) => tool.redo(),
  })
}

const HISTORY_LIMIT = 100

function createTextDocument(name: 'script.js' | 'style.css'): PageFileDocument<string> {
  const changes = createDocumentChangeNotifier()
  const model = createValueRef<string | null>(null, changes.notify)
  const savedText = createValueRef('', changes.notify)
  const loadState = createValueRef<PageFileLoadState>('idle', changes.notify)
  const parseError = createValueRef<string | null>(null, changes.notify)
  const history = new SnapshotHistory<string>(HISTORY_LIMIT)
  const text = createComputedValue(() => model.value ?? '')
  const canUndo = createComputedValue(() => model.value !== null && history.canUndo)
  const canRedo = createComputedValue(() => model.value !== null && history.canRedo)

  function setLoadedText(nextText: string): void {
    model.value = nextText
    loadState.value = 'loaded'
  }

  function pushSnapshot(next: string): void {
    if (history.current === next) return
    history.push(next)
    setLoadedText(next)
  }

  function loadFromText(nextText: string, options?: LoadFromTextOptions): void {
    const shouldMarkSaved = options?.markSaved ?? true
    history.clear()
    history.push(nextText)
    setLoadedText(nextText)
    if (shouldMarkSaved) {
      savedText.value = nextText
    }
    parseError.value = null
  }

  function setText(nextText: string): void {
    if (model.value === null) {
      history.clear()
      history.push('')
      savedText.value = ''
    }
    pushSnapshot(nextText)
    loadState.value = 'loaded'
  }

  function mutate(fn: (current: string) => void): boolean {
    void fn
    throw new Error(`${name} 不支持 mutate；请使用 setText`)
  }

  function undo(): boolean {
    const prev = history.undo()
    if (prev === null) return false
    setLoadedText(prev)
    return true
  }

  function redo(): boolean {
    const next = history.redo()
    if (next === null) return false
    setLoadedText(next)
    return true
  }

  function markSaved(): void {
    savedText.value = text.value
  }

  function reset(): void {
    history.clear()
    model.value = null
    savedText.value = ''
    parseError.value = null
    loadState.value = 'idle'
  }

  function replaceModel(next: string | null): void {
    if (next === null) {
      reset()
      return
    }
    history.clear()
    history.push(next)
    setLoadedText(next)
    parseError.value = null
    loadState.value = 'loaded'
  }

  return {
    name,
    model,
    text,
    savedText,
    loadState,
    parseError,
    canUndo,
    canRedo,
    revision: changes.revision,
    subscribe: changes.subscribe,
    loadFromText,
    setText,
    mutate,
    undo,
    redo,
    markSaved,
    reset,
    replaceModel,
  }
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
