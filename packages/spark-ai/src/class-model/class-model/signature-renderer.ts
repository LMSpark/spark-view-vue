/**
 * @module @spark-appworks/spark-ai:class-model/class-model/signature-renderer
 * @spark-appworks/spark-ai 的 class-model/class-model/signature-renderer 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
import type { AiJsonSchemaObject } from '../../json'
import { jsonSchemaToTypeText } from './json-schema-to-type'
import {
  classNameForKind,
  findNestedAttributeApi,
} from './model-projection'
import type {
  AttributeMeta,
  ClassModelDocument,
  ConstructorMeta,
  MethodMeta,
} from './types'

export { classNameForKind } from './model-projection'

export function renderAttributeTypeText(
  document: ClassModelDocument,
  ownerKind: string,
  attribute: AttributeMeta,
): string {
  const nestedApi = findNestedAttributeApi(document, ownerKind, attribute.name)
  if (nestedApi !== undefined) {
    const elementTypeText = classNameForKind(document, nestedApi.kind)
    return isArrayAttributeSchema(document, attribute.schema) ? `${elementTypeText}[]` : elementTypeText
  }
  return jsonSchemaToTypeText(attribute.schema)
}

function isArrayAttributeSchema(
  document: ClassModelDocument,
  schema: AttributeMeta['schema'],
): boolean {
  const resolved = resolveAttributeSchemaShape(document, schema)
  if (resolved === undefined) return false
  const type = resolved.type
  if (type === 'array') return true
  return Array.isArray(type) && type.includes('array')
}

function resolveAttributeSchemaShape(
  document: ClassModelDocument,
  schema: AttributeMeta['schema'],
): Readonly<{ type?: string | readonly string[] }> | undefined {
  if (schema === true || schema === false) return undefined
  if (typeof schema !== 'object' || Array.isArray(schema)) return undefined
  const ref = schema.$ref
  if (typeof ref === 'string' && ref.startsWith('#/$defs/')) {
    const defName = ref.slice('#/$defs/'.length)
    if (defName.startsWith('ArrayOf_')) return { type: 'array' }
    const def = document.$defs?.[defName]
    if (def !== undefined) return def
  }
  return schema
}

export function renderAttributeDeclarationLine(
  document: ClassModelDocument,
  ownerKind: string,
  attribute: AttributeMeta,
): string {
  const readonlyText = attribute.writable ? '' : 'readonly '
  return `${readonlyText}${attribute.name}: ${renderAttributeTypeText(document, ownerKind, attribute)}`
}

export function renderConstructorSignature(constructor: ConstructorMeta): string {
  return `constructor(${paramsTextFromSchema(constructor.paramsSchema)})`
}

export function renderMethodReturnTypeText(
  _document: ClassModelDocument,
  method: MethodMeta,
): string {
  if (method.returnTypeText !== undefined && method.returnTypeText.trim().length > 0) {
    return method.returnTypeText
  }
  return jsonSchemaToTypeText(method.returnSchema)
}

export function renderMethodParamsText(
  _document: ClassModelDocument,
  method: MethodMeta,
): string {
  if (method.paramsTypeText !== undefined && method.paramsTypeText.trim().length > 0) {
    return method.paramsTypeText
  }
  return paramsTextFromSchema(method.paramsSchema)
}

export function renderMethodSignature(
  document: ClassModelDocument,
  _ownerKind: string,
  method: MethodMeta,
): string {
  return `${method.name}(${renderMethodParamsText(document, method)}): ${renderMethodReturnTypeText(document, method)}`
}

export function renderMethodDeclarationLine(
  document: ClassModelDocument,
  ownerKind: string,
  method: MethodMeta,
): string {
  return renderMethodSignature(document, ownerKind, method)
}

function paramsTextFromSchema(schema: AiJsonSchemaObject): string {
  const properties = schema.properties
  if (properties === undefined) return ''
  const required = new Set(schema.required ?? [])
  return Object.entries(properties)
    .map(([name, childSchema]) => {
      const optional = required.has(name) ? '' : '?'
      return `${name}${optional}: ${jsonSchemaToTypeText(childSchema)}`
    })
    .join(', ')
}
