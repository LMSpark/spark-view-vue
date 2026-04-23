/**
 * RuleDocument — PageFileDocument for rule.json.
 *
 * Model = SparkNodeTree. Text = `JSON.stringify(tree.toJSON().children, null, 2)\n`.
 * Undo/redo delegates to SparkNodeTree's internal history.
 */
import { computed, ref, shallowRef, triggerRef } from 'vue'
import { SparkNodeTree, type SparkNode } from '@spark-view/spark-component'
import type { LoadFromTextOptions, PageFileDocument } from './types'

function parseRuleChildren(rawText: string): SparkNode[] {
  if (!rawText.trim()) return []
  const parsed = JSON.parse(rawText) as unknown
  if (Array.isArray(parsed)) return parsed as SparkNode[]
  if (
    typeof parsed === 'object'
    && parsed !== null
    && Array.isArray((parsed as Record<string, unknown>)['children'])
  ) {
    return (parsed as Record<string, unknown>)['children'] as SparkNode[]
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

export function createRuleDocument(): PageFileDocument<SparkNodeTree> {
  const model = shallowRef<SparkNodeTree | null>(null)
  const savedText = ref('')
  const loadState = ref<'idle' | 'loading' | 'loaded'>('idle')
  const parseError = ref<string | null>(null)
  const rev = ref(0)

  function bump(): void {
    rev.value += 1
  }

  const text = computed(() => {
     
    rev.value
    const tree = model.value
    if (!tree) return ''
    return serializeRuleChildren(readChildrenFromTree(tree))
  })

  const isDirty = computed(() => model.value !== null && text.value !== savedText.value)
  const canUndo = computed(() => {
     
    rev.value
    return model.value?.canUndo ?? false
  })
  const canRedo = computed(() => {
     
    rev.value
    return model.value?.canRedo ?? false
  })

  function ingestFromText(rawText: string, preserveHistory: boolean): void {
    const children = parseRuleChildren(rawText)
    const normalizedRoot = SparkNodeTree.fromJson({ type: 'page', children }).toJSON()
    if (model.value) {
      if (preserveHistory) {
        model.value.replaceRoot(normalizedRoot)
      } else {
        model.value.loadRoot(normalizedRoot)
      }
      triggerRef(model)
    } else {
      model.value = SparkNodeTree.fromJson(normalizedRoot)
    }
    parseError.value = null
  }

  function loadFromText(rawText: string, options?: LoadFromTextOptions): void {
    const shouldMarkSaved = options?.markSaved ?? true
    try {
      ingestFromText(rawText, false)
      const canonical = text.value
      if (shouldMarkSaved) savedText.value = canonical
      loadState.value = 'loaded'
      bump()
    } catch (error) {
      parseError.value = error instanceof Error ? error.message : String(error)
      model.value = null
      if (shouldMarkSaved) savedText.value = rawText
      loadState.value = 'loaded'
      bump()
    }
  }

  function setText(rawText: string): void {
    try {
      ingestFromText(rawText, model.value !== null)
      loadState.value = 'loaded'
      bump()
    } catch (error) {
      parseError.value = error instanceof Error ? error.message : String(error)
    }
  }

  function mutate(fn: (tree: SparkNodeTree) => void): boolean {
    const tree = model.value
    if (!tree) return false
    fn(tree)
    triggerRef(model)
    bump()
    return true
  }

  function undo(): boolean {
    const tree = model.value
    if (!tree) return false
    const prev = tree.undo()
    if (prev === null) return false
    triggerRef(model)
    bump()
    return true
  }

  function redo(): boolean {
    const tree = model.value
    if (!tree) return false
    const next = tree.redo()
    if (next === null) return false
    triggerRef(model)
    bump()
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
    bump()
  }

  function replaceModel(next: SparkNodeTree | null): void {
    model.value = next
    parseError.value = null
    loadState.value = next === null ? 'idle' : 'loaded'
    if (next !== null) triggerRef(model)
    bump()
  }

  return {
    name: 'rule.json',
    model,
    text,
    savedText,
    loadState,
    parseError,
    isDirty,
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
