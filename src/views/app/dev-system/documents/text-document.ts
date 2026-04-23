/**
 * TextDocument — plain-text PageFileDocument for script.js / style.css.
 *
 * Model = string. History is a SnapshotHistory<string>; `text` is always the
 * current cursor entry.
 */
import { computed, ref, shallowRef } from 'vue'
import { SnapshotHistory } from '@spark-view/spark-utils'
import type { LoadFromTextOptions, PageFileDocument, PageFileName } from './types'

const HISTORY_LIMIT = 100

export function createTextDocument(name: 'script.js' | 'style.css'): PageFileDocument<string> {
  const model = shallowRef<string | null>(null)
  const savedText = ref('')
  const loadState = ref<'idle' | 'loading' | 'loaded'>('idle')
  const parseError = ref<string | null>(null)
  const history = new SnapshotHistory<string>(HISTORY_LIMIT)
  const historyRev = ref(0)

  function bumpHistoryRev(): void {
    historyRev.value += 1
  }

  function textFromHistory(): string {
     
    historyRev.value
    return history.current ?? ''
  }

  const text = computed(() => (model.value === null ? '' : textFromHistory()))
  const isDirty = computed(() => model.value !== null && text.value !== savedText.value)
  const canUndo = computed(() => {
     
    historyRev.value
    return model.value !== null && history.canUndo
  })
  const canRedo = computed(() => {
     
    historyRev.value
    return model.value !== null && history.canRedo
  })

  function pushSnapshot(next: string): void {
    if (history.current === next) return
    history.push(next)
    model.value = next
    bumpHistoryRev()
  }

  function loadFromText(nextText: string, options?: LoadFromTextOptions): void {
    const shouldMarkSaved = options?.markSaved ?? true
    history.clear()
    history.push(nextText)
    model.value = nextText
    if (shouldMarkSaved) {
      savedText.value = nextText
    }
    parseError.value = null
    loadState.value = 'loaded'
    bumpHistoryRev()
  }

  function setText(nextText: string): void {
    if (model.value === null) {
      // first-time edit before load → treat as empty baseline
      history.clear()
      history.push('')
      savedText.value = ''
    }
    pushSnapshot(nextText)
    loadState.value = 'loaded'
  }

  function mutate(fn: (current: string) => void): boolean {
    // For text documents, mutation means "here is the next full text".
    // We emulate the style of other docs by letting fn receive the current
    // string; but since strings are immutable, the caller should instead
    // `setText(...)` with a new value. We keep mutate as a no-op hook that
    // returns false to make misuse obvious.
    void fn
    return false
  }

  function undo(): boolean {
    const prev = history.undo()
    if (prev === null) return false
    model.value = prev
    bumpHistoryRev()
    return true
  }

  function redo(): boolean {
    const next = history.redo()
    if (next === null) return false
    model.value = next
    bumpHistoryRev()
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
    bumpHistoryRev()
  }

  function replaceModel(next: string | null): void {
    if (next === null) {
      reset()
      return
    }
    pushSnapshot(next)
    loadState.value = 'loaded'
  }

  return {
    name: name as PageFileName,
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
