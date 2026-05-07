export interface KnowledgePayloadQueryFilter {
  category?: string
  keyword?: string
}

export interface KnowledgePayloadSummary {
  payloadRef: string
  key: string
  description: string
  category?: string
  tags?: readonly string[]
}

export interface KnowledgePayloadGuide {
  payloadRef: string
  key: string
  description: string
  jsonSchema: Record<string, unknown>
  minimalExample?: unknown
  usageRules?: readonly string[]
  failureModes?: ReadonlyArray<{
    code: string
    when: string
    fix: string
  }>
}

export interface KnowledgePayloadProvider {
  payloadRef: string
  description: string
  queryPayloads(filter?: KnowledgePayloadQueryFilter): readonly KnowledgePayloadSummary[]
  guidePayload(key: string): KnowledgePayloadGuide | null
}