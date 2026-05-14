/**
 * 参数 payload 协议契约。
 *
 * 调用时序：
 * 1. 调用方先通过 `payloadRef` 找到某类参数提供者。
 * 2. 使用 `queryPayloads` 按分类或关键词列出可用参数摘要。
 * 3. 选中 `key` 后再用 `guidePayload` 拉取完整 paramsSchema、示例和使用规则。
 *
 * 该层只定义“可复用参数如何被发现和描述”，参数结构统一使用 `parameter-schema.ts`。
 */

import type { LlmJsonValue, LlmParameterSchemaRoot } from './parameter-schema'

/** 查询参数 payload 摘要时使用的轻量过滤条件。 */
export interface ParameterPayloadQueryFilter {
  /** 参数分类，例如 schema、template、reference。 */
  readonly category?: string
  /** 关键词过滤，具体匹配策略由 provider 自行决定。 */
  readonly keyword?: string
  /** 可选投影表达式；具体语法由 provider 定义，page-design 组件目录使用 JMESPath。 */
  readonly expression?: string
  /** 最多返回多少条目录摘要；provider 可设置默认值与上限。 */
  readonly limit?: number
}

/** 可展示在列表或供 LLM 初筛的参数 payload 摘要。 */
export interface ParameterPayloadSummary {
  /** 参数提供者命名空间；当调用结果已有顶层 payloadRef 时，目录项可省略。 */
  readonly payloadRef?: string
  /** provider 内部的知识条目 key，用于后续拉取 guide。 */
  readonly key: string
  /** 面向 LLM 或 UI 的简短描述；表达式投影可按需省略以压缩上下文。 */
  readonly description?: string
  /** 可选分类，便于调用方分组展示或过滤。 */
  readonly category?: string
  /** 可选标签，补充检索和提示词上下文。 */
  readonly tags?: readonly string[]
}

/** 参数 payload 的已知失败模式。 */
export interface ParameterPayloadFailureMode {
  /** 稳定错误码。 */
  readonly code: string
  /** 触发条件。 */
  readonly when: string
  /** 推荐修复方式。 */
  readonly fix: string
}

/** 单个参数 payload 的完整调用指南。 */
export interface ParameterPayloadGuide {
  /** 参数提供者命名空间。 */
  readonly payloadRef: string
  /** provider 内部的知识条目 key。 */
  readonly key: string
  /** 该参数 payload 的用途说明。 */
  readonly description: string
  /** LLM 提交该参数 payload 时应遵守的参数 schema；与函数 paramsSchema 同源。 */
  readonly paramsSchema: LlmParameterSchemaRoot
  /** 最小可用参数示例，帮助 LLM 减少结构猜测。 */
  readonly minimalParams?: LlmJsonValue
  /** provider 原始语义指南；保留业务 catalog 的说明、分组、绑定、事件等信息，供 LLM 理解用途。 */
  readonly sourceGuide?: LlmJsonValue
  /** 使用规则、前置条件或调用顺序提示。 */
  readonly usageRules?: readonly string[]
  /** 已知失败模式，供 LLM 规划修复动作。 */
  readonly failureModes?: readonly ParameterPayloadFailureMode[]
}

/** 参数 payload 提供者接口，由注册方或 catalog 层实现后注册到 registry。 */
export interface ParameterPayloadProvider {
  /** provider 唯一命名空间。 */
  payloadRef: string
  /** provider 自身能力说明。 */
  description: string
  /** 按过滤条件返回摘要列表；应保持稳定排序，方便审查和缓存。 */
  queryPayloads(filter?: ParameterPayloadQueryFilter): readonly ParameterPayloadSummary[]
  /** 返回指定参数条目的完整指南；未知 key 返回 null。 */
  guidePayload(key: string): ParameterPayloadGuide | null
}
