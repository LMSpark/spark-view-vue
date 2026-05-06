import type { FunctionFailureMode } from './function-contracts'

export interface KnowledgeToolSummary {
  action: string
  business: string
  module: string
  function: string
  functionName: string
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