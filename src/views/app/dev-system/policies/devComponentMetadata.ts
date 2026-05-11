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

function inferDefaultFromProp(prop: PropMeta): unknown {
  if (prop.default !== undefined) {
    try {
      return JSON.parse(prop.default) as unknown
    } catch {
      return prop.default
    }
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

export const DEV_REQUIRED_PROPS: Record<string, Record<string, unknown>> = Object.fromEntries(
  devSkills
    .map((skill): [string, Record<string, unknown>] => {
      const requiredProps = Object.fromEntries(
        (skill.props ?? [])
          .filter(prop => prop.required && isConfigurableProp(prop))
          .map(prop => [prop.name, inferDefaultFromProp(prop)]),
      )
      return [skill.type, requiredProps]
    })
    .filter(([, requiredProps]) => Object.keys(requiredProps).length > 0),
)
