/**
 * useDevSystem — DevSystem 单入口编排器。
 *
 * 设计意图：
 *  - 消费层（DevSystem.vue）只需 `const dev = useDevSystem()` 一次 use。
 *  - 内部统一编排：路由能力、dev 全局状态、工作区 Tab 状态。
 *  - UI 相关 watch（选中节点/页面切换联动 workTab）内聚在这里，
 *    消费层不再持有 workTab / previewRefreshToken 等中间 ref。
 */
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useTenantRouter } from '@/composables/useTenantRouter'
import { useDevState, type DevWorkspaceTab, type PageConfigFileName } from './useDevState'
import { onPageConfigChange } from '@/services/sse-events'

export function useDevSystem() {
  const { router, tenantPath } = useTenantRouter()
  const state = useDevState()
  const isPageFileName = (value: string): value is PageConfigFileName =>
    state.pageFileNames.some((name) => name === value)

  // ─── 工作区 Tab 状态 ───────────────────────────────────
  const workTab = ref<DevWorkspaceTab>('props')
  const previewRefreshToken = ref(0)
  const pageDesignAiPrompt = ref('')

  const currentWorkspaceFile = computed<PageConfigFileName | null>(() =>
    isPageFileName(workTab.value) ? workTab.value : null,
  )

  const stopPageConfigChange = onPageConfigChange((event) => {
    if (event.pageId !== state.activePageId.value) return
    const file = event.file
    state.notifyPageFileChanged(
      event.pageId,
      isPageFileName(file) ? file : '__bulk',
    )
  })
  onScopeDispose(stopPageConfigChange)

  // ─── 派生能力 ──────────────────────────────────────────
  const canPreviewCurrentPage = computed(
    () => Boolean(state.navDraft.path || state.activePageId.value),
  )
  const canSaveCleanNode = computed(() => {
    if (workTab.value !== 'props') return false
    const node = state.selectedNode.value
    return Boolean(node) && !state.isSystemRootDirectory(node)
  })
  const canSaveFromHeader = computed(() => state.hasAnyDirty.value || canSaveCleanNode.value)
  const headerSaveLabel = computed(() => state.hasAnyDirty.value ? '全部保存' : '保存')
  const canRunPageDesignAi = computed(() =>
    Boolean(state.activePageId.value),
  )

  // 选中节点时自动切到节点属性页签
  watch(() => state.selectedNode.value?.id ?? '', (nextId, prevId) => {
    if (nextId && nextId !== prevId) {
      workTab.value = 'props'
    }
  })

  // activePageId 切换时的默认页签联动
  watch(() => state.activePageId.value, (nextPageId) => {
    const hasSelectedNode = state.selectedNode.value !== null
    if (nextPageId && !hasSelectedNode) {
      workTab.value = 'rule.json'
      return
    }
    if (!nextPageId && hasSelectedNode) {
      workTab.value = 'props'
    }
  })

  // ─── 动作方法 ──────────────────────────────────────────
  function previewPage(pageId: string) {
    void router.push(tenantPath(`/${pageId}`))
  }

  function switchToPreview() {
    if (!canPreviewCurrentPage.value) return
    workTab.value = 'preview'
    previewRefreshToken.value++
  }

  function saveAll() {
    void state.saveAll()
  }

  async function runPageDesignAi() {
    if (!canRunPageDesignAi.value) return
    const userRequirement = pageDesignAiPrompt.value.trim()
    await state.runPageDesignAi({ userRequirement })
  }

  function isWorkspaceTabDirty(name: PageConfigFileName): boolean {
    return state.isDocumentDirty(name)
  }

  return {
    state,
    workTab,
    previewRefreshToken,
    currentWorkspaceFile,
    pageDesignAiPrompt,
    canPreviewCurrentPage,
    canSaveFromHeader,
    canRunPageDesignAi,
    headerSaveLabel,
    previewPage,
    switchToPreview,
    saveAll,
    runPageDesignAi,
    isWorkspaceTabDirty,
  }
}

export type DevSystemCtx = ReturnType<typeof useDevSystem>
