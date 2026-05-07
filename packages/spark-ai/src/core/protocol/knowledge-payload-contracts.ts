/**
 * 知识负载协议契约。
 *
 * 调用时序：
 * 1. 调用方先通过 `payloadRef` 找到某类知识提供者。
 * 2. 使用 `queryPayloads` 按分类或关键词列出可用 payload 摘要。
 * 3. 选中 `key` 后再用 `guidePayload` 拉取完整 JSON schema、示例和使用规则。
 *
 * 该层只定义“知识如何被发现和描述”，不负责保存真实知识内容。
 */

/** 查询知识负载摘要时使用的轻量过滤条件。 */
export interface KnowledgePayloadQueryFilter {
  /** 知识分类，例如 component、dataset、node-tree。 */
  readonly category?: string
  /** 关键词过滤，具体匹配策略由 provider 自行决定。 */
  readonly keyword?: string
}

/** 可展示在列表或供 LLM 初筛的知识负载摘要。 */
export interface KnowledgePayloadSummary {
  /** 知识提供者命名空间，必须能定位到注册过的 provider。 */
  readonly payloadRef: string
  /** provider 内部的知识条目 key，用于后续拉取 guide。 */
  readonly key: string
  /** 面向 LLM 或 UI 的简短描述。 */
  readonly description: string
  /** 可选分类，便于调用方分组展示或过滤。 */
  readonly category?: string
  /** 可选标签，补充检索和提示词上下文。 */
  readonly tags?: readonly string[]
}

/** 知识负载的已知失败模式。 */
export interface KnowledgePayloadFailureMode {
  /** 稳定错误码。 */
  readonly code: string
  /** 触发条件。 */
  readonly when: string
  /** 推荐修复方式。 */
  readonly fix: string
}

/** 单个知识负载的完整调用指南。 */
export interface KnowledgePayloadGuide {
  /** 知识提供者命名空间。 */
  readonly payloadRef: string
  /** provider 内部的知识条目 key。 */
  readonly key: string
  /** 该 payload 的用途说明。 */
  readonly description: string
  /** LLM 读取或提交该 payload 时应遵守的 JSON schema。 */
  readonly jsonSchema: Record<string, unknown>
  /** 最小可用示例，帮助 LLM 减少结构猜测。 */
  readonly minimalExample?: unknown
  /** 使用规则、前置条件或调用顺序提示。 */
  readonly usageRules?: readonly string[]
  /** 已知失败模式，供 LLM 规划修复动作。 */
  readonly failureModes?: readonly KnowledgePayloadFailureMode[]
}

/** 知识负载提供者接口，由业务或 catalog 层实现后注册到 registry。 */
export interface KnowledgePayloadProvider {
  /** provider 唯一命名空间。 */
  payloadRef: string
  /** provider 自身能力说明。 */
  description: string
  /** 按过滤条件返回摘要列表；应保持稳定排序，方便审查和缓存。 */
  queryPayloads(filter?: KnowledgePayloadQueryFilter): readonly KnowledgePayloadSummary[]
  /** 返回指定知识条目的完整指南；未知 key 返回 null。 */
  guidePayload(key: string): KnowledgePayloadGuide | null
}
