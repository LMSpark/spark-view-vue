/**
 * @module @spark-appworks/spark-ai:class-model/class-model/dts-type-schema
 * @spark-appworks/spark-ai 的 class-model/class-model/dts-type-schema 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
import ts from 'typescript'
import type { AiJsonSchema, AiJsonSchemaObject } from '../../json'

export function typeToAiJsonSchema(
  checker: ts.TypeChecker,
  type: ts.Type,
  node?: ts.Node,
): AiJsonSchema {
  const text = node === undefined
    ? checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation)
    : node.getText()
  if (text === 'string') return { type: 'string', title: text }
  if (text === 'number') return { type: 'number', title: text }
  if (text === 'boolean') return { type: 'boolean', title: text }
  if (text === 'null') return { type: 'null', title: text }
  if (text.endsWith('[]')) return { type: 'array', title: text, items: true }
  return { title: text }
}

export function paramsSchemaFromSignature(
  checker: ts.TypeChecker,
  signature: ts.Signature,
): AiJsonSchemaObject {
  const properties: Record<string, AiJsonSchema> = {}
  const required: string[] = []
  for (const parameter of signature.getParameters()) {
    const declaration = parameter.valueDeclaration
    const name = parameter.getName()
    const anchor = declaration ?? signature.declaration
    if (anchor === undefined) continue
    const type = checker.getTypeOfSymbolAtLocation(parameter, anchor)
    properties[name] = typeToAiJsonSchema(
      checker,
      type,
      declaration !== undefined && ts.isParameter(declaration) ? declaration.type : declaration,
    )
    if (!isOptionalParameter(declaration)) required.push(name)
  }
  return {
    type: 'object',
    properties,
    ...(required.length === 0 ? {} : { required }),
    additionalProperties: false,
  }
}

export function signatureParamsTypeText(
  checker: ts.TypeChecker,
  signature: ts.Signature,
): string {
  return signature.getParameters().flatMap((parameter) => {
    const declaration = parameter.valueDeclaration
    const name = parameter.getName()
    const optional = isOptionalParameter(declaration) ? '?' : ''
    const anchor = declaration ?? signature.declaration
    if (anchor === undefined) return []
    const type = checker.getTypeOfSymbolAtLocation(parameter, anchor)
    return [`${name}${optional}: ${checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation)}`]
  }).join(', ')
}

function isOptionalParameter(declaration: ts.Declaration | undefined): boolean {
  return declaration !== undefined
    && ts.isParameter(declaration)
    && (declaration.questionToken !== undefined || declaration.initializer !== undefined)
}
