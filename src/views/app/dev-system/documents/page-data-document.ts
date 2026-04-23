/**
 * PageDataDocument — PageFileDocument for pagedata.json.
 *
 * Model = DataSetCrudTool. Text = canonicalized pagedata JSON.
 * Undo/redo delegates to the tool's internal SnapshotHistory<IDataSetMetadata>.
 */
import { computed, ref, shallowRef, triggerRef } from 'vue'
import { DataSetCrudTool, type IDataSetMetadata } from '@spark-view/spark-data'
import { canonicalizePageDataValue } from '../policies/pageDataJsonSchema'
import type { LoadFromTextOptions, PageFileDocument } from './types'

function canonicalizeMetadata(metadata: IDataSetMetadata): string {
  return canonicalizePageDataValue(metadata as unknown as Record<string, unknown>).text
}

export function createPageDataDocument(): PageFileDocument<DataSetCrudTool> {
  const model = shallowRef<DataSetCrudTool | null>(null)
  const savedText = ref('')
  const loadState = ref<'idle' | 'loading' | 'loaded'>('idle')
  const parseError = ref<string | null>(null)
  const rev = ref(0)

  function bump(): void {
    rev.value += 1
  }

  const text = computed(() => {
     
    rev.value
    const tool = model.value
    if (!tool) return ''
    return canonicalizeMetadata(tool.toJson())
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

  function reconcile(snapshot: IDataSetMetadata | Record<string, unknown> | string, preserveHistory: boolean): void {
    const next = DataSetCrudTool.reconcileFromJson(
      snapshot,
      model.value ?? undefined,
      { preserveHistory },
    )
    model.value = next
    triggerRef(model)
    parseError.value = null
  }

  function loadFromText(rawText: string, options?: LoadFromTextOptions): void {
    const shouldMarkSaved = options?.markSaved ?? true
    if (!rawText.trim()) {
      // empty payload: reset tool so the document behaves like "idle loaded"
      model.value = null
      if (shouldMarkSaved) savedText.value = ''
      parseError.value = null
      loadState.value = 'loaded'
      bump()
      return
    }
    try {
      reconcile(rawText, false)
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
    if (!rawText.trim()) {
      model.value = null
      parseError.value = null
      loadState.value = 'loaded'
      bump()
      return
    }
    try {
      reconcile(rawText, model.value !== null)
      loadState.value = 'loaded'
      bump()
    } catch (error) {
      parseError.value = error instanceof Error ? error.message : String(error)
    }
  }

  function mutate(fn: (tool: DataSetCrudTool) => void): boolean {
    const tool = model.value
    if (!tool) return false
    fn(tool)
    triggerRef(model)
    bump()
    return true
  }

  function undo(): boolean {
    const tool = model.value
    if (!tool) return false
    if (!tool.undo()) return false
    triggerRef(model)
    bump()
    return true
  }

  function redo(): boolean {
    const tool = model.value
    if (!tool) return false
    if (!tool.redo()) return false
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

  function replaceModel(next: DataSetCrudTool | null): void {
    model.value = next
    parseError.value = null
    loadState.value = next === null ? 'idle' : 'loaded'
    if (next !== null) {
      triggerRef(model)
    }
    bump()
  }

  return {
    name: 'pagedata.json',
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
