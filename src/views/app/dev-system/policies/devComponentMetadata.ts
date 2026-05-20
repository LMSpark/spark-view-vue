import type { JsonObject, JsonValue, RuleEditorComponentMetadata } from '@spark-view/spark-page-config/page/workspace'
import { skillCatalog, type PropMeta, type SkillMeta } from 'virtual:spark-skill-catalog'

const STRUCT_KEYS = new Set(['type', 'props', 'children', 'id'])

function isConfigurableProp(prop: PropMeta): boolean {
  return !STRUCT_KEYS.has(prop.name)
}

function parseEnumFromTypeString(type: string): string[] {
  const values = [...type.matchAll(/["']([^"']+)["']/g)]
    .map(match => match[1])
    .filter((value): value is string => value !== undefined && value.length > 0)
  return values.length >= 2 ? [...new Set(values)] : []
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isJsonValue(value: unknown): value is JsonValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) return true
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (!isJsonRecord(value)) return false
  return Object.values(value).every(isJsonValue)
}

function parseJsonDefault(raw: string): JsonValue | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isJsonValue(parsed)) throw new Error('default prop metadata is not JSON serializable')
    return parsed
  } catch {
    return raw
  }
}

function inferDefaultFromProp(prop: PropMeta): JsonValue {
  if (prop.default !== undefined) {
    return parseJsonDefault(prop.default)
  }

  const type = prop.type.toLowerCase()
  if (type.includes('number')) return 0
  if (type.includes('boolean')) return false
  if (type.includes('[]') || type.includes('array')) return []
  return ''
}

function extractShortLabel(description: string | undefined): string {
  const match = /^([\u4e00-\u9fff]+)/.exec(description ?? '')
  if (!match?.[1]) return ''
  const label = match[1].replace(/(?:容器|组件|字段|节点|页面)$/, '')
  return label.length >= 2 ? label : ''
}

function createTypeLabel(skill: SkillMeta): string {
  const label = extractShortLabel(skill.description)
  return label.length > 0 ? `[${label}] ${skill.type}` : skill.type
}

const devSkills = [...skillCatalog]
  .filter(skill => skill.type.trim().length > 0)
  .sort((a, b) => a.type.localeCompare(b.type))

export const DEV_TYPES: string[] = devSkills.map(skill => skill.type)

export const DEV_PROP_NAMES: Record<string, string[]> = Object.fromEntries(
  devSkills.map(skill => [
    skill.type,
    (skill.props ?? []).filter(isConfigurableProp).map(prop => prop.name),
  ]),
)

export const DEV_PROP_ENUMS: Record<string, Record<string, string[]>> = Object.fromEntries(
  devSkills
    .map((skill): [string, Record<string, string[]>] => {
      const enums = Object.fromEntries(
        (skill.props ?? [])
          .filter(isConfigurableProp)
          .map((prop): [string, string[]] => [prop.name, parseEnumFromTypeString(prop.type)])
          .filter(([, values]) => values.length > 0),
      )
      return [skill.type, enums]
    })
    .filter(([, enums]) => Object.keys(enums).length > 0),
)

export const DEV_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  devSkills.map(skill => [skill.type, createTypeLabel(skill)]),
)

export const DEV_REQUIRED_PROPS: Record<string, JsonObject> = {}

for (const skill of devSkills) {
  const requiredProps: JsonObject = {}
  for (const prop of skill.props ?? []) {
    if (prop.required && isConfigurableProp(prop)) {
      requiredProps[prop.name] = inferDefaultFromProp(prop)
    }
  }
  if (Object.keys(requiredProps).length > 0) {
    DEV_REQUIRED_PROPS[skill.type] = requiredProps
  }
}

export const DEV_COMPONENT_METADATA: RuleEditorComponentMetadata = {
  types: DEV_TYPES,
  propNames: DEV_PROP_NAMES,
  propEnums: DEV_PROP_ENUMS,
  typeLabels: DEV_TYPE_LABELS,
  requiredProps: DEV_REQUIRED_PROPS,
}
