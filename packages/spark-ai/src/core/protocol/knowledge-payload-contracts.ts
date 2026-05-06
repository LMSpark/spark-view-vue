import type { FunctionFailureMode } from './function-contracts'

/**
 * 参数荷载协议。
 *
 * 职责边界：
 * 1. 统一描述 queryPayloads / guidePayload 这组知识动作的输入输出形状。
 * 2. 统一描述 payload provider 与 payload summary/guide 的稳定契约。
 * 3. 这里只放协议与共享类型，不放 registry、查询实现或业务 provider 逻辑。
 */

export type KnowledgePayloadRef = string
export type KnowledgePayloadKey = string
export type KnowledgePayloadCategory = string

/**
 * 通用参数荷载查询过滤器。
 *
 * category / keyword 是当前已收敛出的公共筛选维度；
 * 其余字段保留给具体 provider 扩展解释。
 */
export interface KnowledgePayloadQueryFilter {
  category?: KnowledgePayloadCategory
  keyword?: string
  [key: string]: unknown
}

export interface KnowledgeQueryPayloadsParams {
  payloadRef?: KnowledgePayloadRef
  filter?: KnowledgePayloadQueryFilter
}

export interface KnowledgeGuidePayloadParams {
  payloadRef?: KnowledgePayloadRef
  key?: KnowledgePayloadKey
}

export interface KnowledgePayloadProviderSummary {
  payloadRef: KnowledgePayloadRef
  description: string
}

export interface KnowledgePayloadSummary {
  payloadRef: KnowledgePayloadRef
  key: KnowledgePayloadKey
  category?: KnowledgePayloadCategory
  description: string
  tags?: string[]
}

export interface KnowledgeQueryPayloadProvidersResult {
  providers: KnowledgePayloadProviderSummary[]
  total: number
}

export interface KnowledgeQueryPayloadCatalogResult {
  payloadRef: KnowledgePayloadRef
  payloads: KnowledgePayloadSummary[]
  total: number
}

export interface KnowledgePayloadGuide {
  payloadRef: KnowledgePayloadRef
  key: KnowledgePayloadKey
  description: string
  jsonSchema: Record<string, unknown>
  minimalExample: Record<string, unknown>
  usageRules: string[]
  failureModes: readonly FunctionFailureMode[]
}

export interface KnowledgePayloadProvider {
  payloadRef: KnowledgePayloadRef
  description: string
  queryPayloads(filter?: KnowledgePayloadQueryFilter): KnowledgePayloadSummary[]
  guidePayload(key: KnowledgePayloadKey): KnowledgePayloadGuide | null
}