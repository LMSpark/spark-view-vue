/**
 * host/transport/module-semantic-tool-codec.ts — module-semantic tool spec adapter.
 *
 * Converts ModuleSemanticRuntime.getLlmTools() output into Host transport tool
 * specs. The adapter lives in Host transport because it depends on transport
 * tool shape; module-semantic only owns the protocol-side tool descriptions.
 */

import type { ModuleSemanticToolSpec } from '../../module-semantic/internal/protocol-tool-generator'
import type { AiHostTransportToolSpec } from './transport-types'

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
   * 校验 transport toolName 是否来自当前 runtime 生成的工具集合。
   * 当前协议不做别名、模糊匹配或兼容重写；未知 toolName 返回 null。
   */
  public resolveToolName(toolName: string): string | null {
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
