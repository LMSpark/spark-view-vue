/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  AI HOST · 诊断事件发射器                                                     │
 * │  Diagnostic Stream Event Emitters                                            │
 * │                                                                              │
 * │  本模块负责在 Tool Loop 执行期间向外推送诊断性质的 stream 事件，                 │
 * │  用于前端实时展示 LLM 请求/响应、工具调用结果等调试信息。                         │
 * │                                                                              │
 * │  事件类型：                                                                   │
 * │    · llm-request  — LLM API 请求发出前（含 messages、tools 等）               │
 * │    · llm-append   — LLM 流式响应追加文本                                      │
 * │    · tool-result  — 工具调用完成，携带执行结果                                 │
 * │                                                                              │
 * │  路由机制：                                                                   │
 * │    每个事件携带 turnKey（kind + instanceId + turnId）和 streamKey。             │
 * │    前端根据 turnKey 聚合同一回合，再按 streamKey 分发细粒度流。                 │
 * │    eventModuleId 决定事件归属哪个模块（kind 级别），                             │
 * │    由 eventModuleIdFromProtocolCall() 从协议调用参数中提取。                    │
 * │                                                                              │
 * │  调用方：tool-loop-runner.ts 在执行 LLM 调用和工具回调时触发                    │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import { createAiHostStreamKey, createAiHostTurnKey } from '../business/business-scope'
import type { AiHostBusinessScope } from '../business/business-types'
import type { AiHostChatRequest, AiHostStreamEvent, AiHostTurnMeta } from '../chat/chat-types'
import { stringifyAiHostPayload } from './payload-codec'

type LlmDiagnosticEventInput = Readonly<{
  request: AiHostChatRequest
  scope: AiHostBusinessScope
  turn: AiHostTurnMeta
  type: 'llm-request' | 'llm-append'
  data: unknown
}>

type ToolResultEventInput = Readonly<{
  request: AiHostChatRequest
  scope: AiHostBusinessScope
  turn: AiHostTurnMeta
  eventModuleId: string
  data: unknown
}>

type ScopedStreamEventInput = Readonly<{
  scope: AiHostBusinessScope
  turnId: string
  eventModuleId: string
  type: AiHostStreamEvent['type']
  data: string
}>

/* -------------------------------------------------------------------------------
 * 一、LLM 诊断事件
 * -------------------------------------------------------------------------------
 * 在 LLM 请求发送前（llm-request）或流式响应追加时（llm-append）推送事件。
 * 前端可据此渲染"AI 正在思考"的实时状态。
 * ----------------------------------------------------------------------------- */

export function emitLlmDiagnosticEvent(input: LlmDiagnosticEventInput): void {
  const { request, scope, turn, type, data } = input
  // 将任意数据序列化为 JSON 字符串后包装为 turn stream 事件。
  request.onStreamEvent?.(createScopedStreamEvent({
    scope,
    turnId: turn.turnId,
    eventModuleId: 'llm',
    type,
    data: stringifyAiHostPayload(data),
  }))
}

/* -------------------------------------------------------------------------------
 * 二、工具结果事件
 * -------------------------------------------------------------------------------
 * 工具调用完成后推送结果事件。eventModuleId 标识事件所属的能力模块，
 * 前端据此将结果路由到对应模块的 UI 展示区。
 * ----------------------------------------------------------------------------- */

export function emitToolResultEvent(input: ToolResultEventInput): void {
  const { request, scope, turn, eventModuleId, data } = input
  request.onStreamEvent?.(createScopedStreamEvent({
    scope,
    turnId: turn.turnId,
    eventModuleId,
    type: 'tool-result',
    data: stringifyAiHostPayload(data),
  }))
}

/* -------------------------------------------------------------------------------
 * 三、协议调用 → 事件模块 ID 映射
 * -------------------------------------------------------------------------------
 * 根据 LLM 发起的工具调用名称和参数，推断该调用归属于哪个能力模块（kind）。
 *
 * 规则：
 *   · describeKind → 直接取 args.kind（被描述的目标 kind）
 *   · 其他工具     → 从 args.path 尾部提取 kind 名称（去除 [...] 过滤器）
 *   · 回退         → 使用 toolName 本身
 *
 * 典型示例：
 *   invokeAction(path="/root/Table[0]", ...)  →   eventModuleId = "Table"
 *   describeKind(kind="Table")                →   eventModuleId = "Table"
 *   listChildren(path="/root")                →   eventModuleId = "root"
 * ----------------------------------------------------------------------------- */

export function eventModuleIdFromProtocolCall(
  toolName: string,
  args: Readonly<Record<string, unknown>>,
): string {
  // describeKind 直接携带目标 kind 名称
  if (toolName === 'describeKind' && typeof args['kind'] === 'string' && args['kind'].trim().length > 0) {
    return args['kind']
  }
  // 其他工具尝试从 path 尾部提取 kind
  const path = typeof args['path'] === 'string' ? args['path'] : ''
  return kindFromPathTail(path) ?? toolName
}

/* -------------------------------------------------------------------------------
 * 四、内部辅助函数
 * ----------------------------------------------------------------------------- */

/**
 * 构造带作用域信息的 turn stream 事件。
 *
 * 每个事件携带两个关键字段：
 *   · turnKey   — 前端用于定位同一对话 turn
 *   · streamKey — 前端用于路由到 turn 内的细粒度流
 *   · scope     — 事件归属元数据（业务 ID、模块 ID、轮次 ID），便于前端分组展示
 */
function createScopedStreamEvent(input: ScopedStreamEventInput): AiHostStreamEvent {
  const { scope, turnId, eventModuleId, type, data } = input
  return {
    type,
    data,
    turnKey: createAiHostTurnKey(scope, turnId),
    streamKey: createAiHostStreamKey(scope, turnId, eventModuleId),
    scope: {
      businessRegistrationId: scope.businessRegistrationId,
      businessInstanceId: scope.businessInstanceId,
      eventModuleId,
      turnId,
    },
  }
}

/**
 * 从路径尾部提取 kind 名称，去除方括号过滤器。
 *
 * 转换示例：
 *   "/root/TabBar"               →  "TabBar"
 *   "/root/Table[0]"             →  "Table"       （去除索引）
 *   "/root/Form[type=main]"      →  "Form"        （去除属性过滤）
 *   "" 或 "/"                    →  null          （无尾部路径）
 */
function kindFromPathTail(path: string): string | null {
  const trimmed = path.trim()
  if (trimmed === '' || trimmed === '/') return null
  // 按 '/' 分割后取最后一个非空段
  const tail = trimmed.split('/').filter(Boolean).at(-1)
  if (tail === undefined) return null
  // 去除 [...] 方括号部分（索引或属性筛选）
  const bracketIndex = tail.indexOf('[')
  const kind = bracketIndex < 0 ? tail : tail.slice(0, bracketIndex)
  return kind.trim().length > 0 ? kind : null
}
