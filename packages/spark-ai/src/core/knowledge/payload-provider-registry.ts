import type {
  KnowledgePayloadGuide,
  KnowledgePayloadProvider,
  KnowledgePayloadQueryFilter,
  KnowledgePayloadSummary,
} from '../protocol/knowledge-payload-contracts'

export class KnowledgePayloadProviderRegistry {
  private readonly providers = new Map<string, KnowledgePayloadProvider>()

  register(provider: KnowledgePayloadProvider): void {
    if (this.providers.has(provider.payloadRef)) {
      throw new Error(`Duplicate knowledge payload provider: ${provider.payloadRef}`)
    }
    this.providers.set(provider.payloadRef, provider)
  }

  getProvider(payloadRef: string): KnowledgePayloadProvider | null {
    return this.providers.get(payloadRef) ?? null
  }

  queryPayloads(payloadRef: string, filter?: KnowledgePayloadQueryFilter): readonly KnowledgePayloadSummary[] {
    return this.requireProvider(payloadRef).queryPayloads(filter)
  }

  guidePayload(payloadRef: string, key: string): KnowledgePayloadGuide | null {
    return this.requireProvider(payloadRef).guidePayload(key)
  }

  listProviders(): readonly KnowledgePayloadProvider[] {
    return Array.from(this.providers.values())
  }

  private requireProvider(payloadRef: string): KnowledgePayloadProvider {
    const provider = this.providers.get(payloadRef)
    if (provider === undefined) {
      throw new Error(`Unknown knowledge payload provider: ${payloadRef}`)
    }
    return provider
  }
}

export function createKnowledgePayloadProviderRegistry(): KnowledgePayloadProviderRegistry {
  return new KnowledgePayloadProviderRegistry()
}

const defaultKnowledgePayloadProviderRegistry = createKnowledgePayloadProviderRegistry()

export function getKnowledgePayloadProviderRegistry(): KnowledgePayloadProviderRegistry {
  return defaultKnowledgePayloadProviderRegistry
}

export function registerKnowledgePayloadProvider(provider: KnowledgePayloadProvider): void {
  defaultKnowledgePayloadProviderRegistry.register(provider)
}
