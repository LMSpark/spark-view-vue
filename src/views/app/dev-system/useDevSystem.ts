/**
 * useDevSystem — DevSystem 单入口编排器。
 *
 * 设计意图：
 *  - 消费层（DevSystem.vue）只需 `const dev = useDevSystem()` 一次 use。
 *  - 内部统一编排：路由能力、dev 全局状态、工作区 Tab 状态。
 *  - UI 相关 watch（选中节点/页面切换联动 workTab）内聚在这里，
 *    消费层不再持有 workTab / previewRefreshToken 等中间 ref。
 */
import { computed, onActivated, onDeactivated, onScopeDispose, ref, watch } from 'vue'
import type { PageDesignEditSession } from '@spark-view/spark-page-config/capabilities/page-edit-session'
import { registerPageDesignEditHost } from '@spark-view/spark-page-config/capabilities/page-design-service'
import { useTenantRouter } from '@/composables/useTenantRouter'
import { SparkNodeTree } from '@spark-view/spark-page-config/page/spark-node-tree'
import { PAGE_FILE_NAMES, useDevState, type DevState, type DevWorkspaceTab, type PageFileName } from './useDevState'
import { onPageConfigChange } from '@/services/sse-events'

function isPageFileName(value: string): value is PageFileName {
  return PAGE_FILE_NAMES.some((name) => name === value)
}

export function useDevSystem() {
  const { router, tenantPath } = useTenantRouter()
  const state = useDevState()
  const pageDesignHostEnabled = ref(true)
  const pageDesignEditHost = createPageDesignEditHost(state)
  const unregisterPageDesignHost = registerPageDesignEditHost(() => {
    if (!pageDesignHostEnabled.value) return null
    const pageId = state.activePageId.value.trim()
    if (pageId === '') return null
    return { pageId, host: pageDesignEditHost }
  })
  onActivated(() => {
    pageDesignHostEnabled.value = true
  })
  onDeactivated(() => {
    pageDesignHostEnabled.value = false
  })
  onScopeDispose(unregisterPageDesignHost)

  // ─── 工作区 Tab 状态 ───────────────────────────────────
  const workTab = ref<DevWorkspaceTab>('props')
  const previewRefreshToken = ref(0)

  const currentWorkspaceFile = computed<PageFileName | null>(() =>
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
    () => Boolean(state.editForm.path || state.activePageId.value),
  )
  const canSaveCleanNode = computed(() => {
    if (workTab.value !== 'props') return false
    const node = state.selectedNode.value
    return Boolean(node) && !state.isSystemRootDirectory(node)
  })
  const canSaveFromHeader = computed(() => state.hasAnyDirty.value || canSaveCleanNode.value)
  const headerSaveLabel = computed(() => state.hasAnyDirty.value ? '全部保存' : '保存')

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
    workTab.value = 'preview'
    previewRefreshToken.value++
  }

  function saveAll() {
    void state.saveAll()
  }

  function isWorkspaceTabDirty(name: PageFileName): boolean {
    return state.isDocumentDirty(name)
  }

  return {
    state,
    workTab,
    previewRefreshToken,
    currentWorkspaceFile,
    canPreviewCurrentPage,
    canSaveFromHeader,
    headerSaveLabel,
    previewPage,
    switchToPreview,
    saveAll,
    isWorkspaceTabDirty,
  }
}

export interface DevSystemCtx extends ReturnType<typeof useDevSystem> {}

function createPageDesignEditHost(state: DevState): PageDesignEditSession.Host {
  return {
    getNodeTree: () => state.documents['rule.json'].model.value,
    onNodeTreeChanged: (nodeTree) => {
      if (!(nodeTree instanceof SparkNodeTree)) {
        throw new Error('PageDesignEditHost.onNodeTreeChanged expected a SparkNodeTree instance')
      }
      state.documents['rule.json'].replaceModel(nodeTree)
    },
    getDataSetTool: () => state.documents['pagedata.json'].model.value,
    onDataSetChanged: (tool) => {
      state.documents['pagedata.json'].replaceModel(tool)
    },
    readScript: () => state.documents['script.js'].text.value,
    writeScript: (content) => {
      state.documents['script.js'].setText(content)
    },
    readStyle: () => state.documents['style.css'].text.value,
    writeStyle: (content) => {
      state.documents['style.css'].setText(content)
    },
  }
}
