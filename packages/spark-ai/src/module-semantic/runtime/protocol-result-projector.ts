import type { LlmJsonValue } from '../../schema'
import type { ModuleKindDescription } from '../internal/navigator'
import {
  ModuleOperationResult,
  type ModuleInstanceRef,
} from '../protocol'

export class ProtocolResultProjector {
  public voidResult(result: ModuleOperationResult<void>): ModuleOperationResult<LlmJsonValue> {
    if (!result.ok) return ModuleOperationResult.passthroughFailure(result)
    return ModuleOperationResult.ok<LlmJsonValue>(undefined, result.checks, result.state)
  }

  public instanceListResult(
    result: ModuleOperationResult<readonly ModuleInstanceRef[]>,
  ): ModuleOperationResult<LlmJsonValue> {
    if (!result.ok) return ModuleOperationResult.passthroughFailure(result)
    const data = result.data ?? []
    return ModuleOperationResult.ok(data.map((ref) => instanceRefToJson(ref)), result.checks, result.state)
  }

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
      attributes: result.data.attributes.map((attr) => describeAttributeToJson(attr)),
      actions: result.data.actions.map((action) => describeActionToJson(action)),
      children: [...result.data.children],
    }, result.checks, result.state)
  }
}

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

function instanceRefToJson(ref: ModuleInstanceRef): LlmJsonValue {
  const base: Record<string, LlmJsonValue> = { id: ref.id, label: ref.label }
  if (ref.summary !== undefined) base['summary'] = ref.summary
  return base
}
