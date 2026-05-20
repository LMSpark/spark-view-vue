/**
 * AI Runtime 工具编解码器。
 *
 * 职责：将知识投影中的 AiRuntimeFunctionExposure 编码为 LLM tool specs，
 * 并维护 toolName → action 的反向映射，用于解码 LLM 返回的 tool_call。
 *
 * 编码流程：
 * ┌──────────────────────────────────────────────────────────────┐
 * │ 1. 遍历 projection.availableFunctions                        │
 * │ 2. 按 includeActions 选项过滤（渐进式暴露）                   │
 * │ 3. toolNameForExposure() → 生成 toolName                     │
 * │    格式：ai_序号_模块名_函数名（最长 64 字符）                 │
 * │ 4. buildToolDescription() → 构建 description                 │
 * │    内容：原始描述 + 使用规则（如有） + 失败处理（如有）        │
 * │ 5. schemaToParameters() → 提取 JSON Schema parameters         │
 * │ 6. 注册 toolName → action 反向映射                            │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 解码流程：
 * ┌──────────────────────────────────────────────────────────────┐
 * │ actionOf(toolName) → 从反向映射中查找原始 action 字符串        │
 * │ 找不到返回 null，表示该 toolName 不是当前 codec 生成的         │
 * └──────────────────────────────────────────────────────────────┘
 */

import type {
  AiRuntimeFunctionExposure,
  AiRuntimeKnowledgeProjection,
} from '../protocol/runtime-protocol'
import type { LlmParameterSchemaRoot } from '../protocol/parameter-schema'

// ═══════════════════════════════════════════════════════
// 工具编解码类型
// ═══════════════════════════════════════════════════════

/** LLM 工具规范，用于告诉 LLM 有哪些可用工具 */
export interface AiRuntimeToolSpec {
  readonly type: 'function'
  readonly function: {
    /** 工具名称，格式为 ai_序号_模块名_函数名 */
    readonly name: string
    /** 工具描述，包含原始描述、使用规则和失败处理 */
    readonly description: string
    /** 工具参数的 JSON Schema（必须 type=object） */
    readonly parameters: Record<string, unknown>
  }
}

/** 工具编解码器选项 */
export interface AiRuntimeToolCodecOptions {
  /**
   * 包含的 action 集合，用于渐进式工具暴露。
   * 可以是 Set<string> 或过滤函数。
   * 未设置时包含所有可用函数。
   */
  readonly includeActions?: ReadonlySet<string> | ((exposure: AiRuntimeFunctionExposure) => boolean) | undefined
}

// ═══════════════════════════════════════════════════════
// 编码辅助函数
// ═══════════════════════════════════════════════════════

/**
 * 清理 toolName 片段：移除非字母数字字符，用下划线替换，
 * 去除首尾下划线。空结果返回 'tool'。
 */
function sanitizeToolNamePart(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  return normalized.length > 0 ? normalized : 'tool'
}

/**
 * 将 JSON Schema 转换为 LLM tool parameters 格式。
 * 要求 schema 根节点 type=object，否则抛出异常。
 */
function schemaToParameters(schema: LlmParameterSchemaRoot): Record<string, unknown> {
  if (schema.type !== 'object') {
    throw new Error('LLM tool parameters must be standard JSON Schema with root type=object')
  }
  return { ...schema }
}

/**
 * 为函数曝光生成 toolName。
 * 格式：ai_序号_模块名_函数名，最长 64 字符。
 * 模块名和函数名经过 sanitize 处理，只保留安全字符。
 */
function toolNameForExposure(exposure: AiRuntimeFunctionExposure, index: number): string {
  const modulePart = sanitizeToolNamePart(exposure.moduleId)
  const actionPart = sanitizeToolNamePart(exposure.action.split('@').at(-1) ?? `fn_${index}`)
  return `ai_${index}_${modulePart}_${actionPart}`.slice(0, 64)
}

/**
 * 构建工具描述文本。
 * 内容按优先级拼接：
 * 1. 原始函数描述
 * 2. 使用规则（usageRules），格式为列表
 * 3. 失败处理（failureModes），格式为 "code: when；修复: fix"
 */
function buildToolDescription(exposure: AiRuntimeFunctionExposure): string {
  const parts = [exposure.description]
  if (exposure.usageRules !== undefined && exposure.usageRules.length > 0) {
    parts.push(`使用规则:\n${exposure.usageRules.map((rule) => `- ${rule}`).join('\n')}`)
  }
  if (exposure.failureModes !== undefined && exposure.failureModes.length > 0) {
    parts.push(`失败处理:\n${exposure.failureModes.map((mode) => (
      `- ${mode.code}: ${mode.when}；修复: ${mode.fix}`
    )).join('\n')}`)
  }
  return parts.join('\n\n')
}

/** 检查函数曝光是否应该包含在当前 codec 中 */
function shouldIncludeExposure(exposure: AiRuntimeFunctionExposure, options: AiRuntimeToolCodecOptions): boolean {
  const includeActions = options.includeActions
  if (includeActions === undefined) return true
  if (typeof includeActions === 'function') return includeActions(exposure)
  return includeActions.has(exposure.action)
}

// ═══════════════════════════════════════════════════════
// AiRuntimeToolCodec
// ═══════════════════════════════════════════════════════

/**
 * AI Runtime 工具编解码器。
 *
 * 构造函数中遍历投影的 availableFunctions，为每个函数生成 LLM tool spec，
 * 同时注册 toolName → action 的反向映射。
 * 解码时通过 actionOf() 反查原始 action 字符串。
 */
export class AiRuntimeToolCodec {
  /** 生成的 LLM tool specs 列表 */
  readonly tools: readonly AiRuntimeToolSpec[]

  /** toolName → action 反向映射，用于解码 LLM tool_call */
  private readonly actionByToolName = new Map<string, string>()

  /**
   * 构造函数：遍历投影中的 availableFunctions，
   * 为每个函数生成 LLM tool spec 并注册 toolName → action 映射。
   * includeActions 选项支持渐进式工具暴露。
   *
   * 如果生成的 toolName 重复（理论上不应发生），会自动添加序号前缀去重。
   */
  constructor(
    projection: AiRuntimeKnowledgeProjection,
    options: AiRuntimeToolCodecOptions = {},
  ) {
    this.tools = projection.availableFunctions.flatMap((exposure, index): AiRuntimeToolSpec[] => {
      if (!shouldIncludeExposure(exposure, options)) return []
      let toolName = toolNameForExposure(exposure, index)
      if (this.actionByToolName.has(toolName)) toolName = `ai_${index}_${toolName}`.slice(0, 64)
      this.actionByToolName.set(toolName, exposure.action)
      return [{
        type: 'function',
        function: {
          name: toolName,
          description: buildToolDescription(exposure),
          parameters: schemaToParameters(exposure.paramsSchema),
        },
      }]
    })
  }

  /**
   * 根据 LLM 返回的 toolName 反查原始 action 字符串。
   * 找不到返回 null，表示该 toolName 不是当前 codec 生成的。
   *
   * 用途：在工具循环中解码 LLM tool_call，
   * 将 LLM 使用的工具名称映射回内部 action 格式。
   */
  actionOf(toolName: string): string | null {
    return this.actionByToolName.get(toolName) ?? null
  }
}
