/**
 * 统一 @@ 协议解析原语
 */

import type {
  ProtocolBlock,
  ProtocolBlockFilter,
  ProposalProtocolBlock,
  TokenUsage,
  UiConfirmPayload,
} from './types'

/** 通用块：@@type:name ... @@end（多行模式） */
const BLOCK_RE = /^@@(\w+):([\w-]+)\s*$([\s\S]*?)^@@end\s*$/gm

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

/**
 * 从文本中提取第一个 JSON 对象（正向括号深度匹配，容错允许 JSON 前后有非 JSON 文本）
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

/**
 * 从文本中提取 @@ui:confirm-questions 块并解析 JSON 负载。
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

function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trim()
}
