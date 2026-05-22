/**
 * User turn and stream callback DTOs.
 */

import type { AiHostFunctionCallResult } from '../session/session-types'

export type AiHostChatMessage = Readonly<{
  role: 'user' | 'assistant' | 'system'
  content: string
}>

export type AiHostChatRequest = Readonly<{
  historyMsgs: readonly AiHostChatMessage[]
  turn?: AiHostTurnMeta
  systemPrompt?: string
  signal?: AbortSignal
  onReasoning?: (reasoning: string) => void
  onDelta?: (delta: string) => void
  onUsage?: (usageRaw: Record<string, unknown>) => void
  onSseEvent?: (event: AiHostSseEvent) => void
  onFcCall?: (record: AiHostFcCallRecord) => void
}>

export type AiHostSseEvent = Readonly<{
  type: string
  data: unknown
  streamKey: string
  scope: {
    readonly businessRegistrationId: string
    readonly businessInstanceId: string
    readonly eventModuleId: string
    readonly turnId: string
  }
}>

export type AiHostFcCallRecord = Readonly<{
  toolName: string
  args: unknown
  turnId: string
  round: number
  callId?: string | undefined
  status: 'success' | 'error'
  result: AiHostFunctionCallResult<unknown>
  durationMs: number
}>

export type AiHostTurnMeta = Readonly<{
  turnId: string
  seq: number
  baseRevision: number
  queuedAt: string
  startedAt: string
  maxParallelTurns: number
}>
