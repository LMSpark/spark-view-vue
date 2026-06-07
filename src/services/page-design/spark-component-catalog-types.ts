import type { AiJsonSchemaObject } from '@spark-appworks/spark-ai/json'

export type SparkComponentCatalogProp = Readonly<{
  name: string
  typeText?: string
  /** @deprecated 旧 catalog 兼容字段。 */
  type?: string
  required?: boolean
  default?: string
  description?: string
  schema?: AiJsonSchemaObject
}>

export type SparkComponentCatalogEntry = Readonly<{
  type: string
  filePath?: string
  category?: string
  description?: string
  internal?: boolean
  configurable?: boolean
  props?: readonly SparkComponentCatalogProp[]
  emits?: ReadonlyArray<Readonly<{ name: string, typeText?: string, type?: string, description?: string }>>
  notes?: string
}>

export type SparkComponentCatalogDocument = Readonly<{
  version: string
  componentCount: number
  components: Readonly<Record<string, SparkComponentCatalogEntry>>
  $defs?: Readonly<Record<string, AiJsonSchemaObject>>
}>
