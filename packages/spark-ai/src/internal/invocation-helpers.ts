/**
 * LLM 调用协议辅助工具。
 *
 * 这里放置跨 provider / adapter 复用的轻量协议能力：
 * - 标准化消息角色和 token usage 字段。
 * - 解析 runtime action 路径。
 * - 从模型输出文本中抽取 JSON 对象。
 *
 * 它不依赖具体模型 SDK，也不直接执行函数。
 */

/** 各模型 SDK usage 字段归一化后的 token 统计。 */
export type TokenUsage = {
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

/**
 * action 路径拆解结果。
 * 输入语义：规范 action，首选格式为 instance/child@module@actionName。
 * 兼容旧格式 module/.../function，仅用于历史调用数据迁移。
 * 调用时机：协议层或运行时需要按段访问 action 各部分时使用。
 * 所有字段只读：解析结果不应被外部修改。
 */
export type ActionPathParts = {
  readonly format: 'instance' | 'legacy'
  readonly instanceIds: readonly string[]
  readonly moduleIds: readonly string[]
  readonly modulePath: string
  readonly moduleId: string
  readonly function: string
}

export class AiInvocationProtocol {
  private constructor() {}

  /**
   * 将 action 字符串拆解为模块路径和函数 ID。
   * 输入语义：
   * - LLM-facing 新格式：rootInstanceId/childInstanceId@moduleId@actionName。
   * - 兼容旧格式：module/.../function，仅用于历史调用数据迁移。
   * 输出语义：模块路径和函数 ID；格式不合法则 fail-fast 抛出。
   * 调用时机：协议层解析 action 路径时统一调用此方法，避免调用方自行 split。
   */
  static parseActionPath(action: string): ActionPathParts {
    if (action.includes('@')) return AiInvocationProtocol.parseInstanceActionPath(action)

    const parts = action.split('/')
    if (parts.length < 2 || parts.some(part => part.trim().length === 0)) {
      throw new Error(`非法 action 路径: ${action}，必须使用 rootInstance[/childInstance]@module@actionName`)
    }
    if (parts.some(part => part.includes('@'))) {
      throw new Error(`非法 action 路径: ${action}，模块或函数 ID 不能包含 @`)
    }
    const functionId = parts[parts.length - 1] ?? ''
    const moduleIds = parts.slice(0, -1)
    return {
      format: 'legacy',
      instanceIds: [],
      moduleIds,
      modulePath: moduleIds.join('/'),
      moduleId: moduleIds[moduleIds.length - 1] ?? '',
      function: functionId,
    }
  }

  /** 容错解析 action；非法 action 返回 null，供宿主层避免重复 try/catch。 */
  static tryParseActionPath(action: string): ActionPathParts | null {
    try {
      return AiInvocationProtocol.parseActionPath(action)
    } catch {
      return null
    }
  }

  /** 解析 LLM-facing action：rootInstance[/childInstance]@moduleId@actionName。实例路径段允许 URI 编码。 */
  private static parseInstanceActionPath(action: string): ActionPathParts {
    const parts = action.split('@')
    if (parts.length !== 3) {
      throw new Error(`非法 action 路径: ${action}，必须使用 rootInstance[/childInstance]@module@actionName`)
    }
    const [instancePath = '', moduleId = '', functionId = ''] = parts
    const encodedInstanceIds = instancePath.split('/')
    if (encodedInstanceIds.length === 0 || encodedInstanceIds.some(part => part.trim().length === 0)) {
      throw new Error(`非法 action 路径: ${action}，实例路径不能为空`)
    }
    if (encodedInstanceIds.some(part => part.includes('@'))) {
      throw new Error(`非法 action 路径: ${action}，实例 ID 不能包含 @`)
    }
    const instanceIds = encodedInstanceIds.map((part) => AiInvocationProtocol.decodeActionSegment(part, action))
    if (moduleId.trim().length === 0 || functionId.trim().length === 0) {
      throw new Error(`非法 action 路径: ${action}，模块名和函数名不能为空`)
    }
    if (moduleId.includes('@') || moduleId.includes('/') || functionId.includes('@') || functionId.includes('/')) {
      throw new Error(`非法 action 路径: ${action}，模块名或函数名包含非法字符`)
    }
    return {
      format: 'instance',
      instanceIds,
      moduleIds: [moduleId],
      modulePath: moduleId,
      moduleId,
      function: functionId,
    }
  }

  /** 解码 action 实例路径段；编码让模块实例 ID 可以包含 `/` 或 `@` 而不破坏路径语法。 */
  private static decodeActionSegment(segment: string, action: string): string {
    try {
      const decoded = decodeURIComponent(segment)
      if (decoded.trim().length === 0) {
        throw new Error('decoded segment is empty')
      }
      return decoded
    } catch {
      throw new Error(`非法 action 路径: ${action}，实例路径段不是合法 URI 编码`)
    }
  }

  /** 将 unknown 错误统一转换为可记录、可返回给调用方的字符串。 */
  static toErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
  }

  /** 将任意函数执行结果转为 tool result 字符串；只做序列化，不解释领域字段。 */
  static stringifyFunctionResult(result: unknown): string {
    if (typeof result === 'string') return result
    try {
      const seen = new WeakSet<object>()
      const serialized: unknown = JSON.stringify(result, (_key, value: unknown) => {
        if (typeof value === 'bigint') return value.toString()
        if (typeof value !== 'object' || value === null) return value
        if (seen.has(value)) return '[Circular]'
        seen.add(value)
        return value
      })
      return typeof serialized === 'string' ? serialized : String(result)
    } catch {
      return String(result)
    }
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
