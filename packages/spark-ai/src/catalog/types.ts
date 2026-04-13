/**
 * 组件目录 JSON Schema 类型定义（消费侧）
 *
 * spark-ai 不依赖 vite-plugin-spark-catalog（构建工具包），
 * 因此需要独立维护消费侧类型声明。
 * component-catalog.json 是单一 rich 目录（VCM + SFC 元注解 + 平台约束）。
 */

/** 组件目录 JSON 根结构 */
export interface ComponentCatalog {
  version: string
  buildTime: string
  componentCount: number
  registry?: ComponentRegistry
  components: Record<string, ComponentEntry>
  schemaPool?: Record<string, PropSchema>
  constraints?: PlatformConstraints
  canonical?: CatalogCanonicalModel
  sharedTypes?: Record<string, SharedTypeDefinition>
  bindingDescriptors?: Record<string, CatalogBindingDescriptor>
  governance?: CatalogGovernance
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
}

export interface CatalogBindingDescriptor {
  selfResolving?: boolean
  bindingDelegate?: string
  dataContainer?: boolean
  fieldProvider?: boolean
  columnLike?: boolean
  actionComponent?: boolean
  hasOptions?: boolean
  valueType?: string
}

export interface CatalogGovernance {
  contracts: Record<string, GovernanceContract>
}

export interface GovernanceContract {
  layer: 'props' | 'events' | 'api'
  description: string
  members: string[]
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
  category?: 'container' | 'field' | 'group' | 'meta' | 'feature'
  description?: string
  props: PropEntry[]
  emits: EmitEntry[]
  contracts?: ComponentContractRefs
  rootFields?: RootFieldEntry[]
  notes?: string
  provides?: string[]
  consumes?: string[]
  source?: 'vcm' | 'meta' | 'vcm+meta'
  binding?: CatalogBindingDescriptor
}

export interface ComponentContractRefs {
  props?: string[]
  events?: string[]
  api?: string[]
}

export interface CatalogCanonicalModel {
  dictionaries: CatalogCanonicalDictionaries
  components: Record<string, CatalogCanonicalComponent>
}

export interface CatalogCanonicalDictionaries {
  props: Record<string, PropEntry>
  emits: Record<string, EmitEntry>
}

export interface CatalogCanonicalComponent {
  type: string
  category: NonNullable<ComponentEntry['category']>
  description: string
  filePath?: string
  propRefs: string[]
  emitRefs: string[]
  source: NonNullable<ComponentEntry['source']>
  binding?: CatalogBindingDescriptor
  contracts?: ComponentContractRefs
  provides?: string[]
  consumes?: string[]
  notes?: string
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
