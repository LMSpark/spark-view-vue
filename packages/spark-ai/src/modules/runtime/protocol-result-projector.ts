/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  MODULE-SEMANTIC · 协议结果投影器                                             │
 * │  Protocol Result Projector                                                    │
 * │                                                                              │
 * │  本模块负责将内部操作结果投影为 LLM 兼容的 JSON 格式。                          │
 * │  核心职责是将类型安全的 AiModuleResult<T> 映射到                         │
 * │  AiModuleResult<AiJsonValue>（LLM 只能消费 JSON）。                    │
 * │                                                                              │
 * │  投影策略：                                                                   │
 * │    · voidResult        — setAttribute 等（T=void → AiJsonValue）            │
 * │    · instanceListResult — listChildren/findInstance（T=InstanceRef[] → JSON）│
 * │    · describeKindResult — describeKind（T=AiModuleDescription → JSON）      │
 * │    · jsonResult         — knowledge 工具等结构化结果 → JSON                  │
 * │                                                                              │
 * │  调用方：ProtocolToolRouter（各路由方法的结果出口统一经过本投影器）             │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import type { AiJsonValue } from '../../json'
import type { AiModuleDescription } from '../internal/navigator'
import {
  AiModuleResult,
  type AiModuleInstanceRef,
} from '../protocol'

/* -------------------------------------------------------------------------------
 * 一、ProtocolResultProjector
 * ----------------------------------------------------------------------------- */

export class ProtocolResultProjector {
  /**
   * 通用 JSON 结果投影：用于 knowledge 工具等已经是结构化对象的返回值。
   * 递归丢弃 undefined，并把无法 JSON 表达的运行时值转为 null。
   */
  public jsonResult(result: AiModuleResult<unknown>): AiModuleResult<AiJsonValue> {
    if (!result.ok) return AiModuleResult.passthroughFailure(result)
    if (result.data === undefined) {
      return AiModuleResult.ok<AiJsonValue>(undefined, result.checks, result.state)
    }
    return AiModuleResult.ok(unknownToJson(result.data), result.checks, result.state)
  }

  /**
   * void 结果投影：setAttribute 等无返回值操作。
   * 成功时返回 undefined 作为 data（LLM 看到的是 null/空）。
   */
  public voidResult(result: AiModuleResult<void>): AiModuleResult<AiJsonValue> {
    if (!result.ok) return AiModuleResult.passthroughFailure(result)
    return AiModuleResult.ok<AiJsonValue>(undefined, result.checks, result.state)
  }

  /**
   * 实例列表投影：listChildren / findInstance 的结果。
   * 将 AiModuleInstanceRef[] 映射为 JSON 对象数组。
   */
  public instanceListResult(
    result: AiModuleResult<readonly AiModuleInstanceRef[]>,
  ): AiModuleResult<AiJsonValue> {
    if (!result.ok) return AiModuleResult.passthroughFailure(result)
    const data = result.data ?? []
    return AiModuleResult.ok(data.map((ref) => instanceRefToJson(ref)), result.checks, result.state)
  }

  /**
   * describeKind 结果投影：将类型安全的 AiModuleDescription 转为 JSON 对象。
   * attributes 和 functions 的 schema 字段通过 jsonSchemaToJson 递归序列化。
   */
  public describeKindResult(
    result: AiModuleResult<AiModuleDescription>,
  ): AiModuleResult<AiJsonValue> {
    if (!result.ok) return AiModuleResult.passthroughFailure(result)
    if (result.data === undefined) {
      return AiModuleResult.ok<AiJsonValue>(undefined, result.checks, result.state)
    }
    return AiModuleResult.ok({
      kind: result.data.kind,
      name: result.data.name,
      description: result.data.description,
      ...(result.data.parentKind === undefined ? {} : { parentKind: result.data.parentKind }),
      attributes: result.data.attributes.map((attr) => describeAttributeToJson(attr)),
      functions: result.data.functions.map((fn) => describeFunctionToJson(fn)),
      payloads: result.data.payloads.map((payload) => describePayloadToJson(payload)),
      children: [...result.data.children],
    }, result.checks, result.state)
  }
}

/* -------------------------------------------------------------------------------
 * 二、内部：JSON 序列化辅助
 * ----------------------------------------------------------------------------- */

/** 单个属性元数据 → JSON（含 schema 的递归序列化） */
function describeAttributeToJson(attr: AiModuleDescription['attributes'][number]): Record<string, AiJsonValue> {
  const out: Record<string, AiJsonValue> = {
    name: attr.name,
    description: attr.description,
    readable: attr.readable,
    writable: attr.writable,
    schema: jsonSchemaToJson(attr.schema),
  }
  if (attr.example !== undefined) out['example'] = attr.example
  return out
}

/** 单个函数元数据 → JSON（含 paramsSchema/resultSchema/usageRules/failureModes） */
function describeFunctionToJson(fn: AiModuleDescription['functions'][number]): Record<string, AiJsonValue> {
  return {
    name: fn.name,
    description: fn.description,
    paramsSchema: jsonSchemaToJson(fn.paramsSchema),
    resultSchema: fn.resultSchema === undefined ? null : jsonSchemaToJson(fn.resultSchema),
    usageRules: fn.usageRules === undefined ? [] : [...fn.usageRules],
    requiredBeforeCall: fn.requiredBeforeCall === undefined ? [] : [...fn.requiredBeforeCall],
    failureModes: fn.failureModes === undefined
      ? []
      : fn.failureModes.map((mode) => ({ code: mode.code, when: mode.when, fix: mode.fix })),
    example: fn.example === undefined ? null : unknownToJson(fn.example),
    examples: fn.examples === undefined ? [] : unknownToJson(fn.examples),
    antiExamples: fn.antiExamples === undefined ? [] : unknownToJson(fn.antiExamples),
  }
}

/** 单个参数荷载元数据 → JSON */
function describePayloadToJson(payload: AiModuleDescription['payloads'][number]): Record<string, AiJsonValue> {
  return {
    payloadRef: payload.payloadRef,
    description: payload.description,
    requiredForFunctions: payload.requiredForFunctions === undefined ? [] : [...payload.requiredForFunctions],
  }
}

/** 递归将任意 schema 值投影为 AiJsonValue（处理嵌套 object/array/boolean schema） */
function jsonSchemaToJson(schema: unknown): AiJsonValue {
  return unknownToJson(schema)
}

/** 递归将任意运行时值投影为 AiJsonValue。 */
function unknownToJson(value: unknown): AiJsonValue {
  if (value === undefined) return null
  if (value === null) return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((item) => unknownToJson(item))
  if (typeof value === 'object') {
    const out: Record<string, AiJsonValue> = {}
    for (const [key, nested] of Object.entries(value)) {
      if (nested === undefined) continue
      out[key] = unknownToJson(nested)
    }
    return out
  }
  return null
}

/** 子实例引用 → JSON */
function instanceRefToJson(ref: AiModuleInstanceRef): AiJsonValue {
  const base: Record<string, AiJsonValue> = { id: ref.id, label: ref.label }
  if (ref.summary !== undefined) base['summary'] = ref.summary
  return base
}
