/**
 * 统一 @@ 协议解析原语
 *
 * SPARK AI 系统使用两种 @@ 定界协议：
 *
 * 1. **通用块协议** — `@@type:name\n...\n@@end`（proposal / query / review / error）
 *
 * 2. **工具块协议** — `@@type:action#id\n...\n@@end`（tool calling）
 *    由 SapChatPanel / AiChatPanel 消费
 *
 * 本模块是这两种协议的**唯一解析入口**，其他模块不应自行编写正则。
 */

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export type ProtocolRole = 'user' | 'assistant' | 'system'

export interface ProtocolMessage {
  role: ProtocolRole
  content: string
}

/** 通用协议块 — @@type:name ... @@end */
export interface ProtocolBlock {
  /** 块类型：proposal / query / review / error / ... */
  type: string
  /** 块名称（kebab-case）：data-model / component-props / ... */
  name: string
  /** 块体内容（@@行和@@end之间的文本） */
  payload: string
  /** 原始匹配文本（含定界符） */
  raw: string
}

/** 工具协议块 — @@type:action#id ... @@end */
export interface ToolProtocolBlock {
  /** 工具类型：tool / sap / ... */
  type: string
  /** 工具动作（允许点号分隔）：page.auto / db.query / ... */
  action: string
  /** 唯一标识符 */
  id: string
  /** 块体内容 */
  body: string
  /** 原始匹配文本 */
  raw: string
}

/** 提案协议块 — 从通用块中提取的 proposal 子集（便捷类型） */
export interface ProposalProtocolBlock {
  /** 提案名称（= ProtocolBlock.name） */
  name: string
  /** 提案体内容（= ProtocolBlock.payload） */
  body: string
  /** 原始匹配文本 */
  raw: string
}

/** Token 用量统计（LLM 返回的标准化格式） */
export interface TokenUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  /** DeepSeek 上下文缓存命中 */
  promptCacheHitTokens?: number
  promptCacheMissTokens?: number
}

/** SSE 流式事件回调（通用，可用于任何 SSE 端点） */
export interface StreamCallbacks {
  /** LLM 正文内容增量 */
  onDelta?: (text: string) => void
  /** DeepSeek 推理过程增量 */
  onReasoning?: (text: string) => void
  /** 阶段进度事件 */
  onPhase?: (phase: number, status: string, message: string) => void
  /** token 用量统计 */
  onUsage?: (usage: Record<string, unknown>) => void
  /** 错误事件 */
  onError?: (error: string) => void
}

// ── 过滤器 ────────────────────────────────────────────────────────────────────

export interface ProtocolBlockFilter {
  /** 仅匹配指定类型（如 'proposal'） */
  types?: string[]
  /** 仅匹配指定名称 */
  names?: string[]
}

export interface ToolBlockFilter {
  /** 仅匹配指定类型 */
  type?: string
  /** 仅匹配指定类型集合 */
  types?: string[]
  /** 仅匹配指定动作 */
  actions?: string[]
}

// ── 正则常量 ──────────────────────────────────────────────────────────────────

/** 通用块：@@type:name ... @@end（多行模式） */
const BLOCK_RE = /^@@(\w+):([\w-]+)\s*$([\s\S]*?)^@@end\s*$/gm

/** 工具块：@@type:action#id ... @@end（允许 action 含点号） */
const TOOL_BLOCK_RE = /@@(\w+):([\w.]+)#([\w-]+)\n([\s\S]*?)\n@@end/g

// ── 通用块解析 ────────────────────────────────────────────────────────────────

/**
 * 从文本中提取所有 @@type:name 通用协议块
 */
export function extractBlocks(text: string, filter?: ProtocolBlockFilter): ProtocolBlock[] {
  const blocks: ProtocolBlock[] = []
  BLOCK_RE.lastIndex = 0

  let m: RegExpExecArray | null
  while ((m = BLOCK_RE.exec(text)) !== null) {
    const block: ProtocolBlock = {
      type: m[1] ?? '',
      name: m[2] ?? '',
      payload: (m[3] ?? '').trim(),
      raw: m[0],
    }
    if (filter?.types !== undefined && !filter.types.includes(block.type)) continue
    if (filter?.names !== undefined && !filter.names.includes(block.name)) continue
    blocks.push(block)
  }

  return blocks
}

/**
 * 从文本中去除匹配的通用协议块
 */
export function stripBlocks(text: string, filter?: ProtocolBlockFilter): string {
  BLOCK_RE.lastIndex = 0
  const stripped = text.replace(BLOCK_RE, (raw: string, type: string, name: string) => {
    if (filter?.types !== undefined && !filter.types.includes(type)) return raw
    if (filter?.names !== undefined && !filter.names.includes(name)) return raw
    return ''
  })
  return collapseBlankLines(stripped)
}

// ── 提案块解析（通用块的便捷子集） ────────────────────────────────────────────

/**
 * 提取提案协议块（type='proposal' 的通用块）
 */
export function extractProposalBlocks(text: string, filter?: { names?: string[] }): ProposalProtocolBlock[] {
  const blocks = extractBlocks(text, {
    types: ['proposal'],
    ...(filter?.names !== undefined ? { names: filter.names } : {}),
  })
  return blocks.map(b => ({ name: b.name, body: b.payload, raw: b.raw }))
}

/**
 * 从文本中去除提案协议块
 */
export function stripProposalBlocks(text: string, filter?: { names?: string[] }): string {
  return stripBlocks(text, {
    types: ['proposal'],
    ...(filter?.names !== undefined ? { names: filter.names } : {}),
  })
}

// ── 工具块解析 ─────────────────────────────────────────────────────────────────

/**
 * 提取工具协议块（@@type:action#id ... @@end）
 */
export function extractToolBlocks(text: string, filter?: ToolBlockFilter): ToolProtocolBlock[] {
  const blocks: ToolProtocolBlock[] = []
  TOOL_BLOCK_RE.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = TOOL_BLOCK_RE.exec(text)) !== null) {
    const block: ToolProtocolBlock = {
      type: match[1] ?? '',
      action: match[2] ?? '',
      id: match[3] ?? '',
      body: match[4] ?? '',
      raw: match[0],
    }
    if (filter?.type !== undefined && block.type !== filter.type) continue
    if (filter?.types !== undefined && !filter.types.includes(block.type)) continue
    if (filter?.actions !== undefined && !filter.actions.includes(block.action)) continue
    blocks.push(block)
  }

  return blocks
}

/**
 * 从文本中去除匹配的工具协议块
 */
export function stripToolBlocks(text: string, filter?: ToolBlockFilter): string {
  TOOL_BLOCK_RE.lastIndex = 0
  const stripped = text.replace(TOOL_BLOCK_RE, (raw: string, type: string, action: string) => {
    if (filter?.type !== undefined && type !== filter.type) return raw
    if (filter?.types !== undefined && !filter.types.includes(type)) return raw
    if (filter?.actions !== undefined && !filter.actions.includes(action)) return raw
    return ''
  })
  return collapseBlankLines(stripped)
}

/**
 * 解析工具块的 JSON body
 */
export function parseToolPayload<T>(block: ToolProtocolBlock): T | null {
  try {
    return JSON.parse(block.body) as T
  } catch {
    return null
  }
}

// ── 通用工具 ──────────────────────────────────────────────────────────────────

/**
 * 从文本中提取第一个 JSON 对象（正向括号深度匹配，容错允许 JSON 前后有非 JSON 文本）
 *
 * 使用括号计数而非 lastIndexOf，避免多个 JSON 对象共存时跨对象误匹配。
 */
export function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]

    if (escape) {
      escape = false
      continue
    }

    if (ch === '\\' && inString) {
      escape = true
      continue
    }

    if (ch === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }

  // 未找到匹配的闭合括号 → 回退到 lastIndexOf（不完整 JSON 容错）
  const end = text.lastIndexOf('}')
  if (end <= start) return null
  return text.slice(start, end + 1)
}

/**
 * 从 LLM 原始 usage 对象解析为标准化 TokenUsage
 */
export function parseTokenUsage(raw: Record<string, unknown>): TokenUsage {
  const usage: TokenUsage = {}
  if (typeof raw['prompt_tokens'] === 'number') usage.promptTokens = raw['prompt_tokens']
  if (typeof raw['completion_tokens'] === 'number') usage.completionTokens = raw['completion_tokens']
  if (typeof raw['total_tokens'] === 'number') usage.totalTokens = raw['total_tokens']
  if (typeof raw['prompt_cache_hit_tokens'] === 'number') usage.promptCacheHitTokens = raw['prompt_cache_hit_tokens']
  if (typeof raw['prompt_cache_miss_tokens'] === 'number') usage.promptCacheMissTokens = raw['prompt_cache_miss_tokens']
  return usage
}

/**
 * 将 TokenUsage 格式化为可读字符串（用于 UI 展示）
 */
export function formatTokenUsage(usage: TokenUsage): string {
  const parts: string[] = []
  if (usage.totalTokens !== undefined) parts.push(`${usage.totalTokens} tokens`)
  if (usage.promptCacheHitTokens !== undefined && usage.promptCacheHitTokens > 0) {
    parts.push(`缓存命中 ${usage.promptCacheHitTokens}`)
  }
  return parts.join(' · ')
}

// ── 流式清理 ──────────────────────────────────────────────────────────────────

/** 匹配流式中途未闭合的 @@ 块（缺少 @@end） */
const UNCLOSED_BLOCK_RE = /^@@\w+:[\w-]+\s*$[\s\S]*$/m

/**
 * 去除协议块 + 流式未闭合块（用于 SSE 实时渲染中清理残留标记）
 */
export function stripBlocksWithUnclosed(text: string, filter?: ProtocolBlockFilter): string {
  const stripped = stripBlocks(text, filter)
  return stripped
    .replace(UNCLOSED_BLOCK_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── UI 交互块（@@ui:confirm-questions）──────────────────────────────────────

/** 单个选项 */
export interface UiConfirmOption {
  key: string
  label: string
  description?: string
}

/** 单个确认问题 */
export interface UiConfirmQuestion {
  id: string
  text: string
  /** single = 单选（radio），multi = 多选（checkbox） */
  type: 'single' | 'multi'
  options: UiConfirmOption[]
}

/** @@ui:confirm-questions 块的 JSON 负载 */
export interface UiConfirmPayload {
  title?: string
  questions: UiConfirmQuestion[]
}

/**
 * 从文本中提取 @@ui:confirm-questions 块并解析 JSON 负载。
 * 返回所有合法解析的 payload（通常只有一个）。
 */
export function extractUiConfirmBlocks(text: string): UiConfirmPayload[] {
  const blocks = extractBlocks(text, { types: ['ui'], names: ['confirm-questions'] })
  const results: UiConfirmPayload[] = []
  for (const b of blocks) {
    try {
      const payload = JSON.parse(b.payload) as UiConfirmPayload
      if (Array.isArray(payload.questions)) results.push(payload)
    } catch { /* skip malformed */ }
  }
  return results
}

/**
 * 从文本中去除所有 @@ui:* 块
 */
export function stripUiBlocks(text: string): string {
  return stripBlocks(text, { types: ['ui'] })
}

// ── 内部辅助 ──────────────────────────────────────────────────────────────────

function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trim()
}
