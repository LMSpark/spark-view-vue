import type {
  LlmJsonSchema,
  LlmJsonSchemaObject,
  LlmParameterSchemaRoot,
} from '../protocol/parameter-schema'

// 这里不再为 JS 基础类型保留导出别名，直接使用原生类型。

export type JsonSchemaProperties = Readonly<Record<string, LlmJsonSchema>>

export function anySchema(description?: string): LlmJsonSchemaObject {
  return {
    ...(description !== undefined ? { description } : {}),
  }
}

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

export function numberSchema(description: string, options: { nullable?: boolean } = {}): LlmJsonSchemaObject {
  return {
    type: options.nullable === true ? ['number', 'null'] : 'number',
    description,
  }
}

export function booleanSchema(description: string, options: { nullable?: boolean } = {}): LlmJsonSchemaObject {
  return {
    type: options.nullable === true ? ['boolean', 'null'] : 'boolean',
    description,
  }
}

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

export function arraySchema(items: LlmJsonSchema = anySchema(), description?: string): LlmJsonSchemaObject {
  return {
    type: 'array',
    items,
    ...(description !== undefined ? { description } : {}),
  }
}

export function objectSchema(
  properties: JsonSchemaProperties = {},
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

export function paramsSchema(
  properties: JsonSchemaProperties = {},
  required: readonly string[] = [],
  description?: string,
): LlmParameterSchemaRoot {
  return objectSchema(properties, {
    required,
    ...(description !== undefined ? { description } : {}),
  })
}

export function noParamsSchema(description = '不接受参数，请传 {} 或留空。'): LlmParameterSchemaRoot {
  return objectSchema({}, {
    additionalProperties: false,
    description,
  })
}
