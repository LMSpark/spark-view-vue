import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { IDataRow } from '@spark-view/spark-data'
import type { Ref } from 'vue'
import type { ValueRef } from '../../../shared-types.js'

interface UseHtmlEditorStateOptions {
  editorRef: Ref<HTMLElement | null>
  fieldValue: ValueRef<unknown>
  isCurrentFieldEditable: ValueRef<boolean>
  syncValue: (value: string) => void
  emitUpdate: (value: string) => void
  getRowRawValue: (row: IDataRow) => unknown
}

export function stripHtml(value: unknown): string {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function useHtmlEditorState(options: UseHtmlEditorStateOptions) {
  const sourceMode = ref(false)
  const htmlValue = computed(() => String(options.fieldValue.value ?? ''))
  const plainValue = computed(() => stripHtml(htmlValue.value))

  function syncEditorSurface(): void {
    if (sourceMode.value) return
    if (options.editorRef.value && options.editorRef.value.innerHTML !== htmlValue.value) {
      options.editorRef.value.innerHTML = htmlValue.value
    }
  }

  function updateValue(value: string): void {
    options.emitUpdate(value)
    options.syncValue(value)
  }

  function handleSourceChange(value: string): void {
    updateValue(value)
  }

  function handleSurfaceInput(event: Event): void {
    const target = event.target as HTMLElement
    updateValue(target.innerHTML)
  }

  function applyCommand(command: string): void {
    if (!options.editorRef.value || sourceMode.value || !options.isCurrentFieldEditable.value) return
    options.editorRef.value.focus()
    if (typeof document.execCommand === 'function') {
      document.execCommand(command, false)
      updateValue(options.editorRef.value.innerHTML)
    }
  }

  function toggleSourceMode(): void {
    sourceMode.value = !sourceMode.value
    void nextTick(() => syncEditorSurface())
  }

  function getPlainTableValue(row: IDataRow): string {
    return stripHtml(options.getRowRawValue(row))
  }

  watch(htmlValue, () => {
    syncEditorSurface()
  })

  onMounted(() => {
    syncEditorSurface()
  })

  return {
    sourceMode,
    htmlValue,
    plainValue,
    handleSourceChange,
    handleSurfaceInput,
    applyCommand,
    toggleSourceMode,
    getPlainTableValue,
  }
}