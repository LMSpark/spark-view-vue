import { computed, watch, type Ref } from 'vue'
import type { DevState, PageConfigFileName } from '../useDevState'

/**
 * 文件编辑器绑定器 — 将任意 PageConfigFileName 接入 PageEditor adapter。
 *
 * 四文件文本页签只做只读投影展示；结构化编辑器（JsonTreeEditor / DevDataSetDesigner）
 * 直接操作 page.rule / page.dataSet 子模型。
 */
export function useDevFileEditor(state: DevState, activeFile: Readonly<Ref<PageConfigFileName>>) {
  const isReady = computed(() => {
    void state.pageFilesRevision.value
    return state.getActivePage()?.isLoaded === true
  })
  const isDirty = computed(() => isFileDirty(activeFile.value))
  const canUndo = computed(() => {
    void state.pageFilesRevision.value
    return state.getActivePage()?.[subModelKey(activeFile.value)]?.canUndo ?? false
  })
  const canRedo = computed(() => {
    void state.pageFilesRevision.value
    return state.getActivePage()?.[subModelKey(activeFile.value)]?.canRedo ?? false
  })
  const text = computed(() => {
    void state.pageFilesRevision.value
    return state.getPageFileText(activeFile.value)
  })

  async function ensureLoaded(options?: { forceReload?: boolean }) {
    if (!state.activePageId.value) return
    await state.ensureActivePageFilesLoaded(options)
  }

  function isFileDirty(name: PageConfigFileName): boolean {
    return state.isDocumentDirty(name)
  }

  async function save() {
    await state.savePageFile(activeFile.value)
  }

  async function refresh() {
    await ensureLoaded({ forceReload: true })
  }

  watch(
    () => state.activePageId.value,
    (pageId, previousPageId) => {
      if (!pageId) return
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
    ensureLoaded,
    isFileDirty,
    save,
    refresh,
  }
}

function subModelKey(name: PageConfigFileName): 'rule' | 'dataSet' | 'style' | 'script' {
  switch (name) {
    case 'rule.json': return 'rule'
    case 'pagedata.json': return 'dataSet'
    case 'script.js': return 'script'
    case 'style.css': return 'style'
  }
}
