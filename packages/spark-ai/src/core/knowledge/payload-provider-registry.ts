import type {
  KnowledgePayloadGuide,
  KnowledgePayloadProvider,
  KnowledgePayloadQueryFilter,
  KnowledgePayloadSummary,
} from '../protocol/knowledge-payload-contracts'

/**
 * 知识负载提供者注册表。
 *
 * 功能定位：
 * - 将不同业务域的知识源统一挂到 `payloadRef` 命名空间下。
 * - 为 LLM 工具或 UI 提供“先查摘要、再取指南”的稳定入口。
 * - 保持内存级注册，不承担远端加载、缓存失效或权限判断。
 */
export class KnowledgePayloadRegistry {
  /** 默认全局注册表，适合应用启动时集中注册共享 provider。 */
  static readonly defaultRegistry = new KnowledgePayloadRegistry()

  /** 向默认全局注册表注册 provider 的便捷入口。 */
  static register(provider: KnowledgePayloadProvider): void {
    KnowledgePayloadRegistry.defaultRegistry.register(provider)
  }

  private readonly providers = new Map<string, KnowledgePayloadProvider>()

  /** 注册一个 provider；同一 payloadRef 只允许注册一次，避免知识来源歧义。 */
  register(provider: KnowledgePayloadProvider): void {
    if (this.providers.has(provider.payloadRef)) {
      throw new Error(`Duplicate knowledge payload provider: ${provider.payloadRef}`)
    }
    this.providers.set(provider.payloadRef, provider)
  }

  /** 按 payloadRef 获取 provider；未知时返回 null，适合探测式调用。 */
  getProvider(payloadRef: string): KnowledgePayloadProvider | null {
    return this.providers.get(payloadRef) ?? null
  }

  /** 查询某个 provider 暴露的知识摘要；未知 payloadRef 会 fail-fast。 */
  queryPayloads(payloadRef: string, filter?: KnowledgePayloadQueryFilter): readonly KnowledgePayloadSummary[] {
    return this.requireProvider(payloadRef).queryPayloads(filter)
  }

  /** 拉取单条知识指南；provider 存在但 key 不存在时返回 null。 */
  guidePayload(payloadRef: string, key: string): KnowledgePayloadGuide | null {
    return this.requireProvider(payloadRef).guidePayload(key)
  }

  /** 按注册时序列出 provider，便于调试或构建知识目录。 */
  listProviders(): readonly KnowledgePayloadProvider[] {
    return Array.from(this.providers.values())
  }

  /** 内部强制获取：业务调用路径里未知 provider 属于配置错误，应直接抛出。 */
  private requireProvider(payloadRef: string): KnowledgePayloadProvider {
    const provider = this.providers.get(payloadRef)
    if (provider === undefined) {
      throw new Error(`Unknown knowledge payload provider: ${payloadRef}`)
    }
    return provider
  }
}
