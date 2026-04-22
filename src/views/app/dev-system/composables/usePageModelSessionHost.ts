import { shallowRef } from 'vue'
import type { ShallowRef } from 'vue'
import {
  clearRegistry,
  clearDomains,
  registerEditStills,
  createSession as createStillSession,
  executeStill,
  SessionBackendImpl,
} from '@spark-view/spark-ai'
import type { PageEditModel } from '../useDevState'

type StillsSession = ReturnType<typeof createStillSession>

interface UsePageModelSessionHostOptions {
  getContextModel: () => PageEditModel
  bootstrapTag: string
  buildContextSignature?: (model: PageEditModel) => string
}

export interface PageModelSessionHost {
  backend: SessionBackendImpl
  session: ShallowRef<StillsSession | null>
  ensureSession: () => { session: StillsSession; bootstrapped: boolean; model: PageEditModel }
  reset: () => Promise<void>
  resetSync: () => void
  setBackendSessionId: (sessionId: string | null) => void
  getResumeSessionOptions: () => { resumeSessionId?: string }
  syncContext: (model?: PageEditModel) => void
  hasContextMismatch: (model?: PageEditModel) => boolean
}

export function usePageModelSessionHost(options: UsePageModelSessionHostOptions) {
  const { getContextModel, bootstrapTag, buildContextSignature = JSON.stringify } = options

  const backend = new SessionBackendImpl()
  const session = shallowRef<StillsSession | null>(null)
  let backendSessionId: string | null = null
  let contextSignature = ''

  function ensureSession(): { session: StillsSession; bootstrapped: boolean; model: PageEditModel } {
    const model = getContextModel()
    const nextSignature = buildContextSignature(model)
    if (session.value && contextSignature === nextSignature) {
      return { session: session.value, bootstrapped: false, model }
    }

    if (backendSessionId) {
      void backend.destroySession(backendSessionId)
      backendSessionId = null
    }

    clearRegistry()
    clearDomains()
    registerEditStills()

    const nextSession = createStillSession()
    const boot = executeStill('edit.bootstrap', {
      ruleJson: model.ruleJson,
      pageDataJson: model.pageDataJson,
      scriptJs: model.scriptJs,
      styleCss: model.styleCss,
    }, nextSession, bootstrapTag)

    if (!boot.ok) {
      throw new Error(boot.msg)
    }

    session.value = nextSession
    contextSignature = nextSignature
    return { session: nextSession, bootstrapped: true, model }
  }

  async function reset(): Promise<void> {
    const previousBackendSessionId = backendSessionId
    session.value = null
    backendSessionId = null
    contextSignature = ''

    if (previousBackendSessionId) {
      try {
        await backend.destroySession(previousBackendSessionId)
      } catch {
        // ignore destroy failures during context refresh
      }
    }

    clearRegistry()
    clearDomains()
  }

  function resetSync(): void {
    const previousBackendSessionId = backendSessionId
    session.value = null
    backendSessionId = null
    contextSignature = ''

    if (previousBackendSessionId) {
      void backend.destroySession(previousBackendSessionId)
    }

    clearRegistry()
    clearDomains()
  }

  function setBackendSessionId(sessionId: string | null) {
    backendSessionId = sessionId
  }

  function getResumeSessionOptions(): { resumeSessionId?: string } {
    return backendSessionId ? { resumeSessionId: backendSessionId } : {}
  }

  function syncContext(model?: PageEditModel) {
    contextSignature = buildContextSignature(model ?? getContextModel())
  }

  function hasContextMismatch(model?: PageEditModel): boolean {
    const currentModel = model ?? getContextModel()
    return contextSignature !== '' && contextSignature !== buildContextSignature(currentModel)
  }

  return {
    backend,
    session,
    ensureSession,
    reset,
    resetSync,
    setBackendSessionId,
    getResumeSessionOptions,
    syncContext,
    hasContextMismatch,
  } satisfies PageModelSessionHost
}