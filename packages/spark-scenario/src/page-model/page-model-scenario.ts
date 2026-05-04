import type { AiScenarioContext, AiScenarioDefinition } from '../contracts/scenario-types'
import type { AiScenarioFunctionCallBridge } from '../runtime/scenario-function-call-bridge'
import type { AiScenarioFunctionLoopGuard, AiScenarioFunctionLoopOptions } from '../runtime/scenario-function-loop'
import type { AiScenarioSessionStore, PageModelHost, PageModelHostKey } from './contracts'
import { createEmptyAiScenarioSessionState } from './session-store'
import type { PageModelHostRegistry } from './host-registry'
import { createScenarioToolsFromPageModelRegistration } from './scenario-tool-adapter'
import {
  createPageModelRegistrationKnowledge,
  projectPageModelPayloadCapabilities,
  projectPageModelPayloadContract,
} from './registration'

export { PAGE_MODEL_EDIT_SCENARIO_ID } from './registration'

export interface PageModelEditScenarioOptions {
  hostRegistry: PageModelHostRegistry
  sessionStore: AiScenarioSessionStore
  createHost?: (key: PageModelHostKey) => PageModelHost | Promise<PageModelHost>
}

export interface PageModelHeadlessCommitGuardOptions {
  hostRegistry: PageModelHostRegistry
  hostKey: PageModelHostKey
  errorMessage?: string
}

export interface PageModelFunctionLoopOptions {
  bridge: AiScenarioFunctionCallBridge
  sessionStore: AiScenarioSessionStore
  sessionKey: PageModelHostKey
  hostRegistry: PageModelHostRegistry
  hostKey: PageModelHostKey
  requireHeadlessCommit?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key]
  return typeof field === 'string' && field.trim() !== '' ? field : undefined
}

function readHostKeyFromArgs(args: unknown): PageModelHostKey | undefined {
  if (!isRecord(args)) return undefined
  const rawHostKey = args['hostKey']
  if (!isRecord(rawHostKey)) return undefined
  const tenantId = readString(rawHostKey, 'tenantId')
  const projectId = readString(rawHostKey, 'projectId')
  const pageId = readString(rawHostKey, 'pageId')
  const sessionId = readString(rawHostKey, 'sessionId')
  if (tenantId === undefined || projectId === undefined || pageId === undefined || sessionId === undefined) return undefined
  return { tenantId, projectId, pageId, sessionId }
}

function readHostKeyFromContext(ctx: AiScenarioContext): PageModelHostKey | undefined {
  if (
    ctx.tenantId !== undefined
    && ctx.projectId !== undefined
    && ctx.pageId !== undefined
    && ctx.sessionId !== undefined
  ) {
    return {
      tenantId: ctx.tenantId,
      projectId: ctx.projectId,
      pageId: ctx.pageId,
      sessionId: ctx.sessionId,
    }
  }

  const metadata = ctx.metadata
  const rawHostKey = metadata?.['pageModelHostKey']
  if (!isRecord(rawHostKey)) return undefined
  const tenantId = readString(rawHostKey, 'tenantId')
  const projectId = readString(rawHostKey, 'projectId')
  const pageId = readString(rawHostKey, 'pageId')
  const sessionId = readString(rawHostKey, 'sessionId')
  if (tenantId === undefined || projectId === undefined || pageId === undefined || sessionId === undefined) return undefined
  return { tenantId, projectId, pageId, sessionId }
}

function requireHostKey(args: unknown, ctx: AiScenarioContext): PageModelHostKey {
  const key = readHostKeyFromArgs(args) ?? readHostKeyFromContext(ctx)
  if (key === undefined) {
    throw new Error('PageModelHostKey is required: tenantId, projectId, pageId, sessionId.')
  }
  return key
}

async function resolveHost(options: PageModelEditScenarioOptions, key: PageModelHostKey): Promise<PageModelHost> {
  const existing = options.hostRegistry.get(key)
  if (existing !== undefined) return existing
  if (options.createHost === undefined) {
    throw new Error('PageModelHost is not registered and createHost is not configured.')
  }
  const host = await options.createHost(key)
  options.hostRegistry.register(host)
  return host
}

async function persistHostState(options: PageModelEditScenarioOptions, host: PageModelHost): Promise<void> {
  const current = await options.sessionStore.get(host.key) ?? createEmptyAiScenarioSessionState(host.key)
  await options.sessionStore.set(host.key, {
    ...current,
    requirements: host.getRequirements(),
    flowState: host.getFlowState(),
  })
}

export function createPageModelEditScenario(options: PageModelEditScenarioOptions): AiScenarioDefinition {
  const registration = createPageModelRegistrationKnowledge()
  return {
    id: registration.scenario.id,
    title: registration.scenario.title,
    description: registration.scenario.description,
    intents: registration.scenario.intents,
    promptPolicy: registration.scenario.promptPolicy,
    capabilities: projectPageModelPayloadCapabilities(registration),
    payload: projectPageModelPayloadContract(registration),
    flow: registration.flow,
    completion: registration.completion,
    recovery: registration.recovery,
    tools: createScenarioToolsFromPageModelRegistration(registration, {
      resolveHost: (args, ctx) => resolveHost(options, requireHostKey(args, ctx)),
      persistHostState: (host) => persistHostState(options, host),
    }),
  }
}

export function createPageModelHeadlessCommitGuard(
  options: PageModelHeadlessCommitGuardOptions,
): AiScenarioFunctionLoopGuard {
  return () => {
    const host = options.hostRegistry.get(options.hostKey)
    if (host?.mode === 'headless' && !host.getFlowState().committed) {
      return options.errorMessage ?? 'Headless page model run finished without edit.commit.'
    }
    return undefined
  }
}

export function createPageModelFunctionLoopOptions(
  options: PageModelFunctionLoopOptions,
): AiScenarioFunctionLoopOptions {
  return {
    bridge: options.bridge,
    appendFunctionResult: (result) => options.sessionStore.appendFunctionResult(options.sessionKey, result),
    ...(options.requireHeadlessCommit === true
      ? { completionGuard: createPageModelHeadlessCommitGuard({ hostRegistry: options.hostRegistry, hostKey: options.hostKey }) }
      : {}),
  }
}

export function actionToPageModelFunctionName(action: string): string {
  return action.replace(/\./g, '_')
}

export function pageModelFunctionNameToAction(functionName: string): string {
  const separatorIndex = functionName.indexOf('_')
  if (separatorIndex < 0) return functionName
  return `${functionName.slice(0, separatorIndex)}.${functionName.slice(separatorIndex + 1)}`
}

export function pageModelFunctionNameMapper(input: { toolName: string }): string {
  return actionToPageModelFunctionName(input.toolName)
}
