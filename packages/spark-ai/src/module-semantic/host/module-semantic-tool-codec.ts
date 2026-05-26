/**
 * ═══════════════════════════════════════════════════════════════
 * module-semantic/host/module-semantic-tool-codec.ts — 工具编解码器
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】module-semantic → host 适配层。
 *   把 ModuleSemanticRuntime.getLlmTools() 返回的 OpenAI function tool 规约
 *   转成 Host transport 可用的 AiHostTransportToolSpec[]。
 *
 * 【设计原则】
 *   - LLM 看到固定知识/导航工具，以及按已注册业务函数派生的执行工具。
 *   - toolName 直接复用 OpenAI function tool 名，便于 LLM 跨会话稳定记忆。
 *   - 反向映射 actionOf(toolName) 用于校验：LLM 调用未知 toolName 时返回 null。
 *
 * 【消费方】host/business/business-session.ts（startRegistrationSession）、
 *   host/tool-loop/tool-loop-runner.ts（工具循环）
 * ═══════════════════════════════════════════════════════════════
 */

import type { AiHostTransportToolSpec } from '../../host/transport/transport-types'
import type { ModuleSemanticToolSpec } from '../internal/protocol-tool-generator'

export class ModuleSemanticToolCodec {
  /** 协议工具 → Host transport 工具规约 */
  public readonly tools: readonly AiHostTransportToolSpec[]

  /** 已知 toolName 集合（用于快速反查） */
  private readonly knownToolNames: ReadonlySet<string>

  public constructor(specs: readonly ModuleSemanticToolSpec[]) {
    this.tools = specs.map((spec) => toTransportSpec(spec))
    this.knownToolNames = new Set(specs.map((spec) => spec.function.name))
  }

  /**
   * 反查 toolName → runtime 可执行 toolName。
   * 未知 toolName 返回 null，Host 层据此跳过该 tool_call。
   *
   * 【DEFERRED】当前实现为恒等映射（已知→自身，未知→null）。
   * 保留此方法作为协议层→传输层的工具名解析边界：
   * - 未来可能需要 tool name 重写、别名或版本兼容映射
   * - 当前无实际转换需求，故保持最简单实现
   * - 不在此处做业务语义推断或模糊匹配
   */
  public actionOf(toolName: string): string | null {
    return this.knownToolNames.has(toolName) ? toolName : null
  }
}

/** ModuleSemanticToolSpec → AiHostTransportToolSpec（浅拷贝 parameters） */
function toTransportSpec(spec: ModuleSemanticToolSpec): AiHostTransportToolSpec {
  return {
    type: 'function',
    function: {
      name: spec.function.name,
      description: spec.function.description,
      parameters: { ...spec.function.parameters },
      // 当前 schema 仍保留可选字段和 oneOf；显式 strict=false，避免 OpenAI 严格模式按 strict schema 拒收。
      strict: spec.function.strict ?? false,
    },
  }
}
