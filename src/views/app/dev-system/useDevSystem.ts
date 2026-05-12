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
import { PAGE_CONFIG_FILE_NAMES, type PageConfigFileName } from '@spark-view/spark-page-config'
import { onPageConfigChange } from '@spark-view/spark-page-config/services'
import { useTenantRouter } from '@/composables/useTenantRouter'
import { useDevState, type DevWorkspaceTab } from './useDevState'

function isPageConfigFileName(value: string): value is PageConfigFileName {
  return PAGE_CONFIG_FILE_NAMES.includes(value as PageConfigFileName)
}

export function useDevSystem() {
  const { router, tenantPath } = useTenantRouter()
  const state = useDevState()

  // ─── 工作区 Tab 状态 ───────────────────────────────────
  const workTab = ref<DevWorkspaceTab>('props')
  const previewRefreshToken = ref(0)

  const currentWorkspaceFile = computed<PageConfigFileName | null>(() =>
    isPageConfigFileName(workTab.value) ? workTab.value : null,
  )

  const stopPageConfigChange = onPageConfigChange((event) => {
    if (event.pageId !== state.activePageId.value) return
    const file = event.file
    state.notifyPageFileChanged(
      event.pageId,
      isPageConfigFileName(file) ? file : '__bulk',
    )
  })
  onScopeDispose(stopPageConfigChange)

  // ─── 派生能力 ──────────────────────────────────────────
  const canPreviewCurrentPage = computed(
    () => Boolean(state.editForm.path || state.activePageId.value),
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

  watch(() => state.pageFilesRevision.value, () => {
    if (workTab.value === 'preview') {
      previewRefreshToken.value++
    }
  })

  // ─── 动作方法 ──────────────────────────────────────────
  function previewPage(pageId: string) {
    void router.push(tenantPath(`/${pageId}`))
  }

  function switchToPreview() {
    if (!canPreviewCurrentPage.value) return
    state.flushAllPageFileDrafts()
    workTab.value = 'preview'
    previewRefreshToken.value++
  }

  function saveAll() {
    if (!state.hasAnyDirty.value) return
    state.flushAllPageFileDrafts()
    void state.saveAll()
  }

  function isWorkspaceTabDirty(name: PageConfigFileName): boolean {
    return state.isDocumentDirty(name)
  }

  return {
    state,
    workTab,
    previewRefreshToken,
    currentWorkspaceFile,
    canPreviewCurrentPage,
    previewPage,
    switchToPreview,
    saveAll,
    isWorkspaceTabDirty,
  }
}

export type DevSystemCtx = ReturnType<typeof useDevSystem>
