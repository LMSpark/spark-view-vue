import type { AiJsonSchemaObject } from '../../json'
import { jsonSchemaToTypeText } from './json-schema-to-type'
import type {
  AttributeMeta,
  ClassModelDocument,
  ConstructorMeta,
  MethodMeta,
} from './types'

export function classNameForKind(document: ClassModelDocument, kind: string): string {
  return document.models[kind]?.className ?? kind
}

export function renderAttributeTypeText(
  document: ClassModelDocument,
  attribute: AttributeMeta,
): string {
  if (attribute.valueKind !== undefined) return classNameForKind(document, attribute.valueKind)
  return jsonSchemaToTypeText(attribute.schema)
}

export function renderAttributeDeclarationLine(
  document: ClassModelDocument,
  attribute: AttributeMeta,
): string {
  const readonlyText = attribute.writable ? '' : 'readonly '
  return `${readonlyText}${attribute.name}: ${renderAttributeTypeText(document, attribute)}`
}

export function renderConstructorSignature(constructor: ConstructorMeta): string {
  return `constructor(${paramsTextFromSchema(constructor.paramsSchema)})`
}

export function renderMethodReturnTypeText(
  document: ClassModelDocument,
  method: MethodMeta,
): string {
  if (method.callbackTargetKind !== undefined) return 'Promise<void>'
  if (method.returnsKind !== undefined) return classNameForKind(document, method.returnsKind)
  if (method.returnTypeText !== undefined && method.returnTypeText.trim().length > 0) {
    return method.returnTypeText
  }
  return jsonSchemaToTypeText(method.returnSchema)
}

export function renderMethodParamsText(
  document: ClassModelDocument,
  method: MethodMeta,
): string {
  if (method.callbackTargetKind !== undefined) {
    const typeName = classNameForKind(document, method.callbackTargetKind)
    const paramName = inferCallbackParamName(method.callbackTargetKind)
    return `run: (${paramName}: ${typeName}) => void | Promise<void>`
  }
  return paramsTextFromSchema(method.paramsSchema)
}

export function renderMethodSignature(
  document: ClassModelDocument,
  method: MethodMeta,
): string {
  return `${method.name}(${renderMethodParamsText(document, method)}): ${renderMethodReturnTypeText(document, method)}`
}

export function renderMethodDeclarationLine(
  document: ClassModelDocument,
  method: MethodMeta,
): string {
  return renderMethodSignature(document, method)
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

function inferCallbackParamName(targetKind: string): string {
  if (targetKind === 'node-tree') return 'tree'
  if (targetKind === 'dataset') return 'tool'
  return 'model'
}
