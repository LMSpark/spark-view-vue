/**
 * useDevSystem — DevSystem 单入口编排器。
 *
 * 设计意图：
 *  - 消费层（DevSystem.vue）只需 `const dev = useDevSystem()` 一次 use。
 *  - 内部统一编排：路由能力、dev 全局状态、AI 会话配置、工作区 Tab 状态。
 *  - UI 相关 watch（选中节点/页面切换联动 workTab）内聚在这里，
 *    消费层不再持有 workTab / previewRefreshToken / aiPanelActiveFile 等中间 ref。
 */
import { computed, onScopeDispose, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useAiPanelStore } from '@spark-view/spark-component'
import { useTenantRouter } from '@/composables/useTenantRouter'
import { PAGE_FILE_NAMES, useDevState, type DevWorkspaceTab, type PageFileName } from './useDevState'
import { useDevPageModelSession } from './page-model-session'
import { onPageConfigChange } from '@/services/sse-events'

function isPageFileName(value: string): value is PageFileName {
  return PAGE_FILE_NAMES.includes(value as PageFileName)
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : JSON.stringify(error)
}

export function useDevSystem() {
  const { router, tenantPath } = useTenantRouter()
  const state = useDevState()

  // ─── 工作区 Tab 状态 ───────────────────────────────────
  const workTab = ref<DevWorkspaceTab>('props')
  const previewRefreshToken = ref(0)
  const lastPageFile = ref<PageFileName>('rule.json')

  const currentWorkspaceFile = computed<PageFileName | null>(() =>
    isPageFileName(workTab.value) ? workTab.value : null,
  )

  // AI 面板的 activeFile：在页面文件页签跟随 workTab；切到 preview/props 时
  // 沿用最近一次的页面文件，避免 AI 上下文回落占位。
  const aiPanelActiveFile = computed<PageFileName | null>(() => {
    if (currentWorkspaceFile.value) return currentWorkspaceFile.value
    return state.activePageId.value ? lastPageFile.value : null
  })

  watch(currentWorkspaceFile, (file) => {
    if (file) lastPageFile.value = file
  })

  // ─── AI 会话（页面模型级编辑）─────────────────────────
  const ai = useDevPageModelSession({ state, activeFile: aiPanelActiveFile })
  const aiPanelStore = useAiPanelStore()

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
    if (!state.hasAnyDirty.value) return
    void state.saveAll()
  }

  function isWorkspaceTabDirty(name: PageFileName): boolean {
    return state.isDocumentDirty(name)
  }

  // ─── AI 事件 → 状态栏 / 消息投影 ───────────────────────
  // 直接订阅 AI 核心层事件，不再经 AiLauncherButton 中继。
  const stopAiListeners = [
    aiPanelStore.on('tool:call', (payload) => {
      state.addStatus(`AI 调用工具 [${payload.toolName}] · 第 ${payload.round} 轮`, 'success')
    }),
    aiPanelStore.on('tool:error', (payload) => {
      state.addStatus(`AI 工具 [${payload.toolName}] 失败：${describeError(payload.error)}`, 'error')
    }),
    aiPanelStore.on('fc:round:end', (payload) => {
      state.addStatus(`模型级编辑完成（${payload.round} 轮 · ${payload.calls} 次写入），请保存全部以持久化`, 'success')
    }),
    aiPanelStore.on('message:error', (payload) => {
      ElMessage.error(`AI 消息失败：${describeError(payload.error)}`)
    }),
    aiPanelStore.on('snapshot:restore', (payload) => {
      if (payload.size > 0) {
        state.addStatus(`AI 会话已恢复 ${payload.size} 条历史（${payload.storageKey}）`, 'success')
      }
    }),
  ]
  onScopeDispose(() => {
    for (const stop of stopAiListeners) stop()
  })

  return {
    state,
    ai,
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
