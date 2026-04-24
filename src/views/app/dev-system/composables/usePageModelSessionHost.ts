import { shallowRef } from 'vue'
import type { ShallowRef } from 'vue'
import {
  bindLiveModelAdapter,
  clearRegistry,
  clearDomains,
  registerEditStills,
  createSession as createStillSession,
  getEditState,
  createSessionBackend,
  type SessionBackend,
  type EditToolHost,
} from '@spark-view/spark-ai'
import { createAuthHeaders } from '@/services/http'

type StillsSession = ReturnType<typeof createStillSession>

interface UsePageModelSessionHostOptions {
  getEditToolHost: () => EditToolHost
  getSessionKey: () => string
}

export interface PageModelSessionHost {
  backend: SessionBackend
  session: ShallowRef<StillsSession | null>
  ensureSession: () => { session: StillsSession; bootstrapped: boolean }
  reset: () => Promise<void>
  resetSync: () => void
  setBackendSessionId: (sessionId: string | null) => void
  getResumeSessionOptions: () => { resumeSessionId?: string }
  hasSessionMismatch: (sessionKey?: string) => boolean
}

export function usePageModelSessionHost(options: UsePageModelSessionHostOptions) {
  const { getEditToolHost, getSessionKey } = options

  const backend = createSessionBackend('/api/ai/sessions', {
    getHeaders: createAuthHeaders,
  })
  const session = shallowRef<StillsSession | null>(null)
  let backendSessionId: string | null = null
  let sessionKey = ''

  function clearLocalSessionState(): string | null {
    const previousBackendSessionId = backendSessionId
    session.value = null
    backendSessionId = null
    sessionKey = ''
    return previousBackendSessionId
  }

  function disposeBackendSession(previousBackendSessionId: string | null): void {
    if (!previousBackendSessionId) return
    void backend.destroySession(previousBackendSessionId)
  }

  async function disposeBackendSessionSafely(previousBackendSessionId: string | null): Promise<void> {
    if (!previousBackendSessionId) return
    try {
      await backend.destroySession(previousBackendSessionId)
    } catch {
      // ignore destroy failures during context refresh
    }
  }

  function ensureSession(): { session: StillsSession; bootstrapped: boolean } {
    const nextSessionKey = getSessionKey()
    if (session.value && sessionKey === nextSessionKey) {
      return { session: session.value, bootstrapped: false }
    }

    const previousBackendSessionId = clearLocalSessionState()
    disposeBackendSession(previousBackendSessionId)

    clearRegistry()
    clearDomains()
    registerEditStills()

    const nextSession = createStillSession()
    const editState = getEditState(nextSession)
    bindLiveModelAdapter(editState, getEditToolHost())

    session.value = nextSession
    sessionKey = nextSessionKey
    return { session: nextSession, bootstrapped: true }
  }

  async function reset(): Promise<void> {
    const previousBackendSessionId = clearLocalSessionState()
    await disposeBackendSessionSafely(previousBackendSessionId)

    clearRegistry()
    clearDomains()
  }

  function resetSync(): void {
    const previousBackendSessionId = clearLocalSessionState()
    disposeBackendSession(previousBackendSessionId)

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