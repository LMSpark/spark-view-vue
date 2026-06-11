/**
 * @module @spark-appworks/spark-ai:agent/business/host-options
 * 职责：定义 AiAgentHost 的配置契约，描述模型客户端、工具审批、会话存储、诊断和业务注册所需的宿主依赖。
 * 边界：只声明 Host 启动参数，不实现 ToolLoop、不管理 UI，也不定义具体业务输入。
 * AI用途：接入或排查 AI Host 初始化时，用本模块确认哪些依赖必须由应用层注入。
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
