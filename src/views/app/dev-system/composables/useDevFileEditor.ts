import { computed, watch, type Ref } from 'vue'
import type { DevState } from '../useDevState'
import type { PageNodeFileName } from '@spark-appworks/spark-project-model'

/** 页面内容页签绑定 — 只读投影 + 加载/保存，直扑 ProjectEditor。 */
export function useDevFileEditor(state: DevState, activeFile: Readonly<Ref<PageNodeFileName>>) {
  const model = state.editor

  function alignActivePage(): boolean {
    const pageId = state.activePageId.value.trim()
    if (!pageId) return false
    if (model.getActivePage()?.pageId !== pageId) {
      model.setActivePage(pageId)
    }
    return true
  }

  const isReady = computed(() => {
    void state.pageFilesRevision.value
    return model.isActivePageLoaded()
  })
  const isDirty = computed(() => isFileDirty(activeFile.value))
  const canUndo = computed(() => {
    void state.pageFilesRevision.value
    return model.canUndoPageFile(activeFile.value)
  })
  const canRedo = computed(() => {
    void state.pageFilesRevision.value
    return model.canRedoPageFile(activeFile.value)
  })
  const text = computed(() => {
    void state.pageFilesRevision.value
    return model.getPageFileText(activeFile.value)
  })

  async function ensureLoaded(options?: { forceReload?: boolean }) {
    if (!state.activePageId.value) return
    if (options?.forceReload !== true && model.isActivePageLoaded()) return
    if (!alignActivePage()) return
    const loadOptions: { forceReload?: boolean } = {}
    if (options?.forceReload === true) loadOptions.forceReload = true
    await model.ensureActivePageFilesLoaded(loadOptions)
  }

  function isFileDirty(name: PageNodeFileName): boolean {
    void state.pageFilesRevision.value
    return model.readSnapshot().dirtyFiles.has(name)
  }

  async function save() {
    const pageId = state.activePageId.value
    if (!pageId || !alignActivePage()) return

    state.pageIoBusy.value = true
    try {
      await model.savePageFile(activeFile.value)
      state.addStatus(`页面 ${pageId} 已保存 ${activeFile.value}`, 'success')
    } catch (e) {
      state.addStatus(`保存 ${activeFile.value} 失败: ${String(e)}`, 'error')
      throw e
    } finally {
      state.pageIoBusy.value = false
    }
  }

  async function refresh() {
    await ensureLoaded({ forceReload: true })
  }

  watch(
    () => state.activePageId.value,
    (pageId) => {
      if (!pageId) return
      void ensureLoaded()
    },
    { immediate: true },
  )

  return {
    isReady,
    isDirty,
    canUndo,
    canRedo,
    text,
    ensureLoaded,
    isFileDirty,
    save,
    refresh,
  }
}
