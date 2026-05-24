import type { AiHostChatRequest } from '../chat/chat-types'
import type { AiHostTurnCallbacks } from '../transport/transport-types'
import type { AiHostBusinessRegistration } from './registration-types'

export type AiHostOptions = Readonly<{
  registry: {
    get(moduleId: string): AiHostBusinessRegistration | undefined
    list(): readonly AiHostBusinessRegistration[]
  }
  turnCallbacks: AiHostTurnCallbacks
  maxToolRounds?: number
}>

export type AiHostSender = (request: AiHostChatRequest) => Promise<void>
