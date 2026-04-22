import { shallowRef } from 'vue'
import type { ShallowRef } from 'vue'
import {
  bindLiveModelAdapter,
  captureBaselineSnapshot,
  clearRegistry,
  clearDomains,
  registerEditStills,
  createSession as createStillSession,
  getEditState,
  SessionBackendImpl,
  type EditLiveModelAdapter,
} from '@spark-view/spark-ai'

type StillsSession = ReturnType<typeof createStillSession>

interface UsePageModelSessionHostOptions {
  getLiveModelAdapter: () => EditLiveModelAdapter
  getSessionKey: () => string
}

export interface PageModelSessionHost {
  backend: SessionBackendImpl
  session: ShallowRef<StillsSession | null>
  ensureSession: () => { session: StillsSession; bootstrapped: boolean }
  reset: () => Promise<void>
  resetSync: () => void
  setBackendSessionId: (sessionId: string | null) => void
  getResumeSessionOptions: () => { resumeSessionId?: string }
  hasSessionMismatch: (sessionKey?: string) => boolean
}

export function usePageModelSessionHost(options: UsePageModelSessionHostOptions) {
  const { getLiveModelAdapter, getSessionKey } = options

  const backend = new SessionBackendImpl()
  const session = shallowRef<StillsSession | null>(null)
  let backendSessionId: string | null = null
  let sessionKey = ''

  function ensureSession(): { session: StillsSession; bootstrapped: boolean } {
    const nextSessionKey = getSessionKey()
    if (session.value && sessionKey === nextSessionKey) {
      return { session: session.value, bootstrapped: false }
    }

    if (backendSessionId) {
      void backend.destroySession(backendSessionId)
      backendSessionId = null
    }

    clearRegistry()
    clearDomains()
    registerEditStills()

    const nextSession = createStillSession()
    const editState = getEditState(nextSession)
    bindLiveModelAdapter(editState, getLiveModelAdapter())
    captureBaselineSnapshot(editState)

    session.value = nextSession
    sessionKey = nextSessionKey
    return { session: nextSession, bootstrapped: true }
  }

  async function reset(): Promise<void> {
    const previousBackendSessionId = backendSessionId
    session.value = null
    backendSessionId = null
    sessionKey = ''

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
    sessionKey = ''

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

  function hasSessionMismatch(nextSessionKey?: string): boolean {
    return sessionKey !== '' && sessionKey !== (nextSessionKey ?? getSessionKey())
  }

  return {
    backend,
    session,
    ensureSession,
    reset,
    resetSync,
    setBackendSessionId,
    getResumeSessionOptions,
    hasSessionMismatch,
  } satisfies PageModelSessionHost
}