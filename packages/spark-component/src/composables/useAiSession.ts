/**
 * useAiSession — 把标准 AiSessionConfig 绑定到全局 AI 面板的基础 composable。
 *
 * 使用模式：
 *   const ai = useAiSession(config)
 *   <el-button @click="ai.toggle" :type="ai.isActive.value ? 'primary' : ''">AI</el-button>
 *
 * 职责：
 *  - 暴露 `isActive`：当前面板是否正由本 config 驱动。
 *  - 暴露 `open/close/toggle`：绑定到任意宿主组件的 click / 快捷键 / 自定义事件。
 *  - 组件卸载时自动 `disposeIf(config)`，防止闭包悬挂。
 *
 * 业务层不需要再写额外的 lifecycle/状态同步代码。
 */
import { computed, onBeforeUnmount, onScopeDispose } from 'vue'
import { useAiPanelStore, type AiSessionConfig } from './useAiPanelStore'

export function useAiSession(config: AiSessionConfig) {
  const store = useAiPanelStore()

  const isActive = computed(() =>
    store.visible.value && store.getCurrentConfig() === config,
  )

  async function open(): Promise<void> {
    await store.open(config)
  }

  function close(): void {
    if (store.getCurrentConfig() === config) store.close()
  }

  async function toggle(): Promise<void> {
    if (isActive.value) {
      store.close()
      return
    }
    await store.open(config)
  }

  function dispose(): void {
    store.disposeIf(config)
  }

  onBeforeUnmount(dispose)
  onScopeDispose(dispose)

  return { isActive, open, close, toggle, dispose }
}
