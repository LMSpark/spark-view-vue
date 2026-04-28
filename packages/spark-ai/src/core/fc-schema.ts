import type { StillDefinition } from './stills/types'
import { getAllStills } from './stills/dispatcher'
import type { JsonSchemaProperty, ToolDefinition } from './session/session-contracts'

export function actionToFunctionName(action: string): string {
  return action.replace(/\./g, '_')
}

export function functionNameToAction(name: string, registry?: ReadonlyMap<string, unknown>): string {
  const stills = registry ?? getAllStills()
  for (const [action] of stills) {
    if (actionToFunctionName(action) === name) {
      return action
    }
  }
  const idx = name.indexOf('_')
  if (idx > 0) {
    return `${name.slice(0, idx)}.${name.slice(idx + 1)}`
  }
  return name
}

// FC tool definitions are derived directly from still definitions (SSoT).
// String/object descriptors in `paramsSchema` are converted to JSON Schema below.
function inferPropertySchema(raw: string): { prop: JsonSchemaProperty; required: boolean } {
  const dashIdx = raw.indexOf('—')
  const typePart = dashIdx > 0 ? raw.slice(0, dashIdx).trim() : raw.trim()
  const descPart = dashIdx > 0 ? raw.slice(dashIdx + 1).trim() : undefined

  const optional = typePart.endsWith('?') || typePart.includes('undefined')
  const cleanType = typePart.endsWith('?') ? typePart.slice(0, -1).trim() : typePart

  const unionParts = cleanType
    .split('|')
    .map(part => part.trim().toLowerCase())
    .filter(part => part.length > 0 && part !== 'null' && part !== 'undefined')

  const prop: JsonSchemaProperty = { type: 'string' }
  if (descPart) prop.description = descPart

  if (unionParts.some(part => part.endsWith('[]') || part.startsWith('array<'))) {
    prop.type = 'array'
    prop.items = { type: 'object' }
  } else if (unionParts.some(part => part === 'number' || part === 'integer')) {
    prop.type = 'number'
  } else if (unionParts.some(part => part === 'boolean')) {
    prop.type = 'boolean'
  } else if (unionParts.some(part => part === 'string' || /^".*"$/u.test(part) || /^'.*'$/u.test(part))) {
    prop.type = 'string'
  } else {
    prop.type = 'object'
  }

  return { prop, required: !optional }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function inferPropertySchemaFromUnknown(rawDesc: unknown): { prop: JsonSchemaProperty; required: boolean } {
  if (typeof rawDesc === 'string') {
    return inferPropertySchema(rawDesc)
  }

  if (!isPlainRecord(rawDesc)) {
    return { prop: { type: 'object' }, required: true }
  }

  const kind = rawDesc['kind']
  const note = typeof rawDesc['note'] === 'string' ? rawDesc['note'] : undefined

  if (kind === 'enum') {
    const rawEnum = Array.isArray(rawDesc['enum']) ? rawDesc['enum'] : []
    const enumValues = rawEnum.filter(item => typeof item === 'string' || typeof item === 'number')
    const schemaType = rawDesc['type'] === 'number' ? 'number' : 'string'
    const nullable = rawDesc['nullable'] === true
    const optional = rawDesc['optional'] === true
    const openEnded = rawDesc['openEnded'] === true
    const descriptionParts = [note]

    if (enumValues.length > 0) {
      descriptionParts.push(`推荐值: ${enumValues.map(item => JSON.stringify(item)).join(' | ')}`)
    }
    if (openEnded) {
      descriptionParts.push('也允许自定义值')
    }

    return {
      prop: {
        type: nullable ? [schemaType, 'null'] : schemaType,
        ...(descriptionParts.filter(Boolean).length > 0
          ? { description: descriptionParts.filter(Boolean).join('；') }
          : {}),
        ...(!openEnded && enumValues.length > 0
          ? { enum: nullable ? [...enumValues, null] : enumValues }
          : {}),
      },
      required: !optional,
    }
  }

  if (kind === 'array') {
    const itemSchema = inferPropertySchemaFromUnknown(rawDesc['items']).prop
    return {
      prop: {
        type: 'array',
        ...(note ? { description: note } : {}),
        items: itemSchema,
      },
      required: true,
    }
  }

  if (kind === 'object') {
    const properties: Record<string, JsonSchemaProperty> = {}
    const requiredSet = new Set<string>()

    const required = rawDesc['required']
    if (Array.isArray(required)) {
      for (const key of required) {
        if (typeof key === 'string' && key.length > 0) requiredSet.add(key)
      }
    }

    const rawProperties = isPlainRecord(rawDesc['properties']) ? rawDesc['properties'] : {}
    for (const [key, value] of Object.entries(rawProperties)) {
      const inferred = inferPropertySchemaFromUnknown(value)
      properties[key] = inferred.prop
      if (inferred.required) requiredSet.add(key)
    }

    const optionalProperties = isPlainRecord(rawDesc['optional']) ? rawDesc['optional'] : {}
    for (const [key, value] of Object.entries(optionalProperties)) {
      const inferred = inferPropertySchemaFromUnknown(value)
      properties[key] = inferred.prop
      requiredSet.delete(key)
    }

    return {
      prop: {
        type: 'object',
        ...(note ? { description: note } : {}),
        properties,
        ...(requiredSet.size > 0 ? { required: Array.from(requiredSet) } : {}),
      },
      required: true,
    }
  }

  const properties: Record<string, JsonSchemaProperty> = {}
  const required: string[] = []
  for (const [key, value] of Object.entries(rawDesc)) {
    const inferred = inferPropertySchemaFromUnknown(value)
    properties[key] = inferred.prop
    if (inferred.required) required.push(key)
  }

  return {
    prop: {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
    },
    required: true,
  }
}

function inferToolParametersFromSchema(paramsSchema: unknown): { properties: Record<string, JsonSchemaProperty>; required: string[] } {
  if (!isPlainRecord(paramsSchema)) {
    return { properties: {}, required: [] }
  }

  if (paramsSchema['kind'] === 'object') {
    const inferred = inferPropertySchemaFromUnknown(paramsSchema)
    return {
      properties: inferred.prop.properties ?? {},
      required: inferred.prop.required ?? [],
    }
  }

  const properties: Record<string, JsonSchemaProperty> = {}
  const required: string[] = []
  for (const [key, rawDesc] of Object.entries(paramsSchema)) {
    const inferred = inferPropertySchemaFromUnknown(rawDesc)
    properties[key] = inferred.prop
    if (inferred.required) required.push(key)
  }

  return { properties, required }
}

export function stillToToolDefinition(still: StillDefinition): ToolDefinition {
  const { properties, required } = inferToolParametersFromSchema(still.paramsSchema)

  const descParts = [still.description]
  if (still.guardDescription) {
    descParts.push(`前置条件: ${still.guardDescription}`)
  }
  if (still.usageRules && still.usageRules.length > 0) {
    descParts.push(`规则: ${still.usageRules.join('；')}`)
  }

  return {
    type: 'function',
    function: {
      name: actionToFunctionName(still.action),
      description: descParts.join('。'),
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

  for (const [, still] of getAllStills()) {
    if (filter?.types && !filter.types.includes(still.type)) {
      continue
    }
    if (allowedActions && !allowedActions.has(still.action)) {
      continue
    }

    const definition = stillToToolDefinition(still)

    tools.push(
      filter?.compactDescriptions
        ? {
            type: 'function',
            function: {
              ...definition.function,
              description: still.description,
            },
          }
        : definition,
    )
  }

  return tools
}
