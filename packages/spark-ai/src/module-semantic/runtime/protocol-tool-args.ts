import type { LlmJsonValue } from '../../schema'
import { PROTOCOL_TOOL_NAMES, type ProtocolToolName } from '../internal/protocol-tool-generator'

/**
 * LLM 传入的原始 tool 参数（JSON 对象）。
 * 运行时不信任结构，由 ProtocolToolArgsParser 按工具语义解析。
 */
export type ProtocolToolArgs = Readonly<Record<string, LlmJsonValue>>

/** 工具参数解析错误（由 ProtocolToolRouter 统一转为 OperationResult）。 */
export class ProtocolToolArgsError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'ProtocolToolArgsError'
  }
}

export class ProtocolToolArgsParser {
  public isProtocolToolName(name: string): name is ProtocolToolName {
    const known: readonly ProtocolToolName[] = Object.values(PROTOCOL_TOOL_NAMES)
    return known.some((candidate) => candidate === name)
  }

  public requireString(args: ProtocolToolArgs, key: string): string {
    const value = args[key]
    if (typeof value !== 'string' || value.length === 0) {
      throw new ProtocolToolArgsError(`参数 "${key}" 缺失或非字符串`)
    }
    return value
  }

  public optionalString(args: ProtocolToolArgs, key: string): string | undefined {
    if (!(key in args)) return undefined
    const value = args[key]
    if (value === null || value === undefined) return undefined
    if (typeof value !== 'string') throw new ProtocolToolArgsError(`参数 "${key}" 类型错误,应为字符串`)
    return value.length === 0 ? undefined : value
  }

  public requireObject(args: ProtocolToolArgs, key: string): Readonly<Record<string, LlmJsonValue>> {
    const value = args[key]
    if (!isJsonObject(value)) throw new ProtocolToolArgsError(`参数 "${key}" 缺失或不是 JSON 对象`)
    return value
  }

  public requireValue(args: ProtocolToolArgs, key: string): LlmJsonValue {
    if (!(key in args)) throw new ProtocolToolArgsError(`参数 "${key}" 缺失`)
    const value = args[key]
    if (value === undefined) throw new ProtocolToolArgsError(`参数 "${key}" 缺失`)
    return value
  }
}

function isJsonObject(value: LlmJsonValue | undefined): value is Readonly<Record<string, LlmJsonValue>> {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)
}
