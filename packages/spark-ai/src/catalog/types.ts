/**
 * 组件目录 JSON Schema 类型定义（完整版）
 *
 * 与 vite-plugin-spark-catalog/component-catalog-schema.ts 保持一致。
 * component-catalog.json 是单一 rich 目录（VCM + SFC 元注解 + 平台约束）。
 *
 * ⚠️ 保持与 component-catalog-schema.ts 同步 — 当 schema 变更时需一并更新。
 */

/** 组件目录 JSON 根结构 */
export interface ComponentCatalog {
  version: string
  buildTime: string
  componentCount: number
  registry?: ComponentRegistry
  components: Record<string, ComponentEntry>
  schemaPool?: Record<string, PropSchema>
  constraints: PlatformConstraints
  sharedTypes?: Record<string, SharedTypeDefinition>
  bindingDescriptors?: Record<string, BindingDescriptor>
  apiSurface?: object
}

export interface RawComponentCatalog {
  version: string
  buildTime: string
  componentCount: number
  components: Record<string, RawComponentEntry>
}

export interface RawComponentEntry {
  type: string
  filePath: string
  props: PropEntry[]
  emits: EmitEntry[]
  hasIndexSignature: boolean
}

export interface BindingDescriptor {
  selfResolving?: boolean
  bindingDelegate?: string
  dataContainer?: boolean
  fieldProvider?: boolean
  columnLike?: boolean
  actionComponent?: boolean
  hasOptions?: boolean
  valueType?: string
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
  filePath?: string
  category: 'container' | 'field' | 'group' | 'meta' | 'feature'
  description: string
  props: PropEntry[]
  emits: EmitEntry[]
  hasIndexSignature?: boolean
  rootFields?: RootFieldEntry[]
  notes?: string
  provides?: string[]
  consumes?: string[]
  source: 'vcm' | 'meta' | 'vcm+meta'
  binding?: BindingDescriptor
}

export interface PropEntry {
  name: string
  type: string
  required: boolean
  default?: string
  description?: string
  schemaRef?: string
  schema?: PropSchema
}

export type PropSchema =
  | { kind: 'object'; type: string; properties: Record<string, PropSchemaProperty> }
  | { kind: 'enum'; type: string; variants: string[] }
  | { kind: 'array'; type: string; itemTypes: string[] }
  | { kind: 'event'; type: string; paramTypes: string[] }

export interface PropSchemaProperty {
  name: string
  type: string
  required?: boolean
  description?: string
}

export interface EmitEntry {
  name: string
  type?: string
  description?: string
  schemaRefs?: string[]
  schema?: PropSchema[]
  payload?: Array<{ name: string; type: string }>
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
