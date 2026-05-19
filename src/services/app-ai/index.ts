import type {
  AiChatSendRequest,
  AiSseEventInput,
} from '@spark-view/spark-component'
import type { AiHostStreamTurnInput } from '@spark-view/spark-ai/host'

export { createAppAiPanelResolver, createAppAiRuntimeMonitor } from './panel-resolver'
export type {
  AppAiPanelResolverOptions,
  AppAiPanelSessionResolver,
  AppAiRuntimeMonitor,
  AppAiRuntimeMonitorSnapshot,
  AppAiRuntimeSessionSnapshot,
} from './panel-resolver'
export { FetchAppAiTransport, uploadAppAiAttachment } from './transport'
export {
  AiHostBusinessRegistry as AppAiBusinessRegistry,
  toAiHostRuntimeScope as toRuntimeScope,
} from '@spark-view/spark-ai/host'

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

export type {
  AiHostAppendMessagesInput as AppAiAppendMessagesInput,
  AiHostBusinessAfterFunctionCallOptions as AppAiBusinessAfterFunctionCallOptions,
  AiHostBusinessAppendMessageOptions as AppAiBusinessAppendMessageOptions,
  AiHostBusinessExecuteFunctionCallOptions as AppAiBusinessExecuteFunctionCallOptions,
  AiHostBusinessLifecycleDirective as AppAiBusinessLifecycleDirective,
  AiHostBusinessLifecycleStatus as AppAiBusinessLifecycleStatus,
  AiHostBusinessRuntime as AppAiBusinessRuntime,
  AiHostBusinessRuntimeContext as AppAiBusinessRuntimeContext,
  AiHostBusinessScope as AppAiBusinessScope,
  AiHostOptions as AppAiOptions,
  AiHostSelectedBusiness as AppAiSelectedBusiness,
  AiHostStreamTurnResult as AppAiStreamTurnResult,
  AiHostTransport as AppAiTransport,
  AiHostTransportMessage as AppAiTransportMessage,
  AiHostTransportToolCall as AppAiTransportToolCall,
  AiHostTransportToolSpec as AppAiTransportToolSpec,
  AiHostTurnMeta as AppAiTurnMeta,
} from '@spark-view/spark-ai/host'

export type AppAiSender = (request: AiChatSendRequest) => Promise<void>

export type AppAiStreamTurnInput = Omit<AiHostStreamTurnInput, 'onSseEvent'> & {
  readonly onSseEvent?: ((event: AiSseEventInput) => void) | undefined
}
