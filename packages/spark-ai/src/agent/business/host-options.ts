/**
 * @module @spark-appworks/spark-ai:agent/business/host-options
 * @spark-appworks/spark-ai 的 agent/business/host-options 模块。
 * 导出 ClassModel symbol: AiAgentOptions（共 1 个 symbol）。
 */
import type { AiAgentTurnCallbacks } from '../transport/transport-types'
import type { AiJsonParams } from '../../json'
import type { AiAgentRegistration } from './registration-types'

/** Ai Agent Options 的调用配置。 */
export type AiAgentOptions<TInput extends AiJsonParams = AiJsonParams> = Readonly<{
  registry: {
    get(moduleId: string): AiAgentRegistration<TInput> | undefined
  }
  turnCallbacks: AiAgentTurnCallbacks
  maxToolRounds?: number
}>
