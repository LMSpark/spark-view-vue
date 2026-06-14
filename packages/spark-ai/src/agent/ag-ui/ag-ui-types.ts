/**
 * @module @spark-appworks/spark-ai:agent/ag-ui/ag-ui-types
 * 职责：收拢 SPARK 首版 AG-UI adapter 暴露的官方 core 类型别名。
 * 边界：只定义协议类型别名，不执行 agent、不访问 transport，也不渲染 UI。
 * AI用途：需要对齐 AG-UI 事件、tool、message 或 run input 时，从本模块确认公开类型。
 */

import type {
  AGUIEvent,
  BaseEvent,
  Message,
  RunAgentInput,
  Tool,
} from '@ag-ui/core'

/** AG-UI run 输入的 SPARK 公开别名，供 adapter 接收标准 thread/run/message/tool 配置。 */
export type SparkAgUiRunInput = RunAgentInput

/** AG-UI 事件联合类型的 SPARK 公开别名，用于事件流投影和外部 client 消费。 */
export type SparkAgUiEvent = AGUIEvent

/** AG-UI 基础事件类型的 SPARK 公开别名，用于只读 timeline 和调试视图。 */
export type SparkAgUiBaseEvent = BaseEvent

/** AG-UI tool 描述的 SPARK 公开别名，用于从 transport tool spec 映射标准工具定义。 */
export type SparkAgUiTool = Tool

/** AG-UI message 类型的 SPARK 公开别名，用于后续 generative UI 或消息投影扩展。 */
export type SparkAgUiMessage = Message

/** SPARK run 在 AG-UI 事件中的稳定定位信息。 */
export type SparkAgUiRunRef = Readonly<{
  /** AG-UI thread 唯一标识，对应 RunAgentInput.threadId，跨 run 保持不变。 */
  threadId: string
  /** 单次 run 的唯一标识，每次调用 RunAgentInput 生成新 runId。 */
  runId: string
  /** 父 run 标识；用于嵌套 run 场景（如子 agent 调用），顶层 run 时为 undefined。 */
  parentRunId?: string
}>

/** SPARK 生成 AG-UI 事件时附加的时间戳和原始事件调试数据。 */
export type SparkAgUiEventMetadata = Readonly<{
  /** 事件产生的 Unix 毫秒时间戳；未采集时为 undefined（非 0）。 */
  timestamp?: number
  /** 原始 AG-UI 事件引用，仅供调试；生产代码不应依赖此字段的内容结构。 */
  rawEvent?: unknown
}>

/** SPARK 首版 AG-UI 文本消息支持的角色集合。 */
export type SparkAgUiTextMessageRole = 'assistant' | 'user' | 'system' | 'developer'

/** SPARK 以 AG-UI CUSTOM 事件承载的扩展事件名称。 */
export type SparkAgUiCustomEventName =
  | 'spark.toolApproval.requested'
  | 'spark.toolApproval.resolved'
  | 'spark.stream.event'
