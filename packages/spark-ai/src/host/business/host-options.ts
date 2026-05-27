import type { AiHostTurnCallbacks } from '../transport/transport-types'
import type { LlmJsonParams } from '../../schema'
import type { AiHostBusinessRegistration } from './registration-types'

export type AiHostOptions<TInput extends LlmJsonParams = LlmJsonParams> = Readonly<{
  registry: {
    get(moduleId: string): AiHostBusinessRegistration<TInput> | undefined
  }
  turnCallbacks: AiHostTurnCallbacks
  maxToolRounds?: number
}>
