import { ref, onMounted, onUnmounted, onActivated, onDeactivated } from 'vue'
import type { Ref } from 'vue'

interface FloatingPanelOwnerResult {
  isOwner: Ref<boolean>
}

function asGlobalWindow(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null
  return window as unknown as Record<string, unknown>
}

export function useFloatingPanelOwner(ownerKey: string): FloatingPanelOwnerResult {
  const panelInstanceId = `${ownerKey}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const isOwner = ref(false)

  function claimPanelOwnership(): void {
    const globalWindow = asGlobalWindow()
    if (globalWindow === null) return
    globalWindow[ownerKey] = panelInstanceId
    isOwner.value = true
  }

  function releasePanelOwnership(): void {
    const globalWindow = asGlobalWindow()
    if (globalWindow === null) return
    if (globalWindow[ownerKey] === panelInstanceId) {
      globalWindow[ownerKey] = null
    }
    isOwner.value = false
  }

  onMounted(() => {
    claimPanelOwnership()
  })

  onActivated(() => {
    claimPanelOwnership()
  })

  onDeactivated(() => {
    releasePanelOwnership()
  })

  onUnmounted(() => {
    releasePanelOwnership()
  })

  return { isOwner }
}
