import { onUnmounted, shallowRef } from 'vue'
import type { ShallowRef } from 'vue'
import {
  createPageModelSessionHost,
  type SessionBackend,
  type EditToolHost,
  type PageModelSessionHostRuntime,
  type PageModelStillsSession,
} from '@spark-view/spark-ai'
import { createAuthHeaders } from '@/services/http'

interface UsePageModelSessionHostOptions {
  getEditToolHost: () => EditToolHost
  getSessionKey: () => string
}

export interface PageModelSessionHost extends PageModelSessionHostRuntime {
  backend: SessionBackend
  session: ShallowRef<PageModelStillsSession | null>
}

export function usePageModelSessionHost(options: UsePageModelSessionHostOptions) {
  const { getEditToolHost, getSessionKey } = options

  const controller = createPageModelSessionHost({
    getEditToolHost,
    getSessionKey,
    getHeaders: createAuthHeaders,
  })
  const session = shallowRef<PageModelStillsSession | null>(controller.getSession())
  const unsubscribe = controller.subscribe((state) => {
    session.value = state.session
  })

  onUnmounted(() => {
    unsubscribe()
  })

  return {
    backend: controller.backend,
    session,
    ensureSession: controller.ensureSession,
    reset: controller.reset,
    resetSync: controller.resetSync,
    setBackendSessionId: controller.setBackendSessionId,
    getResumeSessionOptions: controller.getResumeSessionOptions,
    hasSessionMismatch: controller.hasSessionMismatch,
  } satisfies PageModelSessionHost
}
