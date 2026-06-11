/**
 * @module app:views/app/dev-system/composables/useDevFileEditor
 * app 的 views/app/dev-system/composables/useDevFileEditor 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
import { computed, watch, type Ref } from 'vue'
import type { DevState } from '../useDevState'
import type { PageNodeFileName } from '@spark-appworks/spark-project-model'

/** 页面内容页签绑定 — 内存读写经 ProjectModel，加载/保存经 ProjectWorkspace。 */
export function useDevFileEditor(state: DevState, activeFile: Readonly<Ref<PageNodeFileName>>) {
  const editor = state.editor
  const project = state.project

  function alignActivePage(): boolean {
    const pageId = state.activePageId.value.trim()
    if (!pageId) return false
    if (project.getActivePage()?.pageId !== pageId) {
      project.setActivePage(pageId)
    }
    return true
  }

  const isReady = computed(() => {
    void state.projectRevision.value
    return project.isActivePageLoaded()
  })
  const isDirty = computed(() => isFileDirty(activeFile.value))
  const canUndo = computed(() => {
    void state.projectRevision.value
    return project.canUndoPageFile(activeFile.value)
  })
  const canRedo = computed(() => {
    void state.projectRevision.value
    return project.canRedoPageFile(activeFile.value)
  })
  const text = computed(() => {
    void state.projectRevision.value
    return project.readPageFileText(activeFile.value)
  })

  async function ensureLoaded(options?: { forceReload?: boolean }) {
    if (!state.activePageId.value) return
    if (options?.forceReload !== true && project.isActivePageLoaded()) return
    if (!alignActivePage()) return
    const loadOptions: { forceReload?: boolean } = {}
    if (options?.forceReload === true) loadOptions.forceReload = true
    await editor.ensureActivePageFilesLoaded(loadOptions)
  }

  function isFileDirty(name: PageNodeFileName): boolean {
    void state.projectRevision.value
    return project.readDirtyProjection().dirtyFiles.has(name)
  }

  async function save() {
    const pageId = state.activePageId.value
    if (!pageId || !alignActivePage()) return

    state.pageIoBusy.value = true
    try {
      await editor.savePageFile(activeFile.value)
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
