export type ProtocolRole = 'user' | 'assistant' | 'system'

export interface ProtocolMessage {
  role: ProtocolRole
  content: string
}

export interface TokenUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  promptCacheHitTokens?: number
  promptCacheMissTokens?: number
}

export interface StreamCallbacks {
  onDelta?: (text: string) => void
  onReasoning?: (text: string) => void
  onPhase?: (phase: number, status: string, message: string) => void
  onUsage?: (usage: Record<string, unknown>) => void
  onError?: (error: string) => void
}

/**
 * action 地址三段拆解结果。
 * 输入语义：规范 action，格式为 business@module@function。
 * 调用时机：协议层或运行时需要按段访问 action 各部分时使用。
 */
export interface ActionAddressParts {
  business: string
  module: string
  function: string
}

/**
 * 将 action 字符串拆解为 { business, module, function }。
 * 输入语义：规范 action，格式必须为 业务@模块@函数 三段。
 * 输出语义：三段拆解；格式不合法则 fail-fast 抛出。
 * 调用时机：协议层解析 action 地址时统一调用此函数，禁止在各业务层自行 split。
 */
export function parseActionAddress(action: string): ActionAddressParts {
  const parts = action.split('@')
  if (parts.length !== 3 || parts.some(part => part.trim().length === 0)) {
    throw new Error(`非法 action 地址: ${action}，必须使用 业务@模块@函数`)
  }
  return { business: parts[0] ?? '', module: parts[1] ?? '', function: parts[2] ?? '' }
}

export function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * 从文本中提取第一个完整 JSON 对象（括号深度匹配，容错前后有非 JSON 文本）。
 * 找不到时 fail-fast 返回 null，不抛出。
 */
export function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]

    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue

    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }

  return null
}

/** 将 LLM 原始 usage 对象归一化为标准 TokenUsage。 */
export function parseTokenUsage(raw: Record<string, unknown>): TokenUsage {
  const usage: TokenUsage = {}
  if (typeof raw['prompt_tokens'] === 'number') usage.promptTokens = raw['prompt_tokens']
  if (typeof raw['completion_tokens'] === 'number') usage.completionTokens = raw['completion_tokens']
  if (typeof raw['total_tokens'] === 'number') usage.totalTokens = raw['total_tokens']
  if (typeof raw['prompt_cache_hit_tokens'] === 'number') usage.promptCacheHitTokens = raw['prompt_cache_hit_tokens']
  if (typeof raw['prompt_cache_miss_tokens'] === 'number') usage.promptCacheMissTokens = raw['prompt_cache_miss_tokens']
  return usage
}

/** 将 TokenUsage 格式化为可读字符串（用于 UI 展示）。 */
export function formatTokenUsage(usage: TokenUsage): string {
  const parts: string[] = []
  if (usage.totalTokens !== undefined) parts.push(`${usage.totalTokens} tokens`)
  if (usage.promptCacheHitTokens !== undefined && usage.promptCacheHitTokens > 0) {
    parts.push(`缓存命中 ${usage.promptCacheHitTokens}`)
  }
  return parts.join(' · ')
}
