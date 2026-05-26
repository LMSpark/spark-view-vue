import type { LlmJsonParams } from '../../schema'
import type { AiHostFunctionCallResult } from '../session/session-types'
import type { AiHostBusinessRuntimeContext } from './scope-types'

export type AiHostBusinessLifecycleStatus = 'continue' | 'complete' | 'abort'

export type AiHostBusinessLifecycleDirective = Readonly<{
  status: AiHostBusinessLifecycleStatus
  reason?: string
  finalAssistantMessage?: string
  releaseInstance?: boolean
}>

export type AiHostBusinessAfterFunctionCallOptions = AiHostBusinessRuntimeContext & Readonly<{
  toolName: string
  args: LlmJsonParams
  result: AiHostFunctionCallResult<unknown>
}>
