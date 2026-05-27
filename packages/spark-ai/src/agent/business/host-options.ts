import type { AiAgentTurnCallbacks } from '../transport/transport-types'
import type { AiJsonParams } from '../../json'
import type { AiAgentRegistration } from './registration-types'

export type AiAgentOptions<TInput extends AiJsonParams = AiJsonParams> = Readonly<{
  registry: {
    get(moduleId: string): AiAgentRegistration<TInput> | undefined
  }
  turnCallbacks: AiAgentTurnCallbacks
  maxToolRounds?: number
}>
