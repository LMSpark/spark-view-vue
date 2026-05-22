/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  MODULE-SEMANTIC · 协议结果投影器                                             │
 * │  Protocol Result Projector                                                    │
 * │                                                                              │
 * │  本模块负责将内部操作结果投影为 LLM 兼容的 JSON 格式。                          │
 * │  核心职责是将类型安全的 ModuleOperationResult<T> 映射到                         │
 * │  ModuleOperationResult<LlmJsonValue>（LLM 只能消费 JSON）。                    │
 * │                                                                              │
 * │  三种投影策略：                                                               │
 * │    · voidResult        — setAttribute 等（T=void → LlmJsonValue）            │
 * │    · instanceListResult — listChildren/findInstance（T=InstanceRef[] → JSON）│
 * │    · describeKindResult — describeKind（T=ModuleKindDescription → JSON）      │
 * │                                                                              │
 * │  调用方：ProtocolToolRouter（各路由方法的结果出口统一经过本投影器）             │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import type { LlmJsonValue } from '../../schema'
import type { ModuleKindDescription } from '../internal/navigator'
import {
  ModuleOperationResult,
  type ModuleInstanceRef,
} from '../protocol'

/* -------------------------------------------------------------------------------
 * 一、ProtocolResultProjector
 * ----------------------------------------------------------------------------- */

export class ProtocolResultProjector {
  /**
   * void 结果投影：setAttribute 等无返回值操作。
   * 成功时返回 undefined 作为 data（LLM 看到的是 null/空）。
   */
  public voidResult(result: ModuleOperationResult<void>): ModuleOperationResult<LlmJsonValue> {
    if (!result.ok) return ModuleOperationResult.passthroughFailure(result)
    return ModuleOperationResult.ok<LlmJsonValue>(undefined, result.checks, result.state)
  }

  /**
   * 实例列表投影：listChildren / findInstance 的结果。
   * 将 ModuleInstanceRef[] 映射为 JSON 对象数组。
   */
  public instanceListResult(
    result: ModuleOperationResult<readonly ModuleInstanceRef[]>,
  ): ModuleOperationResult<LlmJsonValue> {
    if (!result.ok) return ModuleOperationResult.passthroughFailure(result)
    const data = result.data ?? []
    return ModuleOperationResult.ok(data.map((ref) => instanceRefToJson(ref)), result.checks, result.state)
  }

  /**
   * describeKind 结果投影：将类型安全的 ModuleKindDescription 转为 JSON 对象。
   * attributes 和 actions 的 schema 字段通过 jsonSchemaToJson 递归序列化。
   */
  public describeKindResult(
    result: ModuleOperationResult<ModuleKindDescription>,
  ): ModuleOperationResult<LlmJsonValue> {
    if (!result.ok) return ModuleOperationResult.passthroughFailure(result)
    if (result.data === undefined) {
      return ModuleOperationResult.ok<LlmJsonValue>(undefined, result.checks, result.state)
    }
    return ModuleOperationResult.ok({
      kind: result.data.kind,
      name: result.data.name,
      description: result.data.description,
      ...(result.data.parentKind === undefined ? {} : { parentKind: result.data.parentKind }),
      attributes: result.data.attributes.map((attr) => describeAttributeToJson(attr)),
      actions: result.data.actions.map((action) => describeActionToJson(action)),
      children: [...result.data.children],
    }, result.checks, result.state)
  }
}

/* -------------------------------------------------------------------------------
 * 二、内部：JSON 序列化辅助
 * ----------------------------------------------------------------------------- */

/** 单个属性元数据 → JSON（含 schema 的递归序列化） */
function describeAttributeToJson(attr: ModuleKindDescription['attributes'][number]): Record<string, LlmJsonValue> {
  const out: Record<string, LlmJsonValue> = {
    name: attr.name,
    description: attr.description,
    readable: attr.readable,
    writable: attr.writable,
    schema: jsonSchemaToJson(attr.schema),
  }
  if (attr.example !== undefined) out['example'] = attr.example
  return out
}

/** 单个动作元数据 → JSON（含 paramsSchema/resultSchema/usageRules/failureModes） */
function describeActionToJson(action: ModuleKindDescription['actions'][number]): Record<string, LlmJsonValue> {
  return {
    name: action.name,
    description: action.description,
    paramsSchema: jsonSchemaToJson(action.paramsSchema),
    resultSchema: action.resultSchema === undefined ? null : jsonSchemaToJson(action.resultSchema),
    usageRules: action.usageRules === undefined ? [] : [...action.usageRules],
    failureModes: action.failureModes === undefined
      ? []
      : action.failureModes.map((mode) => ({ code: mode.code, when: mode.when, fix: mode.fix })),
    example: action.example === undefined ? null : action.example,
  }
}

/** 递归将任意 schema 值投影为 LlmJsonValue（处理嵌套 object/array/boolean schema） */
function jsonSchemaToJson(schema: unknown): LlmJsonValue {
  if (schema === null) return null
  if (typeof schema === 'boolean') return schema
  if (typeof schema === 'number') return schema
  if (typeof schema === 'string') return schema
  if (Array.isArray(schema)) return schema.map((item) => jsonSchemaToJson(item))
  if (typeof schema === 'object') {
    const out: Record<string, LlmJsonValue> = {}
    for (const [key, value] of Object.entries(schema)) {
      if (value === undefined) continue
      out[key] = jsonSchemaToJson(value)
    }
    return out
  }
  return null
}

/** 子实例引用 → JSON */
function instanceRefToJson(ref: ModuleInstanceRef): LlmJsonValue {
  const base: Record<string, LlmJsonValue> = { id: ref.id, label: ref.label }
  if (ref.summary !== undefined) base['summary'] = ref.summary
  return base
}
