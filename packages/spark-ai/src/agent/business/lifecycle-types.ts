/**
 * ═══════════════════════════════════════════════════════════════
 * agent/business/lifecycle-types.ts — 业务生命周期类型
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】Agent 层的生命周期指令契约。定义工具调用后的三态流转
 *   （continue/complete/abort）以及 afterFunctionCall 回调的入参类型。
 *   位于 business/ 层，被 registration-types、business-task、tool-loop-runner
 *   和 tool-call-executor 共同消费。
 *
 * 【核心类型】
 *   AiAgentLifecycleStatus            — 生命周期三态枚举
 *   AiAgentLifecycleDirective         — 生命周期指令（状态 + 可选信息）
 *   AiAgentAfterFunctionCallOptions   — 工具调用后回调的入参
 *
 * 【数据流】
 *   1. tool-call-executor 执行完一次工具调用后，调用 registration.afterFunctionCall()
 *   2. 业务方返回 AiAgentLifecycleDirective（continue / complete / abort）
 *   3. continue → 进入下一轮工具循环
 *   4. complete / abort → tool-loop-runner 进入生命周期终止流程
 *
 * 【消费方】registration-types、business-task、tool-loop-runner、tool-call-executor
 * ═══════════════════════════════════════════════════════════════
 */

import type { AiJsonParams } from '../../json'
import type { AiAgentFunctionCallResult } from '../session/session-types'
import type { AiAgentRuntimeContext } from './scope-types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 生命周期状态 — 工具循环的三种终止条件
// ═══════════════════════════════════════════════════════════════

/**
 * 生命周期状态三态：
 *   'continue' — 继续下一轮工具调用（默认）
 *   'complete' — 业务目标已达成，正常结束当前 turn
 *   'abort'    — 业务异常或用户取消，中止当前 turn
 */
export type AiAgentLifecycleStatus = 'continue' | 'complete' | 'abort'

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 生命周期指令 — 状态 + 可选的辅助信息
// ═══════════════════════════════════════════════════════════════

/**
 * 生命周期指令：业务方在 afterFunctionCall 中返回，决定工具循环的后续行为。
 *
 * 字段：
 *   status               — 必填，三态之一
 *   reason               — 可选，结束原因（complete/abort 时建议提供）
 *   finalAssistantMessage — 可选，结束时发送给用户的最终消息
 *   releaseInstance      — 可选，是否在结束时释放模块实例资源
 */
export type AiAgentLifecycleDirective = Readonly<{
  status: AiAgentLifecycleStatus
  reason?: string
  finalAssistantMessage?: string
  releaseInstance?: boolean
}>

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 工具调用后回调入参
// ═══════════════════════════════════════════════════════════════

/**
 * afterFunctionCall 回调的入参。
 *
 * 继承 AiAgentRuntimeContext（moduleId / moduleInstanceId / instanceId），
 * 追加本次工具调用的具体信息：
 *   toolName — 被调用的工具名称
 *   args     — 调用参数（已通过 JSON Schema 校验）
 *   result   — 调用结果（ok: true 带 data，ok: false 带 code/msg/fix）
 */
export type AiAgentAfterFunctionCallOptions = AiAgentRuntimeContext & Readonly<{
  toolName: string
  args: AiJsonParams
  result: AiAgentFunctionCallResult<unknown>
}>
