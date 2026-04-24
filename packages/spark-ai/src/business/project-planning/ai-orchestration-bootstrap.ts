/**
 * AI Orchestration Bootstrap Factory — 应用启动点
 */

import { runStillsLoop } from '../../core/orchestration/session-orchestrator'
import { createStillsSession } from '../../catalog/stills-session'
import {
  createOrchestratorConfig,
  type OrchestratorConfigFactoryOptions,
} from './orchestrator-config-factory'
import type { SessionBackend, OrchestratorResult } from '../../core/session/session-contracts'
import type { IStillSession } from '../../core/stills/types'
import { SessionBackendImpl } from '../../core/session/session-backend'
import {
  DEFAULT_ORCHESTRATION_SCENARIO,
  SCENARIO_DEBUG,
  SCENARIO_ITERATE,
} from './orchestration-scenarios'

export interface BootstrapOptions extends Omit<OrchestratorConfigFactoryOptions, 'backend' | 'systemPrompt'> {
  backend: SessionBackend
  systemPrompt: string
  userPrompt?: string
  session?: IStillSession
}

export function createSessionBackend(
  baseUrl = '/api/ai/sessions',
  options: ConstructorParameters<typeof SessionBackendImpl>[1] = {},
): SessionBackend {
  return new SessionBackendImpl(baseUrl, options)
}

function buildConfigOptions(options: BootstrapOptions): OrchestratorConfigFactoryOptions {
  const {
    backend,
    systemPrompt,
    userPrompt,
    scenario = DEFAULT_ORCHESTRATION_SCENARIO,
    maxRounds = 20,
    slidingWindow = 10,
    resumeSessionId,
    signal,
    onSseEvent,
    onRoundStart,
    onTurnComplete,
    onRoundComplete,
    businessContext,
    useBusinessFollowUpPolicy,
    tools,
    repeatDetection,
  } = options

  const configOptions: OrchestratorConfigFactoryOptions = {
    scenario,
    maxRounds,
    slidingWindow,
    systemPrompt,
    backend,
    ...(userPrompt !== undefined ? { userPrompt } : {}),
    ...(resumeSessionId !== undefined ? { resumeSessionId } : {}),
    ...(tools !== undefined ? { tools } : {}),
    ...(signal !== undefined ? { signal } : {}),
    ...(onSseEvent !== undefined ? { onSseEvent } : {}),
    ...(onRoundStart !== undefined ? { onRoundStart } : {}),
    ...(onTurnComplete !== undefined ? { onTurnComplete } : {}),
    ...(onRoundComplete !== undefined ? { onRoundComplete } : {}),
    ...(businessContext !== undefined ? { businessContext } : {}),
    ...(useBusinessFollowUpPolicy !== undefined ? { useBusinessFollowUpPolicy } : {}),
    ...(repeatDetection !== undefined ? { repeatDetection } : {}),
  }

  return configOptions
}

export async function startAiOrchestration(options: BootstrapOptions): Promise<OrchestratorResult> {
  const {
    backend,
    userPrompt = '',
    session,
  } = options

  const runtimeSession = session ?? createStillsSession()
  const configOptions = buildConfigOptions(options)
  const config = createOrchestratorConfig(configOptions)
  const result = await runStillsLoop(userPrompt, runtimeSession, backend, config)

  return result
}

export async function startGenerateSession(
  options: Omit<BootstrapOptions, 'scenario'>,
): Promise<OrchestratorResult> {
  return startAiOrchestration({
    ...options,
    scenario: DEFAULT_ORCHESTRATION_SCENARIO,
  })
}

export async function startIterateSession(
  options: Omit<BootstrapOptions, 'scenario'>,
): Promise<OrchestratorResult> {
  return startAiOrchestration({
    ...options,
    scenario: SCENARIO_ITERATE,
  })
}

export async function startDebugSession(
  options: Omit<BootstrapOptions, 'scenario'>,
): Promise<OrchestratorResult> {
  return startAiOrchestration({
    ...options,
    scenario: SCENARIO_DEBUG,
  })
}
