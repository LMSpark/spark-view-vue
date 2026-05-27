/**
 * modules/payloads/module-parameter-payload-registry.ts — 模块参数荷载注册表
 *
 * 参数 payload 是“某个模块 function 在构造复杂参数前需要查阅的外部知识”。
 * 例如 pageDesign.node-tree 的 SparkNode props 指南来自组件目录。
 */

import type { AiJsonSchemaObject, AiJsonValue } from '../../json'
import type { AiModuleFunctionFailureMode } from '../protocol'

export type AiModulePayloadQueryFilter = Readonly<{
  /** 关联模块 kind。注册表级查询可用；provider 内部通常忽略。 */
  moduleKind?: string
  /** 参数 provider 命名空间。注册表级查询可用；provider 内部通常忽略。 */
  payloadRef?: string
  /** provider 内部条目 key。 */
  key?: string
  /** 参数分类，例如 component/container/field。 */
  category?: string
  /** 关键词过滤，具体匹配策略由 provider 自行决定。 */
  keyword?: string
  /** 可选投影表达式；具体语法由 provider 定义。 */
  expression?: string
  /** 仅返回可配置条目；provider 可按自身语义解释。 */
  configurableOnly?: boolean
  /** 最多返回多少条目录摘要。 */
  limit?: number
}>

export type AiModulePayloadSummary = Readonly<{
  /** 该参数 payload 服务哪个 AiModule。 */
  moduleKind: string
  /** provider 唯一命名空间。 */
  payloadRef: string
  /** provider 内部条目 key。 */
  key: string
  /** 面向 LLM 或 UI 的简短描述。 */
  description?: string
  /** 可选分类，便于调用方分组展示或过滤。 */
  category?: string
  /** 可选标签，补充检索和提示词上下文。 */
  tags?: readonly string[]
  /** provider 自定义摘要字段，调用方可原样展示。 */
  metadata?: Readonly<Record<string, AiJsonValue>>
}> & Readonly<Record<string, unknown>>

export type AiModulePayloadGuide = Readonly<{
  /** 该参数 payload 服务哪个 AiModule。 */
  moduleKind: string
  /** provider 唯一命名空间。 */
  payloadRef: string
  /** provider 内部条目 key。 */
  key: string
  /** 该参数 payload 的用途说明。 */
  description: string
  /** LLM 提交该参数 payload 时应遵守的标准 JSON Schema object root。 */
  paramsSchema: AiJsonSchemaObject
  /** 最小可用参数示例，帮助 LLM 减少结构猜测。 */
  minimalParams?: AiJsonValue
  /** provider 原始语义指南；保留业务 catalog 的说明、分组、绑定、事件等信息。 */
  sourceGuide?: AiJsonValue
  /** 使用规则、前置条件或调用顺序提示。 */
  usageRules?: readonly string[]
  /** 已知失败模式，供 LLM 规划修复步骤。 */
  failureModes?: readonly AiModuleFunctionFailureMode[]
  /** provider 自定义指南字段，调用方可原样展示。 */
  metadata?: Readonly<Record<string, AiJsonValue>>
}> & Readonly<Record<string, unknown>>

export type AiModulePayloadProvider = Readonly<{
  /** 该 provider 绑定的 AiModule。 */
  moduleKind: string
  /** provider 唯一命名空间。 */
  payloadRef: string
  /** provider 自身能力说明。 */
  description: string
  /** 按过滤条件返回摘要列表；应保持稳定排序，方便审查和缓存。 */
  queryPayloads(filter?: AiModulePayloadQueryFilter): readonly AiModulePayloadSummary[]
  /** 返回指定参数条目的完整指南；未知 key 返回 null。 */
  guidePayload(key: string): AiModulePayloadGuide | null
}>

export class AiModulePayloadRegistry {
  private readonly providers = new Map<string, AiModulePayloadProvider>()

  /** 注册一个 provider；同一 moduleKind + payloadRef 只允许注册一次。 */
  public register(provider: AiModulePayloadProvider): void {
    const moduleKind = normalizeName(provider.moduleKind, 'moduleKind')
    const payloadRef = normalizeName(provider.payloadRef, 'payloadRef')
    const key = providerKey(moduleKind, payloadRef)
    if (this.providers.has(key)) {
      throw new Error(`Duplicate module parameter payload provider: ${moduleKind}/${payloadRef}`)
    }
    this.providers.set(key, { ...provider, moduleKind, payloadRef })
  }

  /** 强制获取 provider；未知时 fail-fast。 */
  public requireProvider(moduleKind: string, payloadRef: string): AiModulePayloadProvider {
    const provider = this.providers.get(providerKey(moduleKind, payloadRef))
    if (provider === undefined) {
      throw new Error(`Unknown module parameter payload provider: ${moduleKind}/${payloadRef}`)
    }
    return provider
  }

  /** 查询匹配 provider 暴露的参数摘要。未知 provider 不静默回退。 */
  public queryPayloads(filter: AiModulePayloadQueryFilter = {}): readonly AiModulePayloadSummary[] {
    const providers = this.matchProviders(filter)
    return providers.flatMap((provider) => provider.queryPayloads(filter))
  }

  /** 拉取单条参数指南；provider 存在但 key 不存在时返回 null。 */
  public guidePayload(moduleKind: string, payloadRef: string, key: string): AiModulePayloadGuide | null {
    return this.requireProvider(moduleKind, payloadRef).guidePayload(key)
  }

  private matchProviders(filter: AiModulePayloadQueryFilter): readonly AiModulePayloadProvider[] {
    const moduleKind = filter.moduleKind?.trim()
    const payloadRef = filter.payloadRef?.trim()
    const providers = [...this.providers.values()].filter((provider) => {
      if (moduleKind !== undefined && moduleKind.length > 0 && provider.moduleKind !== moduleKind) return false
      if (payloadRef !== undefined && payloadRef.length > 0 && provider.payloadRef !== payloadRef) return false
      return true
    })
    if (providers.length === 0) {
      if (moduleKind !== undefined && moduleKind.length > 0 && payloadRef !== undefined && payloadRef.length > 0) {
        throw new Error(`Unknown module parameter payload provider: ${moduleKind}/${payloadRef}`)
      }
      if (moduleKind !== undefined && moduleKind.length > 0) {
        throw new Error(`No parameter payload provider registered for moduleKind: ${moduleKind}`)
      }
      if (payloadRef !== undefined && payloadRef.length > 0) {
        throw new Error(`No parameter payload provider registered for payloadRef: ${payloadRef}`)
      }
    }
    return providers
  }
}

function normalizeName(value: string, field: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`module parameter payload ${field} must not be empty`)
  }
  return normalized
}

function providerKey(moduleKind: string, payloadRef: string): string {
  return `${moduleKind.trim()}\u0000${payloadRef.trim()}`
}
