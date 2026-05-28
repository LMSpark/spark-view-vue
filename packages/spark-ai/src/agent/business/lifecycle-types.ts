/**
 * ═══════════════════════════════════════════════════════════════
 * agent/business/lifecycle-types.ts — 业务生命周期类型
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】Agent 层的生命周期指令契约。定义工具调用前的策略裁决、
 *   工具调用后的三态流转（continue/complete/abort）以及生命周期回调入参类型。
 *   位于 business/ 层，被 registration-types、business-task、tool-loop-runner
 *   和 tool-call-executor 共同消费。
 *
 * 【核心类型】
 *   AiAgentBeforeFunctionCallStatus    — 工具调用前置裁决三态
 *   AiAgentBeforeFunctionCallDirective — 工具调用前置裁决指令
 *   AiAgentLifecycleStatus             — 生命周期三态枚举
 *   AiAgentLifecycleDirective          — 生命周期指令（状态 + 可选信息）
 *   AiAgentBeforeFunctionCallOptions   — 工具调用前回调的入参
 *   AiAgentAfterFunctionCallOptions    — 工具调用后回调的入参
 *
 * 【数据流】
 *   1. tool-call-executor 执行 runtime 前，调用 registration.beforeFunctionCall()
 *   2. allow → 继续执行工具；reject → 回灌失败 tool result；abort → 进入终止流程
 *   3. tool-call-executor 执行完一次工具调用后，调用 registration.afterFunctionCall()
 *   4. 业务方返回 AiAgentLifecycleDirective（continue / complete / abort）
 *   5. continue → 进入下一轮工具循环
 *   6. complete / abort → tool-loop-runner 进入生命周期终止流程
 *
 * 【消费方】registration-types、business-task、tool-loop-runner、tool-call-executor
 * ═══════════════════════════════════════════════════════════════
 */

import type { AiJsonParams } from '../../json'
import type { AiAgentFunctionCallResult } from '../session/session-types'
import type { AiAgentRuntimeContext } from './scope-types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 工具调用前置裁决 — 执行 runtime 前的策略入口
// ═══════════════════════════════════════════════════════════════

/**
 * 工具调用前置裁决三态：
 *   'allow'  — 允许本次工具调用继续执行
 *   'reject' — 拒绝本次工具调用，回灌失败 tool result，当前 turn 可继续
 *   'abort'  — 中止当前 turn，并进入会话停止流程
 */
export type AiAgentBeforeFunctionCallStatus = 'allow' | 'reject' | 'abort'

/**
 * 工具调用前置裁决指令。
 *
 * 字段：
 *   status                — 必填，allow / reject / abort 之一
 *   reason                — 可选，拒绝或中止原因
 *   fix                   — 可选，给 LLM 的修正建议，仅 reject/abort 失败结果使用
 *   finalAssistantMessage — 可选，abort 时发送给用户的最终消息
 *   releaseInstance       — 可选，abort 时是否释放模块实例资源
 */
export type AiAgentBeforeFunctionCallDirective = Readonly<{
  status: AiAgentBeforeFunctionCallStatus
  reason?: string
  fix?: string
  finalAssistantMessage?: string
  releaseInstance?: boolean
}>

/**
 * beforeFunctionCall 回调的入参。
 *
 * 继承 AiAgentRuntimeContext（moduleId / moduleInstanceId / instanceId），
 * 追加本次工具调用的工具名与已解析参数。该钩子只负责策略裁决，不执行工具。
 */
export type AiAgentBeforeFunctionCallOptions = AiAgentRuntimeContext & Readonly<{
  toolName: string
  args: AiJsonParams
}>

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 生命周期状态 — 工具循环的三种终止条件
// ═══════════════════════════════════════════════════════════════

/**
 * 生命周期状态三态：
 *   'continue' — 继续下一轮工具调用（默认）
 *   'complete' — 业务目标已达成，正常结束当前 turn
 *   'abort'    — 业务异常或用户取消，中止当前 turn
 */
export type AiAgentLifecycleStatus = 'continue' | 'complete' | 'abort'

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 生命周期指令 — 状态 + 可选的辅助信息
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
// 第 4 节 · 工具调用后回调入参
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
