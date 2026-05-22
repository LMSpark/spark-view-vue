/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  AI HOST · 载荷编解码器                                                       │
 * │  Payload Codec — 序列化 / 反序列化 / 参数规整                                 │
 * │                                                                              │
 * │  本模块是 Tool Loop 的数据转换层，负责：                                        │
 * │    1. 将 LLM 返回的原始 JSON 字符串解析为类型安全的参数记录                      │
 * │    2. 将用户最新输入提取为传输层消息格式                                        │
 * │    3. 将任意 JS 值安全序列化为 JSON（处理 BigInt、循环引用等边界情况）           │
 * │                                                                              │
 * │  调用关系：                                                                   │
 * │    parseToolArgs        → tool-call-executor.ts  —— 解析 LLM 工具调用参数     │
 * │    toCurrentTurnMessages → tool-loop-runner.ts   —— 获取当前轮次用户消息       │
 * │    stringifyAiHostPayload → tool-call-executor.ts —— 序列化工具调用结果        │
 * │                           → diagnostic-events.ts —— 序列化诊断事件数据         │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import type { LlmJsonValue } from '../../schema'
import { ModuleKind } from '../../module-semantic'
import { latestUserInput } from '../business/business-scope'
import type { AiHostChatRequest } from '../chat/chat-types'
import type { AiHostTransportMessage } from '../transport/transport-types'

/* -------------------------------------------------------------------------------
 * 一、工具参数解析
 * -------------------------------------------------------------------------------
 * LLM 返回的工具调用参数是 JSON 字符串（function.arguments），
 * 本函数将其解析为 Record<string, LlmJsonValue> 以便后续校验和执行。
 *
 * 容错策略：
 *   · 空字符串 / undefined → 返回 {}（非异常，部分工具无参数）
 *   · JSON 解析失败       → 返回 {}（静默容错，由后续 schema 校验捕获）
 * ----------------------------------------------------------------------------- */

export function parseToolArgs(raw: string | undefined): Readonly<Record<string, LlmJsonValue>> {
  if (raw === undefined || raw.trim() === '') return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return toProtocolArgs(parsed)
  } catch {
    return {}
  }
}

/* -------------------------------------------------------------------------------
 * 二、当前轮次消息提取
 * -------------------------------------------------------------------------------
 * 从请求中提取最新一条用户输入，包装为传输层消息数组。
 * 用于 Tool Loop 每轮开始时构建发送给 LLM 的消息列表。
 *
 * 返回空数组的场景：用户输入为空字符串（如纯系统触发）
 * ----------------------------------------------------------------------------- */

export function toCurrentTurnMessages(request: AiHostChatRequest): AiHostTransportMessage[] {
  const latestUser = latestUserInput(request)
  return latestUser === ''
    ? []
    : [{ role: 'user', content: latestUser }]
}

/* -------------------------------------------------------------------------------
 * 三、安全 JSON 序列化
 * -------------------------------------------------------------------------------
 * 将任意 JS 值序列化为 JSON 字符串，处理标准 JSON.stringify 无法处理的边界情况：
 *
 *   · BigInt    → 转为十进制字符串（JSON 不支持 bigint 原生类型）
 *   · 循环引用  → 替换为 "[Circular]"（防止栈溢出）
 *
 * 使用 WeakSet 跟踪已访问对象，确保同一对象多次出现时只标记一次。
 * ----------------------------------------------------------------------------- */

export function stringifyAiHostPayload(data: unknown): string {
  const seen = new WeakSet<object>()
  const text = JSON.stringify(data, (_key, item: unknown) => {
    // BigInt 无法被 JSON 原生序列化 → 转字符串
    if (typeof item === 'bigint') return item.toString()
    // 循环引用检测 → 标记后跳过
    if (typeof item === 'object' && item !== null) {
      if (seen.has(item)) return '[Circular]'
      seen.add(item)
    }
    return item
  })
  return text
}

/* -------------------------------------------------------------------------------
 * 四、内部辅助：值规整
 * -------------------------------------------------------------------------------
 * 将 JSON.parse 产出的 unknown 值规整为 LlmJsonValue 记录。
 *
 * 规整规则：
 *   · null / undefined / 非对象 / 数组 → 返回 {}（无效参数整体视为空）
 *   · 每个字段通过 ModuleKind.coerceJsonValue 逐项转换
 *   · 无法规整的字段（coerceJsonValue 返回 undefined）自动丢弃
 * ----------------------------------------------------------------------------- */

function toProtocolArgs(value: unknown): Readonly<Record<string, LlmJsonValue>> {
  // 只接受纯对象（排除 null、数组、原始值）
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, LlmJsonValue> = {}
  for (const [key, raw] of Object.entries(value)) {
    const coerced = ModuleKind.coerceJsonValue(raw)
    if (coerced !== undefined) out[key] = coerced
  }
  return out
}
