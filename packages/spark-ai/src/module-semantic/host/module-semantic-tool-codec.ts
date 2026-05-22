/**
 * @packageDocumentation
 *
 * 模块语义协议 host 适配 — 工具编解码器。
 *
 * 把 ModuleSemanticRuntime.getLlmTools() 返回的 6 个协议工具规约
 * 转成 AI host 用的 AiHostTransportToolSpec[]。
 *
 * 设计原则:
 * - LLM 看到的工具数固定为 6(协议核心承诺),不随业务 kind 数量膨胀。
 * - toolName 直接复用协议工具名(getAttribute / setAttribute / invokeAction /
 *   listChildren / findInstance / describeKind),便于 LLM 跨会话稳定记忆。
 * - 不引入按模块和函数展开的工具命名规范,因为协议层不存在
 *   "模块 × 函数"的笛卡尔积工具。
 * - 反向映射只用于校验:LLM 调用未知工具时,actionOf() 返回 null。
 */

import type { AiHostTransportToolSpec } from '../../host/transport/transport-types'
import type { ModuleSemanticToolSpec } from '../internal/protocol-tool-generator'
import type { ProtocolToolName } from '../internal/protocol-tool-generator'
import { PROTOCOL_TOOL_NAMES } from '../internal/protocol-tool-generator'

/**
 * 工具编解码器。
 *
 * 用法:
 * ```ts
 * const codec = new ModuleSemanticToolCodec(runtime.getLlmTools())
 * codec.tools  // → AiHostTransportToolSpec[],喂给 host
 * codec.actionOf('invokeAction')  // → 'invokeAction'(原样返回)
 * codec.actionOf('foo')           // → null
 * ```
 */
export class ModuleSemanticToolCodec {
  public readonly tools: readonly AiHostTransportToolSpec[]

  private readonly knownToolNames: ReadonlySet<string>

  public constructor(specs: readonly ModuleSemanticToolSpec[]) {
    this.tools = specs.map((spec) => toTransportSpec(spec))
    this.knownToolNames = new Set(specs.map((spec) => spec.function.name))
  }

  /**
   * 反查 toolName → action 字符串。
   *
   * 在 module-semantic 适配模式下:
   * - 协议工具名直接是 action(协议层只有 6 个工具,无 kind × action 笛卡尔积)
   * - 未识别的 toolName 返回 null,供 host 跳过该 tool_call
   */
  public actionOf(toolName: string): string | null {
    return this.knownToolNames.has(toolName) ? toolName : null
  }

  /**
   * 判定一个 toolName 是否属于协议工具集。
   */
  public isProtocolToolName(toolName: string): toolName is ProtocolToolName {
    return this.knownToolNames.has(toolName)
  }

  /**
   * 协议固定工具名列表。便于业务层做诊断、覆盖统计、白名单等。
   */
  public static readonly PROTOCOL_TOOL_NAMES = PROTOCOL_TOOL_NAMES
}

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
