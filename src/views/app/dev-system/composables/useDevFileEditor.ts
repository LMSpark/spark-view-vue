import { computed, watch, type Ref } from 'vue'
import type { DevState, PageFileName } from '../useDevState'

export function useDevFileEditor(state: DevState, activeFile: Readonly<Ref<PageFileName>>) {
  const isReady = computed(() => state.fileLoadState[activeFile.value] === 'loaded')
  const snapshotCount = computed(() => state.getFileSnapshotCount(activeFile.value))
  const isDirty = computed(() => state.fileDirty[activeFile.value])
  const canUndo = computed(() => state.canFileHistoryBack(activeFile.value))
  const canRedo = computed(() => state.canFileHistoryForward(activeFile.value))

  async function ensureLoaded(options?: { forceReload?: boolean }) {
    if (!state.activePageId.value) {
      return
    }

    await state.loadPageFile(activeFile.value, options)
  }

  function updateText(value: string) {
    state.updatePageFile(activeFile.value, value)
  }

  function updateDocument(value: Record<string, unknown>) {
    state.updatePageDataDocument(value)
  }

  function undo() {
    state.undoFileSnapshot(activeFile.value)
  }

  function redo() {
    state.redoFileSnapshot(activeFile.value)
  }

  async function save() {
    await state.savePageFile(activeFile.value)
  }

  async function refresh() {
    await ensureLoaded({ forceReload: true })
  }

  watch(
    [() => state.activePageId.value, activeFile],
    ([pageId], [previousPageId]) => {
      if (!pageId) {
        return
      }

      void ensureLoaded({ forceReload: pageId !== previousPageId })
    },
    { immediate: true },
  )

  watch(
    () => state.fileReloadToken[activeFile.value],
    (nextToken, previousToken) => {
      if (nextToken === previousToken || !state.activePageId.value) {
        return
      }

      void ensureLoaded({ forceReload: true })
    },
  )

  return {
    isReady,
    snapshotCount,
    isDirty,
    canUndo,
    canRedo,
    ensureLoaded,
    updateText,
    updateDocument,
    undo,
    redo,
    save,
    refresh,
  }
}