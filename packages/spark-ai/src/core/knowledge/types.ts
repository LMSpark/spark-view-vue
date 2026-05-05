import type { IStillSession, StillFailureMode } from '../stills/types'

export interface KnowledgeToolSummary {
  action: string
  business: string
  module: string
  function: string
  functionName: string
  type: 'request' | 'describe'
  description: string
  modulePrompt?: string
  guard?: string
  rules?: string[]
  failureCodes?: string[]
  params?: Record<string, unknown>
  example?: Record<string, unknown>
}

export interface KnowledgeModuleSummary {
  business: string
  module: string
  prompt: string
  toolCount: number
  actions: string[]
}

export interface KnowledgeToolGuide extends KnowledgeToolSummary {
  paramsSchema: Record<string, unknown> | null
  resultSchema: Record<string, unknown> | null
  usageRules: string[]
  failureModes: StillFailureMode[]
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
  failureModes: StillFailureMode[]
}

export interface KnowledgePayloadProvider {
  payloadRef: string
  description: string
  queryPayloads(session: IStillSession, filter?: Record<string, unknown>): KnowledgePayloadSummary[]
  guidePayload(session: IStillSession, key: string): KnowledgePayloadGuide | null
}
