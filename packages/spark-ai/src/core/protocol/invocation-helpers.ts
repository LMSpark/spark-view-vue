/**
 * LLM 调用协议辅助工具。
 *
 * 这里放置跨 provider / adapter 复用的轻量协议能力：
 * - 标准化消息角色和 token usage 字段。
 * - 解析 runtime action 地址。
 * - 从模型输出文本中抽取 JSON 对象。
 *
 * 它不依赖具体模型 SDK，也不直接执行函数。
 */

/** 协议层支持的消息角色。 */
export type ProtocolRole = 'user' | 'assistant' | 'system'

/** 发送给 LLM 或从 LLM 读取的基础消息结构。 */
export interface ProtocolMessage {
  /** 消息角色。 */
  role: ProtocolRole
  /** 纯文本内容；结构化协议块仍以字符串形式承载。 */
  content: string
}

/** 各模型 SDK usage 字段归一化后的 token 统计。 */
export interface TokenUsage {
  /** prompt 消耗 token 数。 */
  promptTokens?: number
  /** completion 消耗 token 数。 */
  completionTokens?: number
  /** 总 token 数。 */
  totalTokens?: number
  /** 命中 prompt cache 的 token 数。 */
  promptCacheHitTokens?: number
  /** 未命中 prompt cache 的 token 数。 */
  promptCacheMissTokens?: number
}

/** 流式响应回调集合，由上层 adapter 按模型事件触发。 */
export interface StreamCallbacks {
  /** 普通文本增量。 */
  onDelta?: (text: string) => void
  /** 推理内容增量。 */
  onReasoning?: (text: string) => void
  /** 阶段进度回调，例如规划、执行、总结。 */
  onPhase?: (phase: number, status: string, message: string) => void
  /** 原始或归一化 usage 回调。 */
  onUsage?: (usage: Record<string, unknown>) => void
  /** 流式过程中的错误文本。 */
  onError?: (error: string) => void
}

/**
 * action 地址三段拆解结果。
 * 输入语义：规范 action，格式为 business@module@function。
 * 调用时机：协议层或运行时需要按段访问 action 各部分时使用。
 * 所有字段只读：解析结果不应被外部修改。
 */
export interface ActionAddressParts {
  readonly business: string
  readonly module: string
  readonly function: string
}

export class AiInvocationProtocol {
  private constructor() {}

  /**
   * 将 action 字符串拆解为 { business, module, function }。
   * 输入语义：规范 action，格式必须为 业务@模块@函数 三段。
   * 输出语义：三段拆解；格式不合法则 fail-fast 抛出。
   * 调用时机：协议层解析 action 地址时统一调用此方法，禁止在各业务层自行 split。
   */
  static parseActionAddress(action: string): ActionAddressParts {
    const parts = action.split('@')
    if (parts.length !== 3 || parts.some(part => part.trim().length === 0)) {
      throw new Error(`非法 action 地址: ${action}，必须使用 业务@模块@函数`)
    }
    return { business: parts[0] ?? '', module: parts[1] ?? '', function: parts[2] ?? '' }
  }

  /** 将 unknown 错误统一转换为可记录、可返回给调用方的字符串。 */
  static toErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
  }

  /**
   * 从文本中提取第一个完整 JSON 对象（括号深度匹配，容错前后有非 JSON 文本）。
   * 找不到时 fail-fast 返回 null，不抛出。
   */
  static extractFirstJsonObject(text: string): string | null {
    const start = text.indexOf('{')
    if (start === -1) return null

    let depth = 0
    let inString = false
    let escape = false

    for (let i = start; i < text.length; i++) {
      const ch = text[i]
      if (ch === undefined) break

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
  static parseTokenUsage(raw: Record<string, unknown>): TokenUsage {
    const usage: TokenUsage = {}
    if (typeof raw['prompt_tokens'] === 'number') usage.promptTokens = raw['prompt_tokens']
    if (typeof raw['completion_tokens'] === 'number') usage.completionTokens = raw['completion_tokens']
    if (typeof raw['total_tokens'] === 'number') usage.totalTokens = raw['total_tokens']
    if (typeof raw['prompt_cache_hit_tokens'] === 'number') usage.promptCacheHitTokens = raw['prompt_cache_hit_tokens']
    if (typeof raw['prompt_cache_miss_tokens'] === 'number') usage.promptCacheMissTokens = raw['prompt_cache_miss_tokens']
    return usage
  }

  /** 将 TokenUsage 格式化为可读字符串（用于 UI 展示）。 */
  static formatTokenUsage(usage: TokenUsage): string {
    const parts: string[] = []
    if (usage.totalTokens !== undefined) parts.push(`${usage.totalTokens} tokens`)
    if (usage.promptCacheHitTokens !== undefined && usage.promptCacheHitTokens > 0) {
      parts.push(`缓存命中 ${usage.promptCacheHitTokens}`)
    }
    return parts.join(' · ')
  }
}
