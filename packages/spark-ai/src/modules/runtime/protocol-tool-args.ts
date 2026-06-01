/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  MODULE-SEMANTIC · 协议工具参数解析器                                          │
 * │  Protocol Tool Arguments Parser                                                │
 * │                                                                              │
 * │  本模块负责将 LLM 传入的原始 JSON 参数（ProtocolToolArgs）解析为类型安全的字段。 │
 * │  每个 require* 方法在校验失败时抛出 ProtocolToolArgsError，                     │
 * │  由 ProtocolToolRouter 统一捕获并转为 INVALID_TOOL_ARGS。                       │
 * │                                                                              │
 * │  调用方：ProtocolToolRouter（所有路由方法共用同一个 argsParser 实例）            │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import type { AiJsonParams, AiJsonValue } from '../../json'
import { isProtocolToolName, type ProtocolToolName } from '../internal/protocol-tool-generator'

/* -------------------------------------------------------------------------------
 * 一、公共类型
 * ----------------------------------------------------------------------------- */

/**
 * LLM 传入的原始工具参数（JSON 对象）。
 * 运行时不信任其结构，由 ProtocolToolArgsParser 按工具语义逐字段解析和校验。
 */
export type ProtocolToolArgs = Readonly<Record<string, AiJsonValue>>

/** 参数解析错误（由 ProtocolToolRouter 统一转为 INVALID_TOOL_ARGS） */
export class ProtocolToolArgsError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'ProtocolToolArgsError'
  }
}

/* -------------------------------------------------------------------------------
 * 二、ProtocolToolArgsParser
 * ----------------------------------------------------------------------------- */

export class ProtocolToolArgsParser {
  /** 类型守卫：判定 toolName 是否为已知的固定 query/navigation tool 之一 */
  public isProtocolToolName(name: string): name is ProtocolToolName {
    return isProtocolToolName(name)
  }

  /** 提取必填字符串参数（缺失或非字符串或空串抛错） */
  public requireString(args: ProtocolToolArgs, key: string): string {
    const value = args[key]
    if (typeof value !== 'string' || value.length === 0) {
      throw new ProtocolToolArgsError(`参数 "${key}" 缺失或非字符串`)
    }
    return value
  }

  /** 提取可选字符串参数（null/undefined/空串 → undefined，非字符串抛错） */
  public optionalString(args: ProtocolToolArgs, key: string): string | undefined {
    if (!(key in args)) return undefined
    const value = args[key]
    if (value === null || value === undefined) return undefined
    if (typeof value !== 'string') throw new ProtocolToolArgsError(`参数 "${key}" 类型错误,应为字符串`)
    return value.length === 0 ? undefined : value
  }

  /** 提取必填字符串数组参数（缺失或非数组或空数组抛错） */
  public requireStringArray(args: ProtocolToolArgs, key: string): readonly string[] {
    if (!(key in args)) throw new ProtocolToolArgsError(`参数 "${key}" 缺失`)
    const value = args[key]
    if (!Array.isArray(value)) throw new ProtocolToolArgsError(`参数 "${key}" 类型错误,应为字符串数组`)
    if (value.length === 0) throw new ProtocolToolArgsError(`参数 "${key}" 不能为空数组`)
    const out: string[] = []
    for (let i = 0; i < value.length; i++) {
      const item: unknown = value[i]
      if (typeof item !== 'string') throw new ProtocolToolArgsError(`参数 "${key}" 类型错误,第 ${String(i + 1)} 个元素应为字符串`)
      out.push(item)
    }
    return out
  }

  /** 提取可选字符串数组参数（空数组或全空串 → undefined，元素非字符串抛错） */
  public optionalStringArray(args: ProtocolToolArgs, key: string): readonly string[] | undefined {
    if (!(key in args)) return undefined
    const value = args[key]
    if (value === null || value === undefined) return undefined
    if (!Array.isArray(value)) throw new ProtocolToolArgsError(`参数 "${key}" 类型错误,应为字符串数组`)
    const out: string[] = []
    for (const item of value) {
      if (typeof item !== 'string') throw new ProtocolToolArgsError(`参数 "${key}" 类型错误,数组元素应为字符串`)
      const normalized = item.trim()
      if (normalized.length > 0) out.push(normalized)
    }
    return out.length === 0 ? undefined : out
  }

  /** 提取必填对象参数（非纯对象抛错） */
  public requireObject(args: ProtocolToolArgs, key: string): AiJsonParams {
    const value = args[key]
    if (!isJsonObject(value)) throw new ProtocolToolArgsError(`参数 "${key}" 缺失或不是 JSON 对象`)
    return value
  }

  /** 提取可选对象参数（缺失/null → 空对象，非对象抛错）。 */
  public optionalObject(args: ProtocolToolArgs, key: string): AiJsonParams {
    if (!(key in args)) return {}
    const value = args[key]
    if (value === null || value === undefined) return {}
    if (!isJsonObject(value)) throw new ProtocolToolArgsError(`参数 "${key}" 不是 JSON 对象`)
    return value
  }

  /** 提取必填任意值参数（key 不存在或值为 undefined 抛错） */
  public requireValue(args: ProtocolToolArgs, key: string): AiJsonValue {
    if (!(key in args)) throw new ProtocolToolArgsError(`参数 "${key}" 缺失`)
    const value = args[key]
    if (value === undefined) throw new ProtocolToolArgsError(`参数 "${key}" 缺失`)
    return value
  }
}

/* -------------------------------------------------------------------------------
 * 三、内部类型守卫
 * ----------------------------------------------------------------------------- */

/** 判定 AiJsonValue 是否为纯对象（非 null、非数组） */
function isJsonObject(value: AiJsonValue | undefined): value is AiJsonParams {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)
}
