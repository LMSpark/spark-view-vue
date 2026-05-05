import type { RegisteredFunctionDefinition } from './function-contracts'
import { getFunctionCarrierByAction } from '../registry/function-carrier-registry'
import { getAllFunctionDefinitions } from '../registry/function-registry'
import type { JsonSchemaProperty, ToolDefinition } from './session-contracts'
import {
  isArraySchema,
  isEnumSchema,
  isObjectSchema,
  isPlainRecord,
  normalizeSchemaNode,
  parseLeafDescription,
} from './schema-ir'

export function actionToFunctionName(action: string): string {
  return action.replace(/[@.]/g, '_')
}

export function functionNameToAction(name: string, registry?: ReadonlyMap<string, unknown>): string {
  const definitions = registry ?? getAllFunctionDefinitions()
  for (const [action] of definitions) {
    if (actionToFunctionName(action) === name) {
      return action
    }
  }

  const segments = name.split('_').filter(segment => segment.length > 0)
  if (segments.length >= 3) {
    return `${segments[0]}@${segments[1]}@${segments.slice(2).join('_')}`
  }
  return name
}

function withNullable(type: string, allowsNull: boolean): string | string[] {
  return allowsNull ? [type, 'null'] : type
}

function leafPropertySchema(raw: string): { prop: JsonSchemaProperty; required: boolean } {
  const parsed = parseLeafDescription(raw)
  let type = 'object'
  let items: JsonSchemaProperty | undefined

  if (parsed.expectedKinds.has('array')) {
    type = 'array'
    items = { type: parsed.arrayItemKind ?? 'object' }
  } else if (parsed.expectedKinds.has('number')) {
    type = 'number'
  } else if (parsed.expectedKinds.has('boolean')) {
    type = 'boolean'
  } else if (parsed.expectedKinds.has('string')) {
    type = 'string'
  } else if (parsed.expectedKinds.has('unknown')) {
    type = 'object'
  }

  return {
    prop: {
      type: withNullable(type, parsed.allowsNull),
      ...(parsed.description !== undefined ? { description: parsed.description } : {}),
      ...(items !== undefined ? { items } : {}),
    },
    required: !parsed.optional,
  }
}

function inferPropertySchemaFromNode(rawSchema: unknown): { prop: JsonSchemaProperty; required: boolean } {
  const schema = normalizeSchemaNode(rawSchema)

  if (typeof schema === 'string') {
    return leafPropertySchema(schema)
  }

  if (isEnumSchema(schema)) {
    const schemaType = schema.type ?? 'string'
    const nullable = schema.nullable === true
    const openEnded = schema.openEnded === true
    const descriptionParts = [schema.note]

    if (schema.enum.length > 0) {
      descriptionParts.push(`推荐值: ${schema.enum.map(item => JSON.stringify(item)).join(' | ')}`)
    }
    if (openEnded) {
      descriptionParts.push('也允许自定义值')
    }

    return {
      prop: {
        type: withNullable(schemaType, nullable),
        ...(descriptionParts.filter(Boolean).length > 0
          ? { description: descriptionParts.filter(Boolean).join('；') }
          : {}),
        ...(!openEnded && schema.enum.length > 0
          ? { enum: nullable ? [...schema.enum, null] : [...schema.enum] }
          : {}),
      },
      required: schema.optional !== true,
    }
  }

  if (isArraySchema(schema)) {
    const itemSchema = inferPropertySchemaFromNode(schema.items).prop
    return {
      prop: {
        type: 'array',
        ...(schema.note ? { description: schema.note } : {}),
        items: itemSchema,
      },
      required: true,
    }
  }

  if (isObjectSchema(schema)) {
    const properties: Record<string, JsonSchemaProperty> = {}
    const requiredSet = new Set<string>()

    const requiredKeys = schema.required ?? []
    for (const key of requiredKeys) {
      if (key.length > 0) {
        requiredSet.add(key)
      }
    }

    const rawProperties = isPlainRecord(schema.properties) ? schema.properties : {}
    for (const [key, value] of Object.entries(rawProperties)) {
      const inferred = inferPropertySchemaFromNode(value)
      properties[key] = inferred.prop
      if (inferred.required) requiredSet.add(key)
    }

    const optionalProperties = isPlainRecord(schema.optional) ? schema.optional : {}
    for (const [key, value] of Object.entries(optionalProperties)) {
      const inferred = inferPropertySchemaFromNode(value)
      properties[key] = inferred.prop
      requiredSet.delete(key)
    }

    return {
      prop: {
        type: 'object',
        ...(schema.note ? { description: schema.note } : {}),
        properties,
        ...(requiredSet.size > 0 ? { required: Array.from(requiredSet) } : {}),
      },
      required: true,
    }
  }

  return { prop: { type: 'object' }, required: true }
}

function inferParametersFromSchema(paramsSchema: unknown): { properties: Record<string, JsonSchemaProperty>; required: string[] } {
  if (!isPlainRecord(paramsSchema)) {
    return { properties: {}, required: [] }
  }

  const normalized = normalizeSchemaNode(paramsSchema)
  if (isObjectSchema(normalized)) {
    const inferred = inferPropertySchemaFromNode(normalized)
    return {
      properties: inferred.prop.properties ?? {},
      required: inferred.prop.required ?? [],
    }
  }

  return { properties: {}, required: [] }
}

export function functionToToolDefinition<TParams, TResult>(
  definition: RegisteredFunctionDefinition<TParams, TResult>,
): ToolDefinition {
  const { properties, required } = inferParametersFromSchema(definition.paramsSchema)
  const modulePrompt = getFunctionCarrierByAction(definition.action)?.prompt ?? definition.modulePrompt

  const descriptionParts = [definition.description]
  if (modulePrompt) {
    descriptionParts.push(`模块提示: ${modulePrompt}`)
  }
  if (definition.guardDescription) {
    descriptionParts.push(`前置条件: ${definition.guardDescription}`)
  }
  if (definition.usageRules && definition.usageRules.length > 0) {
    descriptionParts.push(`规则: ${definition.usageRules.join('；')}`)
  }

  return {
    type: 'function',
    function: {
      name: actionToFunctionName(definition.action),
      description: descriptionParts.join('。'),
      parameters: {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
      },
    },
  }
}

export function generateToolDefinitions(
  filter?: {
    types?: Array<'request' | 'describe'>
    actions?: string[]
    compactDescriptions?: boolean
  },
): ToolDefinition[] {
  const tools: ToolDefinition[] = []
  const allowedActions = filter?.actions ? new Set(filter.actions) : null

  for (const [, definition] of getAllFunctionDefinitions()) {
    if (filter?.types && !filter.types.includes(definition.type)) {
      continue
    }
    if (allowedActions && !allowedActions.has(definition.action)) {
      continue
    }

    const toolDefinition = functionToToolDefinition(definition)

    tools.push(
      filter?.compactDescriptions
        ? {
            type: 'function',
            function: {
              ...toolDefinition.function,
              description: definition.description,
            },
          }
        : toolDefinition,
    )
  }

  return tools
}