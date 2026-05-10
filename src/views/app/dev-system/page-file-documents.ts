/**
 * DevSystem 页面四文件文档注册表。
 *
 * rule.json / pagedata.json 使用领域模型作为真源，script.js / style.css 使用文本模型作为真源；
 * DevSystem 手工编辑、预览和 AI 编辑都通过同一组 PageFileDocument 读写。
 */
import type { ComputedRef, Ref, ShallowRef } from 'vue'
import { computed, ref, shallowRef, triggerRef } from 'vue'
import { SparkNodeTree, type SparkNode } from '@spark-view/spark-component'
import { DataSetCrudTool, type IDataSetMetadata } from '@spark-view/spark-data'
import { SnapshotHistory } from '@spark-view/spark-utils'
import { normalizeRuleNode } from '@spark-view/spark-page-config'
import { canonicalizePageDataValue } from './policies/pageDataJsonSchema'

export const PAGE_FILE_NAMES = [
  'rule.json',
  'pagedata.json',
  'script.js',
  'style.css',
] as const
export type PageFileName = typeof PAGE_FILE_NAMES[number]

export type PageFileLoadState = 'idle' | 'loading' | 'loaded'

export interface LoadFromTextOptions {
  markSaved?: boolean
}

export interface PageFileDocument<TModel = unknown> {
  readonly name: PageFileName
  readonly model: ShallowRef<TModel | null>
  readonly text: ComputedRef<string>
  readonly savedText: Ref<string>
  readonly loadState: Ref<PageFileLoadState>
  readonly parseError: Ref<string | null>
  readonly canUndo: ComputedRef<boolean>
  readonly canRedo: ComputedRef<boolean>
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
  const model = shallowRef<TModel | null>(null)
  const savedText = ref('')
  const loadState = ref<PageFileLoadState>('idle')
  const parseError = ref<string | null>(null)

  function getCurrentModel(): TModel | null {
    return model.value as TModel | null
  }

  const text = computed(() => {
    const currentModel = getCurrentModel()
    if (currentModel === null) return ''
    return options.toText(currentModel)
  })

  const canUndo = computed(() => {
    const currentModel = getCurrentModel()
    return currentModel === null ? false : options.canUndo(currentModel)
  })

  const canRedo = computed(() => {
    const currentModel = getCurrentModel()
    return currentModel === null ? false : options.canRedo(currentModel)
  })

  function applyParsedResult(result: ModelParseResult<TModel>): void {
    model.value = result.model
    if (result.model !== null && result.touchModelRef) {
      triggerRef(model)
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
    triggerRef(model)
    return true
  }

  function undo(): boolean {
    const currentModel = getCurrentModel()
    if (currentModel === null) return false
    if (!options.undo(currentModel)) return false
    triggerRef(model)
    return true
  }

  function redo(): boolean {
    const currentModel = getCurrentModel()
    if (currentModel === null) return false
    if (!options.redo(currentModel)) return false
    triggerRef(model)
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
      triggerRef(model)
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

function parseRuleChildren(rawText: string): SparkNode[] {
  if (!rawText.trim()) return []
  const parsed = JSON.parse(rawText) as unknown
  if (Array.isArray(parsed)) {
    return parsed.map(node => normalizeRuleNode(node) as unknown as SparkNode)
  }
  if (
    typeof parsed === 'object'
    && parsed !== null
    && Array.isArray((parsed as Record<string, unknown>)['children'])
  ) {
    return ((parsed as Record<string, unknown>)['children'] as unknown[])
      .map(node => normalizeRuleNode(node) as unknown as SparkNode)
  }
  throw new Error('rule.json 必须是数组或含 children 的根对象')
}

function serializeRuleChildren(children: SparkNode[]): string {
  return `${JSON.stringify(children, null, 2)}\n`
}

function readChildrenFromTree(tree: SparkNodeTree): SparkNode[] {
  const root = tree.toJSON()
  return Array.isArray(root.children) ? (root.children as SparkNode[]) : []
}

function createRuleDocument(): PageFileDocument<SparkNodeTree> {
  function parseRule(rawText: string, current: SparkNodeTree | null, preserveHistory: boolean): ModelParseResult<SparkNodeTree> {
    const children = parseRuleChildren(rawText)
    const normalizedRoot = SparkNodeTree.fromJson({ type: 'page', children }).toJSON()
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
  const model = shallowRef<string | null>(null)
  const savedText = ref('')
  const loadState = ref<PageFileLoadState>('idle')
  const parseError = ref<string | null>(null)
  const history = new SnapshotHistory<string>(HISTORY_LIMIT)
  const text = computed(() => model.value ?? '')
  const canUndo = computed(() => model.value !== null && history.canUndo)
  const canRedo = computed(() => model.value !== null && history.canRedo)

  function setLoadedText(nextText: string): void {
    model.value = nextText
    loadState.value = 'loaded'
    triggerRef(model)
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
    triggerRef(model)
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
  visit: <K extends PageFileName>(name: K, doc: PageDocumentRegistry[K]) => void,
): void {
  for (const name of PAGE_FILE_NAMES) {
    visit(name, registry[name])
  }
}
