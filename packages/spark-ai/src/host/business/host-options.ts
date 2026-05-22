import type { AiHostChatRequest } from '../chat/chat-types'
import type { AiHostTransport } from '../transport/transport-types'
import type { AiHostBusinessRegistration } from './registration-types'

export type AiHostOptions = Readonly<{
  registry: {
    get(moduleId: string): AiHostBusinessRegistration | undefined
    list(): readonly AiHostBusinessRegistration[]
  }
  transport: AiHostTransport
  maxToolRounds?: number | undefined
}>

export type AiHostSender = (request: AiHostChatRequest) => Promise<void>
