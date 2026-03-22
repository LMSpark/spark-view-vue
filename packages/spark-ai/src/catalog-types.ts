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
  components: Record<string, ComponentEntry>
  constraints: PlatformConstraints
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
  rootFields?: RootFieldEntry[]
  notes?: string
  source: 'ast' | 'override' | 'addendum' | 'ast+addendum'
}

export interface PropEntry {
  name: string
  type: string
  required: boolean
  default?: string
  description?: string
}

export interface EmitEntry {
  name: string
  payload: Array<{ name: string; type: string }>
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
