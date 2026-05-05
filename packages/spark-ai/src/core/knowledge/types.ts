import type { FunctionFailureMode } from '../protocol/function-contracts'

export interface KnowledgeToolSummary {
  action: string
  business: string
  module: string
  function: string
  functionName: string
  type: 'request' | 'describe'
  description: string
  carrierKey?: string
  modulePrompt?: string
  moduleDescription?: string
  isPrimaryModule?: boolean
  guard?: string
  rules?: string[]
  failureCodes?: string[]
  params?: Record<string, unknown>
  example?: Record<string, unknown>
}

export interface KnowledgeModuleSummary {
  business: string
  module: string
  carrierKey?: string
  prompt: string
  description?: string
  isPrimary?: boolean
  toolCount: number
  actions: string[]
}

export interface KnowledgeToolGuide extends KnowledgeToolSummary {
  paramsSchema: Record<string, unknown> | null
  resultSchema: Record<string, unknown> | null
  usageRules: string[]
  failureModes: FunctionFailureMode[]
}

export interface KnowledgePayloadSummary {
  payloadRef: string
  key: string
  category?: string
  description: string
  tags?: string[]
}

export interface KnowledgePayloadGuide {
  payloadRef: string
  key: string
  description: string
  jsonSchema: Record<string, unknown>
  minimalExample: Record<string, unknown>
  usageRules: string[]
  failureModes: FunctionFailureMode[]
}

export interface KnowledgePayloadProvider {
  payloadRef: string
  description: string
  queryPayloads(filter?: Record<string, unknown>): KnowledgePayloadSummary[]
  guidePayload(key: string): KnowledgePayloadGuide | null
}
