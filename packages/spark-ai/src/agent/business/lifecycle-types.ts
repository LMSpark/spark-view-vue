import type { AiJsonParams } from '../../json'
import type { AiAgentFunctionCallResult } from '../session/session-types'
import type { AiAgentRuntimeContext } from './scope-types'

export type AiAgentLifecycleStatus = 'continue' | 'complete' | 'abort'

export type AiAgentLifecycleDirective = Readonly<{
  status: AiAgentLifecycleStatus
  reason?: string
  finalAssistantMessage?: string
  releaseInstance?: boolean
}>

export type AiAgentAfterFunctionCallOptions = AiAgentRuntimeContext & Readonly<{
  toolName: string
  args: AiJsonParams
  result: AiAgentFunctionCallResult<unknown>
}>
