import type {
  AiChatSendRequest,
  AiSseEventInput,
} from '@spark-view/spark-component'
import type {
  AiHostAppendMessagesInput,
  AiHostBusinessAfterFunctionCallOptions,
  AiHostBusinessAppendMessageOptions,
  AiHostBusinessExecuteFunctionCallOptions,
  AiHostBusinessLifecycleDirective,
  AiHostBusinessLifecycleStatus,
  AiHostBusinessRuntime,
  AiHostBusinessRuntimeContext,
  AiHostBusinessScope,
  AiHostOptions,
  AiHostSelectedBusiness,
  AiHostStreamTurnInput,
  AiHostStreamTurnResult,
  AiHostTransport,
  AiHostTransportMessage,
  AiHostTransportToolCall,
  AiHostTransportToolSpec,
  AiHostTurnMeta,
} from '@spark-view/spark-ai/host'
import {
  AiHostBusinessRegistry,
  toAiHostRuntimeScope,
} from '@spark-view/spark-ai/host'

export { createAppAiPanelResolver, createAppAiRuntimeMonitor } from './panel-resolver'
export type {
  AppAiPanelResolverOptions,
  AppAiPanelSessionResolver,
  AppAiRuntimeMonitor,
  AppAiRuntimeMonitorSnapshot,
  AppAiRuntimeSessionSnapshot,
} from './panel-resolver'
export { FetchAppAiTransport, uploadAppAiAttachment } from './transport'
export const AppAiBusinessRegistry = AiHostBusinessRegistry
export const toRuntimeScope = toAiHostRuntimeScope

export {
  registerAppAiBusinesses,
} from '@spark-view/spark-ai/registrations'

export type {
  RegisterAppAiBusinessesOptions,
} from '@spark-view/spark-ai/registrations'

export {
  registerPageDesignEditHost,
  resolvePageDesignEditHost,
  resolvePageDesignEditPageId,
} from '@spark-view/spark-page-config'

export type {
  PageDesignEditHostSnapshot,
} from '@spark-view/spark-page-config'

export type AppAiAppendMessagesInput = AiHostAppendMessagesInput
export type AppAiBusinessAfterFunctionCallOptions = AiHostBusinessAfterFunctionCallOptions
export type AppAiBusinessAppendMessageOptions = AiHostBusinessAppendMessageOptions
export type AppAiBusinessExecuteFunctionCallOptions = AiHostBusinessExecuteFunctionCallOptions
export type AppAiBusinessLifecycleDirective = AiHostBusinessLifecycleDirective
export type AppAiBusinessLifecycleStatus = AiHostBusinessLifecycleStatus
export type AppAiBusinessRuntime = AiHostBusinessRuntime
export type AppAiBusinessRuntimeContext = AiHostBusinessRuntimeContext
export type AppAiBusinessScope = AiHostBusinessScope
export type AppAiOptions = AiHostOptions
export type AppAiSelectedBusiness = AiHostSelectedBusiness
export type AppAiStreamTurnResult = AiHostStreamTurnResult
export type AppAiTransport = AiHostTransport
export type AppAiTransportMessage = AiHostTransportMessage
export type AppAiTransportToolCall = AiHostTransportToolCall
export type AppAiTransportToolSpec = AiHostTransportToolSpec
export type AppAiTurnMeta = AiHostTurnMeta

export type AppAiSender = (request: AiChatSendRequest) => Promise<void>

export type AppAiStreamTurnInput = Omit<AiHostStreamTurnInput, 'onSseEvent'> & {
  readonly onSseEvent?: ((event: AiSseEventInput) => void) | undefined
}
