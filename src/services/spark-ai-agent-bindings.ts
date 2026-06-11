/**
 * @module app:services/spark-ai-agent-bindings
 * app 的 services/spark-ai-agent-bindings 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
export {
  createSimpleInputContract,
  ClassModelAgentAdapter,
} from '@spark-appworks/spark-ai/agent'

export type {
  AiAgentBeforeFunctionCallDirective,
  AiAgentBeforeFunctionCallOptions,
  AiAgentHost,
  AiAgentRuntimeContext,
  AiAgentToolLoopNudgeContext,
  AiAgentToolLoopNudgeReason,
  EnrichFunctionCallFailureCommand,
} from '@spark-appworks/spark-ai/agent'
