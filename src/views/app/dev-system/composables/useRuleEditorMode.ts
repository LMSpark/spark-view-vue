import { computed, ref, watch } from 'vue'

import { parseJsonDocument } from '../jsonTreeEditor'

export type RuleEditorMode = 'tree' | 'text'

export interface UseRuleEditorModeOptions {
  getRawText: () => string
}

export function useRuleEditorMode(options: UseRuleEditorModeOptions) {
  const ruleEditorMode = ref<RuleEditorMode>('tree')
  const ruleModeAutoFallback = ref(false)

  const ruleTreeEditorAvailable = computed(() => {
    const rawText = options.getRawText().trim()
    if (!rawText) return false
    try {
      parseJsonDocument(rawText)
      return true
    } catch {
      return false
    }
  })

  watch(ruleTreeEditorAvailable, (available) => {
    if (!available && ruleEditorMode.value === 'tree') {
      ruleModeAutoFallback.value = true
      ruleEditorMode.value = 'text'
      return
    }

    if (available && ruleModeAutoFallback.value && ruleEditorMode.value === 'text') {
      ruleModeAutoFallback.value = false
      ruleEditorMode.value = 'tree'
    }
  }, { immediate: true })

  function handleRuleEditorModeChange(value: string | number | boolean): void {
    if (value !== 'tree' && value !== 'text') return
    ruleModeAutoFallback.value = false
    ruleEditorMode.value = value
  }

  return {
    ruleEditorMode,
    ruleTreeEditorAvailable,
    handleRuleEditorModeChange,
  }
}
