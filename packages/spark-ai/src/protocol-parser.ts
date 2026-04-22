/**
 * AI 对话辅助解析工具。
 */

import type { TokenUsage } from './types'

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

