import type {
  AiScenarioMessage,
  AiScenarioSessionKey,
  AiScenarioSessionState,
  AiScenarioSessionStore,
  PageModelFlowState,
} from './contracts'
import { serializePageModelHostKey } from './contracts'
import type { AiScenarioFunctionCallResult } from '../contracts/function-call-contracts'

function now(): string {
  return new Date().toISOString()
}

export function createEmptyAiScenarioSessionState(key: AiScenarioSessionKey): AiScenarioSessionState {
  return {
    key,
    messages: [],
    functionResults: [],
    requirements: null,
    flowState: null,
    updatedAt: now(),
  }
}

function cloneState(state: AiScenarioSessionState): AiScenarioSessionState {
  return {
    key: { ...state.key },
    messages: state.messages.map((message) => ({ ...message })),
    functionResults: state.functionResults.map((result) => ({ ...result })),
    requirements: state.requirements === null
      ? null
      : {
          ...state.requirements,
          constraints: [...state.requirements.constraints],
          assumptions: [...state.requirements.assumptions],
        },
    flowState: state.flowState === null ? null : clonePageModelFlowState(state.flowState),
    updatedAt: state.updatedAt,
  }
}

function clonePageModelFlowState(flowState: PageModelFlowState): PageModelFlowState {
  const cloned = {
    opened: flowState.opened,
    requirementsConfirmed: flowState.requirementsConfirmed,
    validated: flowState.validated,
    committed: flowState.committed,
    dirty: flowState.dirty,
    updatedAt: flowState.updatedAt,
  }
  if (flowState.lastValidation === undefined) return cloned
  return {
    ...cloned,
    lastValidation: {
      ok: flowState.lastValidation.ok,
      issues: flowState.lastValidation.issues.map((issue) => ({ ...issue })),
    },
  }
}

export function createMemoryAiScenarioSessionStore(): AiScenarioSessionStore {
  const sessions = new Map<string, AiScenarioSessionState>()

  function get(sessionKey: AiScenarioSessionKey): Promise<AiScenarioSessionState | undefined> {
    const state = sessions.get(serializePageModelHostKey(sessionKey))
    return Promise.resolve(state === undefined ? undefined : cloneState(state))
  }

  function set(sessionKey: AiScenarioSessionKey, state: AiScenarioSessionState): Promise<void> {
    sessions.set(serializePageModelHostKey(sessionKey), cloneState({ ...state, key: sessionKey, updatedAt: now() }))
    return Promise.resolve()
  }

  async function appendMessage(sessionKey: AiScenarioSessionKey, message: AiScenarioMessage): Promise<void> {
    const state = await get(sessionKey) ?? createEmptyAiScenarioSessionState(sessionKey)
    await set(sessionKey, {
      ...state,
      messages: [...state.messages, { ...message }],
    })
  }

  async function appendFunctionResult(
    sessionKey: AiScenarioSessionKey,
    result: AiScenarioFunctionCallResult,
  ): Promise<void> {
    const state = await get(sessionKey) ?? createEmptyAiScenarioSessionState(sessionKey)
    await set(sessionKey, {
      ...state,
      functionResults: [...state.functionResults, { ...result }],
    })
  }

  function clear(sessionKey: AiScenarioSessionKey): Promise<void> {
    sessions.delete(serializePageModelHostKey(sessionKey))
    return Promise.resolve()
  }

  return {
    get,
    set,
    appendMessage,
    appendFunctionResult,
    clear,
  }
}
