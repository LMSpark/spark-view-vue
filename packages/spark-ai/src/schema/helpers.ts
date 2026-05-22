/**
 * ═══════════════════════════════════════════════════════════════
 * schema/helpers.ts — JSON Schema 便捷构造器
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】schema 层中间件，依赖 types.ts，被 validator.ts 和业务层消费。
 *   为函数注册的 paramsSchema 提供类型安全的快捷创建函数。
 *
 * 【设计决策】
 *   - 每个构造器返回标准 LlmJsonSchemaObject，避免手写时遗漏 type/properties。
 *   - 所有函数都是纯工厂，无副作用、无状态。
 *   - `paramsSchema()` 专门用于函数参数根节点，强制 type=object。
 *
 * 【消费方】module-semantic/protocol/module-kind.ts（ModuleActionMetadata.paramsSchema）、
 *   所有业务 ModuleKind 子类的 action 注册。
 *
 * ═══════════════════════════════════════════════════════════════
 * 函数层级（自底向上）：
 *
 *   基础类型构造器          复合构造器            根节点构造器
 *   ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
 *   │ stringSchema │     │ enumSchema   │     │ paramsSchema     │
 *   │ numberSchema │     │ arraySchema  │     │ noParamsSchema   │
 *   │ booleanSchema│     │ objectSchema │     └──────────────────┘
 *   │ anySchema    │     └──────────────┘
 *   └──────────────┘
 * ═══════════════════════════════════════════════════════════════
 */

import type {
  LlmJsonSchema,
  LlmJsonSchemaObject,
} from './types'

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 基础类型构造器 — 标量类型的快捷创建
// ═══════════════════════════════════════════════════════════════

/** 任意类型 schema（无 type 约束，仅带可选描述） */
export function anySchema(description?: string): LlmJsonSchemaObject {
  return {
    ...(description !== undefined ? { description } : {}),
  }
}

/** 字符串 schema，可选 nullable / minLength */
export function stringSchema(
  description: string,
  options: { nullable?: boolean; minLength?: number } = {},
): LlmJsonSchemaObject {
  return {
    type: options.nullable === true ? ['string', 'null'] : 'string',
    description,
    ...(options.minLength !== undefined ? { minLength: options.minLength } : {}),
  }
}

/** 数字 schema，可选 nullable */
export function numberSchema(description: string, options: { nullable?: boolean } = {}): LlmJsonSchemaObject {
  return {
    type: options.nullable === true ? ['number', 'null'] : 'number',
    description,
  }
}

/** 布尔 schema，可选 nullable */
export function booleanSchema(description: string, options: { nullable?: boolean } = {}): LlmJsonSchemaObject {
  return {
    type: options.nullable === true ? ['boolean', 'null'] : 'boolean',
    description,
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 复合构造器 — 枚举 / 数组 / 对象
// ═══════════════════════════════════════════════════════════════

/** 枚举 schema，自动推断 type（string/number），可选 nullable */
export function enumSchema(
  values: ReadonlyArray<string | number | boolean | null>,
  description: string,
  options: { type?: 'string' | 'number'; nullable?: boolean } = {},
): LlmJsonSchemaObject {
  const type = options.type ?? (values.some(value => typeof value === 'number') ? 'number' : 'string')
  return {
    type: options.nullable === true ? [type, 'null'] : type,
    enum: options.nullable === true ? [...values, null] : [...values],
    description,
  }
}

/** 数组 schema，items 默认为 anySchema() */
export function arraySchema(items: LlmJsonSchema = anySchema(), description?: string): LlmJsonSchemaObject {
  return {
    type: 'array',
    items,
    ...(description !== undefined ? { description } : {}),
  }
}

/** 对象 schema，type=object + properties + required + additionalProperties */
export function objectSchema(
  properties: Readonly<Record<string, LlmJsonSchema>> = {},
  options: {
    required?: readonly string[]
    description?: string
    additionalProperties?: LlmJsonSchema
  } = {},
): LlmJsonSchemaObject {
  return {
    type: 'object',
    properties,
    ...(options.required !== undefined && options.required.length > 0 ? { required: [...options.required] } : {}),
    ...(options.description !== undefined ? { description: options.description } : {}),
    ...(options.additionalProperties !== undefined ? { additionalProperties: options.additionalProperties } : {}),
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · 根节点构造器 — 函数 paramsSchema 入口
// ═══════════════════════════════════════════════════════════════

/**
 * 函数参数根 schema。
 * 调用 `paramsSchema({...}, ['requiredField1'])` 等效于
 * `objectSchema({...}, { required: ['requiredField1'] })`，
 * 但返回类型明确为 LlmJsonSchemaObject。
 */
export function paramsSchema(
  properties: Readonly<Record<string, LlmJsonSchema>> = {},
  required: readonly string[] = [],
  description?: string,
): LlmJsonSchemaObject {
  return objectSchema(properties, {
    required,
    ...(description !== undefined ? { description } : {}),
  })
}

/**
 * 无参数动作的 schema。
 * additionalProperties: false 告诉 LLM 不要传任何参数。
 */
export function noParamsSchema(description = '不接受参数，请传 {} 或留空。'): LlmJsonSchemaObject {
  return objectSchema({}, {
    additionalProperties: false,
    description,
  })
}
