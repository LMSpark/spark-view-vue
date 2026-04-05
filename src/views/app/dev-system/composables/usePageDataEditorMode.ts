import { computed, ref, watch } from 'vue'

import { canUseStructuredPageDataEditor, canonicalizePageDataJson, type PageDataEditorMode } from '../pageDataJsonSchema'

export interface UsePageDataEditorModeOptions {
  getRawText: () => string
  applyCanonicalText: (text: string) => void
  defaultMode?: Exclude<PageDataEditorMode, 'text'>
}

export function usePageDataEditorMode(options: UsePageDataEditorModeOptions) {
  const pageDataEditorMode = ref<PageDataEditorMode>(options.defaultMode ?? 'tree')
  const pageDataModeAutoFallback = ref(false)
  const lastStructuredMode = ref<Exclude<PageDataEditorMode, 'text'>>(options.defaultMode ?? 'tree')

  const pageDataObjectEditorAvailable = computed(() => {
    return canUseStructuredPageDataEditor(options.getRawText())
  })

  watch(pageDataObjectEditorAvailable, (available) => {
    if (!available && pageDataEditorMode.value !== 'text') {
      lastStructuredMode.value = pageDataEditorMode.value
      pageDataModeAutoFallback.value = true
      pageDataEditorMode.value = 'text'
      return
    }

    if (available && pageDataModeAutoFallback.value && pageDataEditorMode.value === 'text') {
      pageDataModeAutoFallback.value = false
      pageDataEditorMode.value = lastStructuredMode.value
    }
  }, { immediate: true })

  function handlePageDataEditorModeChange(value: string | number | boolean): void {
    if (value !== 'tree' && value !== 'table' && value !== 'text') {
      return
    }

    pageDataModeAutoFallback.value = false

    if (value === 'text') {
      pageDataEditorMode.value = value
      return
    }

    const currentText = options.getRawText()
    try {
      const canonicalText = canonicalizePageDataJson(currentText).text
      if (canonicalText !== currentText) {
        options.applyCanonicalText(canonicalText)
      }
      lastStructuredMode.value = value
    } catch {
      pageDataModeAutoFallback.value = true
      pageDataEditorMode.value = 'text'
      return
    }

    pageDataEditorMode.value = value
  }

  return {
    pageDataEditorMode,
    pageDataObjectEditorAvailable,
    handlePageDataEditorModeChange,
  }
}