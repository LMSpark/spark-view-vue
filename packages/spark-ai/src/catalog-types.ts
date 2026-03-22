/**
 * 组件目录 JSON Schema 类型定义（精简版）
 *
 * 从 vite-plugin-spark-catalog/component-catalog-schema.ts 提取的必要类型，
 * 供 spark-ai 运行时消费 component-catalog.json。
 *
 * ⚠️ 保持与 component-catalog-schema.ts 同步 — 当 schema 变更时需一并更新。
 */

/** 组件目录 JSON 根结构 */
export interface ComponentCatalog {
  version: string
  buildTime: string
  componentCount: number
  registry: ComponentRegistry
  sharedTypes: Record<string, SharedTypeDefinition>
  components: Record<string, ComponentEntry>
  constraints: PlatformConstraints
}

export interface SharedTypeDefinition {
  name: string
  description: string
  properties: SharedTypeProperty[]
  notes?: string
}

export interface SharedTypeProperty {
  name: string
  type: string
  required?: boolean
  description: string
}

export interface ComponentRegistry {
  containers: string[]
  fields: string[]
  groups: string[]
  meta: string[]
}

export interface ComponentEntry {
  type: string
  category: 'container' | 'field' | 'group' | 'meta' | 'feature'
  description: string
  props: PropEntry[]
  emits: EmitEntry[]
  capabilities: CapabilityInfo
  exposed?: ExposedEntry[]
  slots?: SlotEntry[]
  rootFields?: RootFieldEntry[]
  notes?: string
  source: 'ast' | 'override' | 'addendum' | 'ast+addendum' | 'ast+override' | 'vcm' | 'vcm+override' | 'vcm+addendum'
}

export interface PropEntry {
  name: string
  type: string
  required: boolean
  default?: string
  description?: string
  schema?: PropSchema
}

export type PropSchema =
  | { kind: 'object'; type: string; properties: Record<string, PropSchemaProperty> }
  | { kind: 'enum'; type: string; variants: string[] }
  | { kind: 'array'; type: string; items: PropSchema[] }
  | { kind: 'event'; type: string; params: PropSchema[] }

export interface PropSchemaProperty {
  name: string
  type: string
  required?: boolean
  description?: string
  schema?: PropSchema
}

export interface EmitEntry {
  name: string
  type?: string
  description?: string
  schema?: PropSchema[]
  payload?: Array<{ name: string; type: string }>
}

export interface ExposedEntry {
  name: string
  type: string
  description?: string
  schema?: PropSchema
}

export interface SlotEntry {
  name: string
  type: string
  description?: string
  schema?: PropSchema
}


export interface CapabilityInfo {
  consumes: string[]
  provides: string[]
}

export interface RootFieldEntry {
  name: string
  type: string
  description: string
  children?: RootFieldEntry[]
}

export interface PlatformConstraints {
  dataKeyPattern: string
  htmlTypes: string[]
  validTypePrefixes: string[]
  validAggregateTypes: string[]
  nonFieldRTypes: string[]
  containerContextMap: Record<string, string>
  nestingRules: Record<string, NestingRule>
}

export interface NestingRule {
  allowedChildren: string[]
  forbiddenChildren?: string[]
  note?: string
}
