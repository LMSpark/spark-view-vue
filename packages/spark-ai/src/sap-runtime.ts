/**
 * SAP Runtime Bridge — 协议解析 → Stills 调度 → 响应格式化
 *
 * 这是 SAP 协议的运行时桥接层，将 AI 输出的 @@tool 块自动路由到 Stills 引擎：
 *
 *   Raw AI text
 *     ↓ extractToolBlocks()
 *   ToolProtocolBlock[]
 *     ↓ parseToolPayload()
 *   parsed params
 *     ↓ executeStill(action, params, session, id)
 *   StillResult
 *     ↓ formatResponseBlock()
 *   @@result / @@error text
 *
 * 设计原则：
 * - 纯函数管道，无副作用（除 session 突变由 dispatcher 负责）
 * - 一次调用处理一个块（遵循 SAP 协议"一轮一块"规则）
 * - 完整错误链路：解析失败 / guard 拒绝 / 验证失败 / 执行失败均有结构化响应
 */

import type { ToolProtocolBlock } from './protocol'
import type { IStillSession, StillResult } from './stills/types'
import { extractToolBlocks, parseToolPayload } from './protocol'
import { executeStill } from './stills/dispatcher'

// ── Types ─────────────────────────────────────────────────────────────────────

/** 单个块的调度结果 */
export interface SapDispatchResult {
  /** 原始协议块 */
  block: ToolProtocolBlock
  /** Stills 执行结果 */
  result: StillResult
  /** 格式化的响应文本（@@result / @@error 块） */
  responseText: string
}

/** processSapBlocks 的返回值 */
export interface SapProcessingResult {
  /** 成功调度的块结果 */
  dispatched: SapDispatchResult[]
  /** AI 文本中去除协议块后的自然语言部分 */
  naturalText: string
  /** 所有响应块拼接的完整响应文本 */
  fullResponse: string
}

/** 允许的 SAP 块类型（AI 可以发送的） */
const ALLOWED_TYPES = new Set(['describe', 'request'])

// ── 格式化 ────────────────────────────────────────────────────────────────────

/**
 * 将 StillResult 格式化为 SAP 协议响应块
 */
export function formatResponseBlock(action: string, reqId: string, result: StillResult): string {
  if (result.ok) {
    const body = JSON.stringify(result.data, null, 2)
    return `@@result:${action}#${reqId}\n${body}\n@@end`
  }
  const errorBody = JSON.stringify({ code: result.code, msg: result.msg, fix: result.fix }, null, 2)
  return `@@error:${action}#${reqId}\n${errorBody}\n@@end`
}

// ── 单块调度 ──────────────────────────────────────────────────────────────────

/**
 * 调度单个 ToolProtocolBlock 到 Stills 引擎
 */
export function dispatchBlock(block: ToolProtocolBlock, session: IStillSession): SapDispatchResult {
  // 1. 类型检查
  if (!ALLOWED_TYPES.has(block.type)) {
    const result: StillResult = {
      ok: false,
      code: 'INVALID_BLOCK_TYPE',
      msg: `不支持的块类型: ${block.type}，只允许 describe / request`,
      fix: '使用 @@describe:action#id 或 @@request:action#id',
    }
    return { block, result, responseText: formatResponseBlock(block.action, block.id, result) }
  }

  // 2. 解析 JSON body
  const params = parseToolPayload<Record<string, unknown>>(block)
  if (params === null) {
    const result: StillResult = {
      ok: false,
      code: 'INVALID_JSON',
      msg: `JSON 解析失败: ${block.body.slice(0, 100)}`,
      fix: '确保块体是合法 JSON 对象',
    }
    return { block, result, responseText: formatResponseBlock(block.action, block.id, result) }
  }

  // 3. 调度到 Stills 引擎
  const result = executeStill(block.action, params, session, block.id)
  return { block, result, responseText: formatResponseBlock(block.action, block.id, result) }
}

// ── 批量处理 ──────────────────────────────────────────────────────────────────

/**
 * 从 AI 原始文本中提取 SAP 协议块并逐个调度
 *
 * 遵循 SAP 协议"一轮一块"规则：
 * - 默认只处理第一个块
 * - 多余的块会被忽略（不调度，不报错）
 * - 可通过 maxBlocks 选项放宽限制（测试/批量场景）
 *
 * @param rawText  AI 原始输出文本（可能包含自然语言 + 协议块）
 * @param session  当前设计会话
 * @param options  处理选项
 * @returns 处理结果（调度结果 + 自然语言 + 响应文本）
 */
export function processSapBlocks(
  rawText: string,
  session: IStillSession,
  options?: { maxBlocks?: number },
): SapProcessingResult {
  const maxBlocks = options?.maxBlocks ?? 1

  // 提取 SAP 工具块（describe / request）
  const allBlocks = extractToolBlocks(rawText, { types: ['describe', 'request'] })

  // 按一轮一块规则截断
  const blocksToProcess = allBlocks.slice(0, maxBlocks)

  // 调度
  const dispatched = blocksToProcess.map(block => dispatchBlock(block, session))

  // 自然语言部分：去除所有协议块
  let naturalText = rawText
  for (const block of allBlocks) {
    naturalText = naturalText.replace(block.raw, '')
  }
  naturalText = naturalText.replace(/\n{3,}/g, '\n\n').trim()

  // 拼接响应
  const fullResponse = dispatched.map(d => d.responseText).join('\n\n')

  return { dispatched, naturalText, fullResponse }
}
