/**
 * ═══════════════════════════════════════════════════════════════
 * module-semantic/host/module-semantic-tool-codec.ts — 工具编解码器
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】module-semantic → host 适配层。
 *   把 ModuleSemanticRuntime.getLlmTools() 返回的 6 个协议工具规约
 *   转成 Host transport 可用的 AiHostTransportToolSpec[]。
 *
 * 【设计原则】
 *   - LLM 看到的工具数固定为 6，不随业务 kind 数量膨胀。
 *   - toolName 直接复用协议工具名，便于 LLM 跨会话稳定记忆。
 *   - 反向映射 actionOf(toolName) 用于校验：LLM 调用未知工具时返回 null。
 *
 * 【消费方】host/business/business-session.ts（startRegistrationSession）、
 *   host/tool-loop/tool-loop-runner.ts（工具循环）
 * ═══════════════════════════════════════════════════════════════
 */

import type { AiHostTransportToolSpec } from '../../host/transport/transport-types'
import type { ModuleSemanticToolSpec, ProtocolToolName } from '../internal/protocol-tool-generator'
import { PROTOCOL_TOOL_NAMES } from '../internal/protocol-tool-generator'

export class ModuleSemanticToolCodec {
  /** 协议工具 → Host transport 工具规约 */
  public readonly tools: readonly AiHostTransportToolSpec[]

  /** 已知协议工具名集合（用于快速反查） */
  private readonly knownToolNames: ReadonlySet<string>

  public constructor(specs: readonly ModuleSemanticToolSpec[]) {
    this.tools = specs.map((spec) => toTransportSpec(spec))
    this.knownToolNames = new Set(specs.map((spec) => spec.function.name))
  }

  /**
   * 反查 toolName → 协议工具名。
   * 未知工具返回 null，Host 层据此跳过该 tool_call。
   */
  public actionOf(toolName: string): string | null {
    return this.knownToolNames.has(toolName) ? toolName : null
  }

  /** 判定一个 toolName 是否属于协议工具集 */
  public isProtocolToolName(toolName: string): toolName is ProtocolToolName {
    return this.knownToolNames.has(toolName)
  }

  /** 协议固定工具名常量引用 */
  public static readonly PROTOCOL_TOOL_NAMES = PROTOCOL_TOOL_NAMES
}

/** ModuleSemanticToolSpec → AiHostTransportToolSpec（浅拷贝 parameters） */
function toTransportSpec(spec: ModuleSemanticToolSpec): AiHostTransportToolSpec {
  return {
    type: 'function',
    function: {
      name: spec.function.name,
      description: spec.function.description,
      parameters: { ...spec.function.parameters },
    },
  }
}
