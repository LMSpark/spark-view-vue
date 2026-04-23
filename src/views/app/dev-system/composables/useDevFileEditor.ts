import { computed, watch, type Ref } from 'vue'
import type { DevState, PageFileName } from '../useDevState'

/**
 * 手动编辑器绑定器 — 将任意 PageFileName 接入 state.documents 注册表。
 * 所有读写/undo/redo 都经由对应的 PageFileDocument，和 AI 编辑共享同一模型与历史。
 */
export function useDevFileEditor(state: DevState, activeFile: Readonly<Ref<PageFileName>>) {
  const doc = computed(() => state.documents[activeFile.value])

  const isReady = computed(() => doc.value.loadState.value === 'loaded')
  const isDirty = computed(() => doc.value.isDirty.value)
  const canUndo = computed(() => doc.value.canUndo.value)
  const canRedo = computed(() => doc.value.canRedo.value)
  const text = computed(() => doc.value.text.value)
  const parseError = computed(() => doc.value.parseError.value)

  async function ensureLoaded(options?: { forceReload?: boolean }) {
    if (!state.activePageId.value) return
    await state.ensureActivePageFilesLoaded(options)
  }

  function updateText(value: string) {
    doc.value.setText(value)
  }

  function undo() {
    doc.value.undo()
  }

  function redo() {
    doc.value.redo()
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
      // immediate=true 触发时 previousPageId 为 undefined：不能视作"页面变化"，
      // 否则切换 tab 时（DevFileEditor 由 v-if 重新挂载）会强制 reload，
      // 把内存中已编辑但未保存的 model（含拖拽布局、AI 写入等）擦回远端原始内容。
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
    updateText,
    undo,
    redo,
    save,
    refresh,
  }
}
