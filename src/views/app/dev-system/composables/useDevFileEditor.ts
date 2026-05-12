import { computed, watch, type Ref } from 'vue'
import type { PageConfigFileName } from '@spark-view/spark-page-config'
import type { DevState } from '../useDevState'

/**
 * 手动编辑器绑定器 — 将任意 PageConfigFileName 接入 state.documents 注册表。
 * 输入阶段先写入 state 级草稿；只有 blur/change/save/undo/redo/切换时才提交到文档历史。
 */
export function useDevFileEditor(state: DevState, activeFile: Readonly<Ref<PageConfigFileName>>) {
  const doc = computed(() => state.documents[activeFile.value])

  const isReady = computed(() => {
    void state.pageFilesRevision.value
    return doc.value.loadState.value === 'loaded'
  })
  const hasDraftChanges = computed(() => state.hasPageFileDraft(activeFile.value))
  const isDirty = computed(() => hasDraftChanges.value || state.isDocumentDirty(activeFile.value))
  const canUndo = computed(() => {
    void state.pageFilesRevision.value
    return hasDraftChanges.value || doc.value.canUndo.value
  })
  const canRedo = computed(() => {
    void state.pageFilesRevision.value
    return doc.value.canRedo.value
  })
  const text = computed(() => {
    void state.pageFilesRevision.value
    return state.getPageFileDraftText(activeFile.value) ?? doc.value.text.value
  })
  const parseError = computed(() => {
    void state.pageFilesRevision.value
    return doc.value.parseError.value
  })

  async function ensureLoaded(options?: { forceReload?: boolean }) {
    if (!state.activePageId.value) return
    await state.ensureActivePageFilesLoaded(options)
  }

  function updateDraftText(value: string) {
    state.setPageFileDraftText(activeFile.value, value)
  }

  function updateText(value: string) {
    updateDraftText(value)
  }

  function commitText(value?: string | number) {
    if (value !== undefined) {
      updateDraftText(String(value))
    }
    flushPendingText()
  }

  function flushPendingText() {
    state.flushPageFileDraft(activeFile.value)
  }

  function discardInvalidDraft(): boolean {
    if (!doc.value.parseError.value) return false
    state.clearPageFileDraft(activeFile.value)
    doc.value.setText(doc.value.text.value)
    return true
  }

  function undo() {
    flushPendingText()
    if (discardInvalidDraft()) return
    doc.value.undo()
    state.clearPageFileDraft(activeFile.value)
  }

  function redo() {
    flushPendingText()
    if (discardInvalidDraft()) return
    doc.value.redo()
    state.clearPageFileDraft(activeFile.value)
  }

  async function save() {
    flushPendingText()
    await state.savePageFile(activeFile.value)
  }

  async function refresh() {
    state.clearPageFileDraft(activeFile.value)
    await ensureLoaded({ forceReload: true })
  }

  watch(
    activeFile,
    (_nextFile, previousFile) => {
      state.flushPageFileDraft(previousFile)
    },
  )

  watch(
    () => state.activePageId.value,
    (pageId, previousPageId) => {
      if (!pageId) return
      // immediate=true 触发时 previousPageId 为 undefined：不能视作"页面变化"，
      // 否则切换 tab 时（DevFileEditor 由 v-if 重新挂载）会强制 reload，
      // 把内存中已编辑但未保存的 model（含拖拽布局）擦回远端原始内容。
      const isPageSwitch = previousPageId !== undefined && pageId !== previousPageId
      void ensureLoaded({ forceReload: isPageSwitch })
    },
    { immediate: true },
  )

  return {
    isReady,
    isDirty,
    canUndo,
    canRedo,
    text,
    parseError,
    ensureLoaded,
    updateDraftText,
    updateText,
    commitText,
    flushPendingText,
    undo,
    redo,
    save,
    refresh,
  }
}
