export { AppAiHost } from './app-ai-host'
export { FetchAppAiHostTransport, uploadAppAiAttachment } from './transport'
export { AiHostBusinessRegistry as AppAiBusinessRegistry } from '@spark-view/spark-ai/host'

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
  AiHostBusinessResolveInput as AppAiBusinessResolveInput,
  AiHostBusinessRuntime as AppAiBusinessRuntime,
  AiHostBusinessRuntimeContext as AppAiBusinessRuntimeContext,
  AiHostBusinessScope as AppAiBusinessScope,
  AiHostContext as AppAiHostContext,
  AiHostOptions as AppAiHostOptions,
  AiHostRouteBusinessInput as AppAiRouteBusinessInput,
  AiHostRouteDecision as AppAiRouteDecision,
  AiHostRoutingCandidate as AppAiRoutingCandidate,
  AiHostSelectedBusiness as AppAiSelectedBusiness,
  AiHostStreamTurnResult as AppAiStreamTurnResult,
  AiHostTransport as AppAiHostTransport,
  AiHostTransportMessage as AppAiTransportMessage,
  AiHostTransportToolCall as AppAiTransportToolCall,
  AiHostTransportToolSpec as AppAiTransportToolSpec,
  AiHostTurnMeta as AppAiTurnMeta,
} from '@spark-view/spark-ai/host'

import type {
  AiChatSendRequest,
  AiSseEventInput,
} from '@spark-view/spark-component'
import type {
  AiHostBusinessRuntimeContext,
  AiHostBusinessScope,
} from '@spark-view/spark-ai/host'

/** 将 AiHostBusinessScope 转为 AiHostBusinessRuntimeContext */
export function toRuntimeScope(scope: AiHostBusinessScope): AiHostBusinessRuntimeContext {
  return {
    moduleId: scope.businessRegistrationId,
    moduleInstanceId: scope.businessInstanceId,
    instanceId: scope.instanceId,
  }
}

export type AppAiHostSender = (request: AiChatSendRequest) => Promise<void>

import type { AiHostStreamTurnInput } from '@spark-view/spark-ai/host'

export type AppAiStreamTurnInput = Omit<AiHostStreamTurnInput, 'onSseEvent'> & {
  readonly onSseEvent?: ((event: AiSseEventInput) => void) | undefined
}
