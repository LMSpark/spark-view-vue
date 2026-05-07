import type { FunctionResult, FunctionRuntimeContext, PostValidationWarning } from '../function/contracts'

export interface ToolCall {
  id: string
  function: {
    name: string
    arguments: string
  }
}

export interface ToolResult {
  tool_call_id: string
  content: string
}

export interface JsonSchema {
  type: 'object'
  properties: Record<string, JsonSchemaProperty>
  required?: string[]
}

export interface JsonSchemaProperty {
  type: string | string[]
  description?: string
  items?: JsonSchemaProperty
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  enum?: Array<string | number | null>
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: JsonSchema
  }
}

export interface FcDispatchResult {
  toolCall: ToolCall
  action: string
  result: FunctionResult
  toolResult: ToolResult
}

export interface LlmResponse {
  text: string
  reasoning?: string
  toolCalls?: ToolCall[]
}

export interface SessionBackendSseEvent {
  sessionId: string
  type: string
  data: string
}

export interface SessionBackend {
  createSession(systemPrompt: string, userPrompt: string, windowSize: number, tools?: ToolDefinition[], signal?: AbortSignal): Promise<string>
  executeTurn(sessionId: string, options?: { signal?: AbortSignal; onSseEvent?: (event: SessionBackendSseEvent) => void }): Promise<LlmResponse | null>
  appendMessages(sessionId: string, messages: Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: ToolCall[] }>, signal?: AbortSignal): Promise<void>
  getConversation(sessionId: string): Promise<Array<{ role: string; content: string }>>
  destroySession(sessionId: string): Promise<void>
  destroyAllSessions(): Promise<void>
}

export interface FunctionTurnResult {
  ok: boolean
  data?: unknown
  code?: string | undefined
  msg?: string | undefined
  fix?: string | undefined
  summary?: string | undefined
  warnings?: PostValidationWarning[] | undefined
}

export interface DialogueTurn {
  round: number
  timestamp: string
  phase: 'ai-response' | 'function-execute'
  aiText?: string | undefined
  aiReasoning?: string | undefined
  toolBlock?: {
    action: string
    id: string
    params: unknown
  } | undefined
  functionResult?: FunctionTurnResult | undefined
  elapsed?: number | undefined
}

export interface MonitorContext {
  context: FunctionRuntimeContext
  currentTurn: DialogueTurn
  allTurns: DialogueTurn[]
  round: number
  params: unknown
  result: FunctionResult
}

export interface SessionMonitor {
  name: string
  afterFunctionExecution(ctx: MonitorContext): string[]
  shouldAbort?(ctx: MonitorContext): { abort: boolean; reason?: string; outcome?: 'completed' | 'aborted' }
}

export interface FollowUpBuildContext {
  action: string
  result: FunctionResult
  monitorCtx: MonitorContext
}

export interface FollowUpPolicy {
  buildFollowUps(ctx: FollowUpBuildContext): string[]
}

export interface OrchestratorConfig {
  maxRounds: number
  slidingWindow: number
  systemPrompt: string
  resumeSessionId?: string
  tools?: ToolDefinition[]
  signal?: AbortSignal
  onSseEvent?: (event: SessionBackendSseEvent) => void
  monitors?: SessionMonitor[]
  onRoundStart?: (round: number) => void
  onTurnComplete?: (turn: DialogueTurn) => void
  onRoundComplete?: (turn: DialogueTurn) => void
  dispatchFc?: (toolCall: ToolCall, context: FunctionRuntimeContext) => FcDispatchResult
  followUpPolicy?: FollowUpPolicy
}

export interface OrchestratorResult {
  turns: DialogueTurn[]
  rounds: number
  aborted: boolean
  abortReason?: string | undefined
  completed: boolean
  sessionId: string
}
