import type { LlmJsonValue } from '../../schema'
import type { AiHostFunctionCallResult } from '../session/session-types'
import type { AiHostBusinessRuntimeContext } from './scope-types'

export type AiHostBusinessLifecycleStatus = 'continue' | 'complete' | 'abort'

export type AiHostBusinessLifecycleDirective = Readonly<{
  status: AiHostBusinessLifecycleStatus
  reason?: string | undefined
  finalAssistantMessage?: string | undefined
  releaseInstance?: boolean | undefined
}>

export type AiHostBusinessAfterFunctionCallOptions = AiHostBusinessRuntimeContext & Readonly<{
  toolName: string
  args: Readonly<Record<string, LlmJsonValue>>
  result: AiHostFunctionCallResult<unknown>
}>
