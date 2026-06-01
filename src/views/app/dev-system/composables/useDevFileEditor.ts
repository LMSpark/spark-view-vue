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
    if (options?.forceReload !== true && state.getActivePage()?.isLoaded === true) return
    await state.ensureActivePageFilesLoaded(options)
  }

  function isFileDirty(name: PageNodeFileName): boolean {
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

function subModelKey(name: PageNodeFileName): 'rule' | 'dataSet' | 'style' | 'script' {
  switch (name) {
    case 'rule.json': return 'rule'
    case 'pagedata.json': return 'dataSet'
    case 'script.js': return 'script'
    case 'style.css': return 'style'
  }
}
