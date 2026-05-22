/**
 * module-semantic/payloads/module-parameter-payload-registry.ts — 模块参数荷载注册表
 *
 * 参数 payload 是“某个模块动作在构造复杂参数前需要查阅的外部知识”。
 * 例如 pageDesign.node-tree 的 SparkNode props 指南来自组件目录。
 */

import type { LlmJsonSchemaObject, LlmJsonValue } from '../../schema'
import type { ModuleActionFailureMode } from '../protocol'

export type ModuleParameterPayloadQueryFilter = Readonly<{
  /** 关联模块 kind。注册表级查询可用；provider 内部通常忽略。 */
  moduleKind?: string | undefined
  /** 参数 provider 命名空间。注册表级查询可用；provider 内部通常忽略。 */
  payloadRef?: string | undefined
  /** provider 内部条目 key。 */
  key?: string | undefined
  /** 参数分类，例如 component/container/field。 */
  category?: string | undefined
  /** 关键词过滤，具体匹配策略由 provider 自行决定。 */
  keyword?: string | undefined
  /** 可选投影表达式；具体语法由 provider 定义。 */
  expression?: string | undefined
  /** 仅返回可配置条目；provider 可按自身语义解释。 */
  configurableOnly?: boolean | undefined
  /** 最多返回多少条目录摘要。 */
  limit?: number | undefined
}>

export type ModuleParameterPayloadSummary = Readonly<{
  /** 该参数 payload 服务哪个 ModuleKind。 */
  moduleKind: string
  /** provider 唯一命名空间。 */
  payloadRef: string
  /** provider 内部条目 key。 */
  key: string
  /** 面向 LLM 或 UI 的简短描述。 */
  description?: string | undefined
  /** 可选分类，便于调用方分组展示或过滤。 */
  category?: string | undefined
  /** 可选标签，补充检索和提示词上下文。 */
  tags?: readonly string[] | undefined
  /** provider 自定义摘要字段，调用方可原样展示。 */
  metadata?: Readonly<Record<string, LlmJsonValue>> | undefined
}> & Readonly<Record<string, unknown>>

export type ModuleParameterPayloadGuide = Readonly<{
  /** 该参数 payload 服务哪个 ModuleKind。 */
  moduleKind: string
  /** provider 唯一命名空间。 */
  payloadRef: string
  /** provider 内部条目 key。 */
  key: string
  /** 该参数 payload 的用途说明。 */
  description: string
  /** LLM 提交该参数 payload 时应遵守的标准 JSON Schema object root。 */
  paramsSchema: LlmJsonSchemaObject
  /** 最小可用参数示例，帮助 LLM 减少结构猜测。 */
  minimalParams?: LlmJsonValue | undefined
  /** provider 原始语义指南；保留业务 catalog 的说明、分组、绑定、事件等信息。 */
  sourceGuide?: LlmJsonValue | undefined
  /** 使用规则、前置条件或调用顺序提示。 */
  usageRules?: readonly string[] | undefined
  /** 已知失败模式，供 LLM 规划修复动作。 */
  failureModes?: readonly ModuleActionFailureMode[] | undefined
  /** provider 自定义指南字段，调用方可原样展示。 */
  metadata?: Readonly<Record<string, LlmJsonValue>> | undefined
}> & Readonly<Record<string, unknown>>

export type ModuleParameterPayloadProvider = Readonly<{
  /** 该 provider 绑定的 ModuleKind。 */
  moduleKind: string
  /** provider 唯一命名空间。 */
  payloadRef: string
  /** provider 自身能力说明。 */
  description: string
  /** 按过滤条件返回摘要列表；应保持稳定排序，方便审查和缓存。 */
  queryPayloads(filter?: ModuleParameterPayloadQueryFilter): readonly ModuleParameterPayloadSummary[]
  /** 返回指定参数条目的完整指南；未知 key 返回 null。 */
  guidePayload(key: string): ModuleParameterPayloadGuide | null
}>

export class ModuleParameterPayloadRegistry {
  private readonly providers = new Map<string, ModuleParameterPayloadProvider>()

  /** 注册一个 provider；同一 moduleKind + payloadRef 只允许注册一次。 */
  public register(provider: ModuleParameterPayloadProvider): void {
    const moduleKind = normalizeName(provider.moduleKind, 'moduleKind')
    const payloadRef = normalizeName(provider.payloadRef, 'payloadRef')
    const key = providerKey(moduleKind, payloadRef)
    if (this.providers.has(key)) {
      throw new Error(`Duplicate module parameter payload provider: ${moduleKind}/${payloadRef}`)
    }
    this.providers.set(key, { ...provider, moduleKind, payloadRef })
  }

  /** 按 moduleKind + payloadRef 获取 provider；未知时返回 undefined。 */
  public getProvider(moduleKind: string, payloadRef: string): ModuleParameterPayloadProvider | undefined {
    return this.providers.get(providerKey(moduleKind, payloadRef))
  }

  /** 强制获取 provider；未知时 fail-fast。 */
  public requireProvider(moduleKind: string, payloadRef: string): ModuleParameterPayloadProvider {
    const provider = this.getProvider(moduleKind, payloadRef)
    if (provider === undefined) {
      throw new Error(`Unknown module parameter payload provider: ${moduleKind}/${payloadRef}`)
    }
    return provider
  }

  /** 按注册时序列出 provider，便于调试或构建知识目录。 */
  public listProviders(filter: Pick<ModuleParameterPayloadQueryFilter, 'moduleKind' | 'payloadRef'> = {}): readonly ModuleParameterPayloadProvider[] {
    const moduleKind = filter.moduleKind?.trim()
    const payloadRef = filter.payloadRef?.trim()
    return [...this.providers.values()].filter((provider) => {
      if (moduleKind !== undefined && moduleKind.length > 0 && provider.moduleKind !== moduleKind) return false
      if (payloadRef !== undefined && payloadRef.length > 0 && provider.payloadRef !== payloadRef) return false
      return true
    })
  }

  /** 查询匹配 provider 暴露的参数摘要。未知 provider 不静默回退。 */
  public queryPayloads(filter: ModuleParameterPayloadQueryFilter = {}): readonly ModuleParameterPayloadSummary[] {
    const providers = this.matchProviders(filter)
    return providers.flatMap((provider) => provider.queryPayloads(filter))
  }

  /** 拉取单条参数指南；provider 存在但 key 不存在时返回 null。 */
  public guidePayload(moduleKind: string, payloadRef: string, key: string): ModuleParameterPayloadGuide | null {
    return this.requireProvider(moduleKind, payloadRef).guidePayload(key)
  }

  private matchProviders(filter: ModuleParameterPayloadQueryFilter): readonly ModuleParameterPayloadProvider[] {
    const providers = this.listProviders(filter)
    if (providers.length === 0) {
      const moduleKind = filter.moduleKind?.trim()
      const payloadRef = filter.payloadRef?.trim()
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
