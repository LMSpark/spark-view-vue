/**
 * @module app:services/ai/spark-ai-agent-bindings
 * 职责：spark-ai agent 类型与 ClassModel 适配器的 app 层统一 import 入口。
 * 边界：只做 re-export，不包含业务编排。
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
