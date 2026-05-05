import { onUnmounted, shallowRef } from 'vue'
import type { ShallowRef } from 'vue'
import {
  createPageModelSessionHost,
  type SessionBackend,
  type EditToolHost,
  type PageModelSessionHostRuntime,
  type PageModelFunctionContext,
} from '@spark-view/spark-ai'
import { createAuthHeaders } from '@/services/http'

interface UsePageModelSessionHostOptions {
  getEditToolHost: () => EditToolHost
  getSessionKey: () => string
}

export interface PageModelSessionHost extends PageModelSessionHostRuntime {
  backend: SessionBackend
  context: ShallowRef<PageModelFunctionContext | null>
}

export function usePageModelSessionHost(options: UsePageModelSessionHostOptions) {
  const { getEditToolHost, getSessionKey } = options

  const controller = createPageModelSessionHost({
    getEditToolHost,
    getSessionKey,
    getHeaders: createAuthHeaders,
  })
  const context = shallowRef<PageModelFunctionContext | null>(controller.getContext())
  const unsubscribe = controller.subscribe((state) => {
    context.value = state.context
  })

  onUnmounted(() => {
    unsubscribe()
  })

  return {
    backend: controller.backend,
    context,
    ensureSession: controller.ensureSession,
    reset: controller.reset,
    resetSync: controller.resetSync,
    setBackendSessionId: controller.setBackendSessionId,
    getResumeSessionOptions: controller.getResumeSessionOptions,
    hasSessionMismatch: controller.hasSessionMismatch,
  } satisfies PageModelSessionHost
}
