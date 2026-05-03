/**
 * JSON Schema 精简类型定义。
 * spark-scenario 包内自含，不依赖外部包。
 */

export interface JsonSchema {
  type: 'object'
  properties: Record<string, JsonSchemaProperty>
  required?: string[]
}

export interface JsonSchemaProperty {
  type: string | string[]
  description?: string
  items?: JsonSchemaProperty
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  enum?: Array<string | number | null>
}
