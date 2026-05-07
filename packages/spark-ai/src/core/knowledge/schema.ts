export type KnowledgeJsonSchema = Record<string, unknown>

function parseLiteralUnion(typeText: string): string[] {
  const values = typeText
    .split('|')
    .map(part => part.trim())
    .filter(part => /^['"].*['"]$/u.test(part))
    .map(part => part.slice(1, -1))

  return values.length > 0 ? values : []
}

export function inferJsonSchemaFromTypeText(typeText: string): KnowledgeJsonSchema {
  const normalized = typeText.trim().toLowerCase()
  const enumValues = parseLiteralUnion(typeText)
  if (enumValues.length > 0) {
    return { type: 'string', enum: enumValues }
  }

  if (normalized.includes('boolean')) return { type: 'boolean' }
  if (normalized.includes('number') || normalized.includes('integer') || normalized.includes('float')) return { type: 'number' }
  if (normalized.includes('array') || normalized.includes('[]')) return { type: 'array', items: { type: 'object' } }
  if (normalized.includes('record') || normalized.includes('object') || normalized.includes('{')) return { type: 'object' }
  return { type: 'string' }
}
