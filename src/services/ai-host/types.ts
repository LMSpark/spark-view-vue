import type {
  AiBusinessRegistrationData,
  AiModuleRegistrationData,
  AiRuntimeFunctionCallResult,
  AiRuntimeHistoryEntry,
  AiRuntimeKnowledgeProjection,
  AiRuntimeMessageHistoryEntry,
  AiRuntimeStartInstanceResult,
} from '@spark-view/spark-ai'
import type {
  AiChatSendRequest,
  AiSseEventInput,
} from '@spark-view/spark-component'

export interface AppAiBusinessScope {
  readonly businessRegistrationId: string
  readonly businessInstanceId: string
  readonly instanceId: string
  readonly runtimeInstanceId: string
}

export interface AppAiHostContext {
  readonly pageId?: string | undefined
  readonly routePath?: string | undefined
}

export interface AppAiBusinessResolveInput {
  readonly userInput: string
  readonly context: AppAiHostContext
}

export interface AppAiBusinessRuntimeContext {
  readonly moduleId: string
  readonly moduleInstanceId: string
  readonly instanceId: string
}

export interface AppAiBusinessAppendMessageOptions extends AppAiBusinessRuntimeContext {
  readonly role: 'system' | 'user' | 'assistant'
  readonly content: string
  readonly source?: 'system' | 'ui' | 'llm' | undefined
  readonly metadata?: Record<string, unknown> | undefined
}

export interface AppAiBusinessExecuteFunctionCallOptions extends AppAiBusinessRuntimeContext {
  readonly action: string
  readonly args: unknown
  readonly projection?: AiRuntimeKnowledgeProjection | undefined
}

export type AppAiBusinessLifecycleStatus = 'continue' | 'complete' | 'abort'

export interface AppAiBusinessLifecycleDirective {
  readonly status: AppAiBusinessLifecycleStatus
  readonly reason?: string | undefined
  readonly finalAssistantMessage?: string | undefined
  readonly releaseInstance?: boolean | undefined
}

export interface AppAiBusinessAfterFunctionCallOptions extends AppAiBusinessRuntimeContext {
  readonly action: string
  readonly args: unknown
  readonly result: AiRuntimeFunctionCallResult<unknown>
}

export interface AppAiBusinessRuntime {
  readonly moduleId: string
  getRegistrationData(): AiModuleRegistrationData
  getBusinessRegistrationData?(): AiBusinessRegistrationData
  resolveBusinessInstance(input: AppAiBusinessResolveInput): string
  canReuseSelection?(input: AppAiBusinessResolveInput, currentScope: AppAiBusinessScope): boolean
  getSystemPrompt?(context: AppAiBusinessRuntimeContext): string | undefined
  startSession(context: AppAiBusinessRuntimeContext): Promise<AiRuntimeStartInstanceResult>
  appendMessage(options: AppAiBusinessAppendMessageOptions): AiRuntimeMessageHistoryEntry
  executeFunctionCall(options: AppAiBusinessExecuteFunctionCallOptions): Promise<AiRuntimeFunctionCallResult<unknown>>
  afterFunctionCall?(options: AppAiBusinessAfterFunctionCallOptions): AppAiBusinessLifecycleDirective | Promise<AppAiBusinessLifecycleDirective>
  endBusinessInstance?(context: AppAiBusinessRuntimeContext, directive: AppAiBusinessLifecycleDirective): void | Promise<void>
  getSessionHistory(context: AppAiBusinessRuntimeContext): readonly AiRuntimeHistoryEntry[]
  releaseModuleInstance?(moduleInstanceId: string): void
}

export interface AppAiRoutingCandidate {
  readonly moduleId: string
  readonly name: string
  readonly description: string
  readonly prompt?: string | undefined
  readonly functions: ReadonlyArray<{
    readonly functionId: string
    readonly description: string
  }>
}

export interface AppAiRouteDecision {
  readonly moduleId: string | null
  readonly confidence: number
  readonly reason: string
}

export interface AppAiTurnMeta {
  readonly turnId: string
  readonly seq: number
  readonly baseRevision: number
  readonly queuedAt: string
  readonly startedAt: string
  readonly maxParallelTurns: number
}

export interface AppAiTransportToolSpec {
  readonly type: 'function'
  readonly function: {
    readonly name: string
    readonly description: string
    readonly parameters: Record<string, unknown>
  }
}

export interface AppAiTransportMessage {
  readonly role: string
  readonly content: string
  readonly tool_call_id?: string | undefined
  readonly tool_calls?: readonly AppAiTransportToolCall[] | undefined
}

export interface AppAiTransportToolCall {
  readonly id?: string | undefined
  readonly type?: string | undefined
  readonly function?: {
    readonly name?: string | undefined
    readonly arguments?: string | undefined
  } | undefined
}

export interface AppAiStreamTurnInput {
  readonly sessionId: string
  readonly scope: AppAiBusinessScope
  readonly turn: AppAiTurnMeta
  readonly systemPrompt: string
  readonly tools: readonly AppAiTransportToolSpec[]
  readonly messages: readonly AppAiTransportMessage[]
  readonly signal?: AbortSignal | undefined
  readonly onSseEvent?: ((event: AiSseEventInput) => void) | undefined
  readonly onDelta?: ((delta: string) => void) | undefined
  readonly onReasoning?: ((reasoning: string) => void) | undefined
  readonly onUsage?: ((usage: Record<string, unknown>) => void) | undefined
}

export interface AppAiStreamTurnResult {
  readonly text: string
  readonly reasoning?: string | undefined
  readonly toolCalls: readonly AppAiTransportToolCall[]
}

export interface AppAiAppendMessagesInput {
  readonly sessionId: string
  readonly scope: AppAiBusinessScope
  readonly turn: AppAiTurnMeta
  readonly messages: readonly AppAiTransportMessage[]
}

export interface AppAiRouteBusinessInput {
  readonly userInput: string
  readonly candidates: readonly AppAiRoutingCandidate[]
  readonly turn: AppAiTurnMeta
  readonly signal?: AbortSignal | undefined
}

export interface AppAiHostTransport {
  routeBusiness(input: AppAiRouteBusinessInput): Promise<AppAiRouteDecision>
  streamTurn(input: AppAiStreamTurnInput): Promise<AppAiStreamTurnResult>
  appendMessages(input: AppAiAppendMessagesInput): Promise<void>
}

export interface AppAiHostOptions {
  readonly registry: {
    get(moduleId: string): AppAiBusinessRuntime | undefined
    list(): readonly AppAiBusinessRuntime[]
    routingCandidates(): readonly AppAiRoutingCandidate[]
  }
  readonly transport: AppAiHostTransport
  readonly context?: (() => AppAiHostContext) | undefined
  readonly maxToolRounds?: number | undefined
}

export type AppAiHostSender = (request: AiChatSendRequest) => Promise<void>
