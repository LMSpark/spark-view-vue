/**
 * @module @spark-appworks/spark-ai:agent/ag-ui/index
 * 职责：聚合 AG-UI adapter 类型和纯 mapper。
 * 边界：只作为 agent/ag-ui 子域出口，不注册运行时副作用。
 * AI用途：需要查找 AG-UI 首版接入 API 时，从本模块开始。
 */

export {
  createSparkAgUiCustomEvent,
  createSparkAgUiReasoningEndEvent,
  createSparkAgUiReasoningMessageContentEvent,
  createSparkAgUiReasoningMessageEndEvent,
  createSparkAgUiReasoningMessageStartEvent,
  createSparkAgUiReasoningStartEvent,
  createSparkAgUiRunErrorEvent,
  createSparkAgUiRunFinishedEvent,
  createSparkAgUiRunStartedEvent,
  createSparkAgUiStreamCustomEvent,
  createSparkAgUiTextMessageContentEvent,
  createSparkAgUiTextMessageEndEvent,
  createSparkAgUiTextMessageStartEvent,
  createSparkAgUiToolCallEvents,
  stringifySparkAgUiPayload,
  toSparkAgUiAssistantMessageId,
  toSparkAgUiReasoningMessageId,
  toSparkAgUiTool,
  toSparkAgUiTools,
} from './ag-ui-mapper'

export type {
  SparkAgUiBaseEvent,
  SparkAgUiCustomEventName,
  SparkAgUiEvent,
  SparkAgUiEventMetadata,
  SparkAgUiMessage,
  SparkAgUiRunInput,
  SparkAgUiRunRef,
  SparkAgUiTextMessageRole,
  SparkAgUiTool,
} from './ag-ui-types'
