import type { KnowledgePayloadProvider } from '../protocol/knowledge-payload-contracts'

const payloadProviders = new Map<string, KnowledgePayloadProvider>()

export function registerKnowledgePayloadProvider(provider: KnowledgePayloadProvider): void {
  payloadProviders.set(provider.payloadRef, provider)
}

export function getKnowledgePayloadProvider(payloadRef: string): KnowledgePayloadProvider | undefined {
  return payloadProviders.get(payloadRef)
}

export function getKnowledgePayloadProviders(): readonly KnowledgePayloadProvider[] {
  return Array.from(payloadProviders.values())
}

export function clearKnowledgeRegistry(): void {
  payloadProviders.clear()
}
