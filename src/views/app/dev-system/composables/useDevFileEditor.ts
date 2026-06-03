import { computed, watch, type Ref } from 'vue'
import type { DevState } from '../useDevState'
import type { PageNodeFileName } from '@spark-view/spark-project-model/project'

/**
 * 文件编辑器绑定器 — 将任意 PageNodeFileName 接入 ProjectEditor adapter。
 *
 * 四文件文本页签只做只读投影展示；结构化编辑器（JsonTreeEditor / DevDataSetDesigner）
 * 直接操作 page.rule / page.dataSet 子模型。
 */
export function useDevFileEditor(state: DevState, activeFile: Readonly<Ref<PageNodeFileName>>) {
  const isReady = computed(() => {
    void state.pageFilesRevision.value
    return state.getActivePage()?.isLoaded === true
  })
  const isDirty = computed(() => isFileDirty(activeFile.value))
  const canUndo = computed(() => {
    void state.pageFilesRevision.value
    return canUndoFile(activeFile.value)
  })
  const canRedo = computed(() => {
    void state.pageFilesRevision.value
    return canRedoFile(activeFile.value)
  })
  const text = computed(() => {
    void state.pageFilesRevision.value
    return state.getPageFileText(activeFile.value)
  })

  async function ensureLoaded(options?: { forceReload?: boolean }) {
    if (!state.activePageId.value) return
    if (options?.forceReload !== true && state.getActivePage()?.isLoaded === true) return
    await state.ensureActivePageFilesLoaded(options)
  }

  function isFileDirty(name: PageNodeFileName): boolean {
    return state.isDocumentDirty(name)
  }

  function canUndoFile(name: PageNodeFileName): boolean {
    const page = state.getActivePage()
    if (!page) return false
    switch (name) {
      case 'rule.json': return page.rule.canUndo
      case 'pagedata.json': return page.dataSet.canUndo
      case 'script.js': return page.script.canUndo
      case 'style.css': return page.style.canUndo
    }
  }

  function canRedoFile(name: PageNodeFileName): boolean {
    const page = state.getActivePage()
    if (!page) return false
    switch (name) {
      case 'rule.json': return page.rule.canRedo
      case 'pagedata.json': return page.dataSet.canRedo
      case 'script.js': return page.script.canRedo
      case 'style.css': return page.style.canRedo
    }
  }

  async function save() {
    await state.savePageFile(activeFile.value)
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
