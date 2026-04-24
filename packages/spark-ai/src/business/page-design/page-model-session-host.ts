import { SessionBackendImpl } from '../../core/session/session-backend'
import type { SessionBackend } from '../../core/session/session-contracts'
import type { IStillSession } from '../../core/stills/types'
import {
  bindLiveModelAdapter,
  clearDomains,
  clearRegistry,
  createSession as createStillSession,
  getEditState,
  registerEditStills,
  type EditToolHost,
} from '../../stills'

export type PageModelStillsSession = IStillSession

export interface PageModelSessionHostRuntime {
  backend: SessionBackend
  ensureSession: () => { session: PageModelStillsSession; bootstrapped: boolean }
  reset: () => Promise<void>
  resetSync: () => void
  setBackendSessionId: (sessionId: string | null) => void
  getResumeSessionOptions: () => { resumeSessionId?: string }
  hasSessionMismatch: (sessionKey?: string) => boolean
}

export interface PageModelSessionHostState {
  session: PageModelStillsSession | null
  sessionKey: string
  backendSessionId: string | null
}

export interface PageModelSessionHostController extends PageModelSessionHostRuntime {
  getSession: () => PageModelStillsSession | null
  getState: () => Readonly<PageModelSessionHostState>
  subscribe: (listener: (state: Readonly<PageModelSessionHostState>) => void) => () => void
}

export interface CreatePageModelSessionHostOptions {
  getEditToolHost: () => EditToolHost
  getSessionKey: () => string
  baseUrl?: string
  getHeaders?: () => Record<string, string>
  backend?: SessionBackend
}

export function createPageModelSessionBackend(
  baseUrl = '/api/ai/sessions',
  options: ConstructorParameters<typeof SessionBackendImpl>[1] = {},
): SessionBackend {
  return new SessionBackendImpl(baseUrl, options)
}

export function createPageModelSessionHost(
  options: CreatePageModelSessionHostOptions,
): PageModelSessionHostController {
  const { getEditToolHost, getSessionKey } = options
  const backend = options.backend
    ?? createPageModelSessionBackend(options.baseUrl, options.getHeaders ? { getHeaders: options.getHeaders } : {})

  let state: PageModelSessionHostState = {
    session: null,
    sessionKey: '',
    backendSessionId: null,
  }
  const listeners = new Set<(state: Readonly<PageModelSessionHostState>) => void>()

  function notify(): void {
    const snapshot = { ...state }
    for (const listener of listeners) {
      listener(snapshot)
    }
  }

  function setState(nextState: PageModelSessionHostState): void {
    state = nextState
    notify()
  }

  function clearLocalSessionState(): string | null {
    const previousBackendSessionId = state.backendSessionId
    setState({
      session: null,
      sessionKey: '',
      backendSessionId: null,
    })
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

  function ensureSession(): { session: PageModelStillsSession; bootstrapped: boolean } {
    const nextSessionKey = getSessionKey()
    if (state.session && state.sessionKey === nextSessionKey) {
      return { session: state.session, bootstrapped: false }
    }

    const previousBackendSessionId = clearLocalSessionState()
    disposeBackendSession(previousBackendSessionId)

    clearRegistry()
    clearDomains()
    registerEditStills()

    const nextSession = createStillSession()
    const editState = getEditState(nextSession)
    bindLiveModelAdapter(editState, getEditToolHost())

    setState({
      session: nextSession,
      sessionKey: nextSessionKey,
      backendSessionId: null,
    })
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

  function setBackendSessionId(sessionId: string | null): void {
    setState({
      ...state,
      backendSessionId: sessionId,
    })
  }

  function getResumeSessionOptions(): { resumeSessionId?: string } {
    return state.backendSessionId ? { resumeSessionId: state.backendSessionId } : {}
  }

  function hasSessionMismatch(nextSessionKey?: string): boolean {
    return state.sessionKey !== '' && state.sessionKey !== (nextSessionKey ?? getSessionKey())
  }

  function subscribe(listener: (currentState: Readonly<PageModelSessionHostState>) => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return {
    backend,
    getSession: () => state.session,
    getState: () => state,
    subscribe,
    ensureSession,
    reset,
    resetSync,
    setBackendSessionId,
    getResumeSessionOptions,
    hasSessionMismatch,
  }
}