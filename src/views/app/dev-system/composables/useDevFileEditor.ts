import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import type { DevState, PageConfigFileName } from '../useDevState'

const TEXT_DRAFT_COMMIT_DELAY = 600

/**
 * 手动编辑器绑定器 — 将任意 PageConfigFileName 接入 PageEditor adapter。
 * PageEditor 的文件历史栈只记录已提交编辑，用于 undo/redo；后端版本由版本面板手动管理。
 * 原始文本输入先进入本地草稿，避免 JSON 在每个按键都解析、归一化并压入历史栈。
 */
export function useDevFileEditor(state: DevState, activeFile: Readonly<Ref<PageConfigFileName>>) {
  const drafts = ref<Partial<Record<PageConfigFileName, string>>>({})
  let commitTimer: ReturnType<typeof setTimeout> | null = null

  const isReady = computed(() => {
    void state.pageFilesRevision.value
    return state.getPageFileLoadState(activeFile.value) === 'loaded'
  })
  const isDirty = computed(() => isFileDirty(activeFile.value))
  const canUndo = computed(() => {
    void state.pageFilesRevision.value
    return hasDraft(activeFile.value) || state.canUndoPageFile(activeFile.value)
  })
  const canRedo = computed(() => {
    void state.pageFilesRevision.value
    if (hasDraft(activeFile.value)) return false
    return state.canRedoPageFile(activeFile.value)
  })
  const text = computed(() => {
    void state.pageFilesRevision.value
    return getDisplayText(activeFile.value)
  })
  const parseError = computed(() => {
    void state.pageFilesRevision.value
    return state.getPageFileParseError(activeFile.value)
  })

  async function ensureLoaded(options?: { forceReload?: boolean }) {
    if (!state.activePageId.value) return
    await state.ensureActivePageFilesLoaded(options)
  }

  function hasDraft(name: PageConfigFileName): boolean {
    return Object.prototype.hasOwnProperty.call(drafts.value, name)
  }

  function getDraft(name: PageConfigFileName): string {
    return drafts.value[name] ?? ''
  }

  function setDraft(name: PageConfigFileName, value: string): void {
    drafts.value = { ...drafts.value, [name]: value }
  }

  function clearDraft(name: PageConfigFileName = activeFile.value): void {
    if (!hasDraft(name)) return
    const { [name]: _removed, ...next } = drafts.value
    drafts.value = next
  }

  function clearAllDrafts(): void {
    drafts.value = {}
  }

  function getDisplayText(name: PageConfigFileName): string {
    return hasDraft(name) ? getDraft(name) : state.getPageFileText(name)
  }

  function isJsonBackedFile(name: PageConfigFileName): boolean {
    return name === 'rule.json' || name === 'pagedata.json'
  }

  function isFileDirty(name: PageConfigFileName): boolean {
    return state.isDocumentDirty(name) || getDisplayText(name) !== state.getPageFileSavedText(name)
  }

  function clearCommitTimer(): void {
    if (commitTimer === null) return
    clearTimeout(commitTimer)
    commitTimer = null
  }

  function scheduleDraftCommit(name: PageConfigFileName): void {
    clearCommitTimer()
    if (isJsonBackedFile(name)) return
    commitTimer = setTimeout(() => {
      commitTimer = null
      void commitDraft(name)
    }, TEXT_DRAFT_COMMIT_DELAY)
  }

  function updateText(value: string) {
    const name = activeFile.value
    if (value === state.getPageFileText(name)) {
      clearDraft(name)
      return
    }
    setDraft(name, value)
    scheduleDraftCommit(name)
  }

  function commitDraft(name: PageConfigFileName = activeFile.value): boolean {
    clearCommitTimer()
    if (!hasDraft(name)) return true

    const nextText = getDraft(name)
    if (nextText === state.getPageFileText(name)) {
      clearDraft(name)
      return state.getPageFileParseError(name) === null
    }

    state.setPageFileText(name, nextText)
    if (state.getPageFileParseError(name) !== null) {
      setDraft(name, nextText)
      return false
    }

    clearDraft(name)
    return true
  }

  function commitText(value?: string | number): boolean {
    if (value !== undefined) {
      setDraft(activeFile.value, String(value))
    }
    return commitDraft(activeFile.value)
  }

  function undo() {
    clearCommitTimer()
    if (hasDraft(activeFile.value)) {
      clearDraft(activeFile.value)
      return
    }
    state.undoPageFile(activeFile.value)
  }

  function redo() {
    clearCommitTimer()
    if (hasDraft(activeFile.value)) return
    state.redoPageFile(activeFile.value)
  }

  async function save() {
    if (!commitDraft(activeFile.value)) return
    await state.savePageFile(activeFile.value)
  }

  async function refresh() {
    clearDraft(activeFile.value)
    await ensureLoaded({ forceReload: true })
  }

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

  watch(
    () => state.activePageId.value,
    () => {
      clearCommitTimer()
      clearAllDrafts()
    },
  )

  watch(activeFile, (_nextFile, previousFile) => {
    void commitDraft(previousFile)
  })

  onBeforeUnmount(() => {
    clearCommitTimer()
  })

  return {
    isReady,
    isDirty,
    canUndo,
    canRedo,
    text,
    parseError,
    ensureLoaded,
    updateText,
    commitText,
    commitDraft,
    clearDraft,
    isFileDirty,
    undo,
    redo,
    save,
    refresh,
  }
}
