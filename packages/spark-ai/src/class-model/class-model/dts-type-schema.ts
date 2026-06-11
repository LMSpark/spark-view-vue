/**
 * @module @spark-appworks/spark-ai:class-model/class-model/dts-type-schema
 * 职责：维护 DTS ClassModel 知识链路中的 dts-type-schema 能力，围绕 模块入口、副作用注册或内部组合逻辑 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 ClassModel 在 class-model/class-model/dts-type-schema 这一段如何生成、加载或投影时，用本模块定位职责。
 */
import ts from 'typescript'
import type { AiJsonSchema, AiJsonSchemaObject } from '../../json'

export function typeToAiJsonSchema(
  checker: ts.TypeChecker,
  type: ts.Type,
  node?: ts.Node,
): AiJsonSchema {
  const text = node === undefined
    ? safeTypeToString(checker, type)
    : node.getText()
  const schemaFromNode = node === undefined ? undefined : typeNodeToAiJsonSchema(checker, node)
  if (schemaFromNode !== undefined) return schemaFromNode
  return typeToAiJsonSchemaByFlags(checker, type, text)
}

function typeNodeToAiJsonSchema(checker: ts.TypeChecker, node: ts.Node): AiJsonSchema | undefined {
  if (!ts.isTypeNode(node)) return undefined
  if (ts.isParenthesizedTypeNode(node)) return typeNodeToAiJsonSchema(checker, node.type)
  if (ts.isArrayTypeNode(node)) {
    return {
      type: 'array',
      items: typeToAiJsonSchema(checker, checker.getTypeFromTypeNode(node.elementType), node.elementType),
    }
  }
  if (ts.isUnionTypeNode(node)) {
    return combineUnionSchemas(
      node.types
        .filter(item => !isUndefinedLikeTypeNode(item))
        .map(item => typeToAiJsonSchema(checker, checker.getTypeFromTypeNode(item), item)),
    )
  }
  if (ts.isTypeReferenceNode(node)) return typeReferenceNodeToAiJsonSchema(checker, node)
  if (ts.isTypeLiteralNode(node)) return { type: 'object' }
  if (ts.isFunctionTypeNode(node)) return { type: 'object', title: node.getText() }
  if (ts.isLiteralTypeNode(node)) return literalTypeNodeToAiJsonSchema(node)

  if (node.kind === ts.SyntaxKind.StringKeyword) return { type: 'string' }
  if (node.kind === ts.SyntaxKind.NumberKeyword) return { type: 'number' }
  if (node.kind === ts.SyntaxKind.BooleanKeyword) return { type: 'boolean' }
  if (node.kind === ts.SyntaxKind.NullKeyword) return { type: 'null' }
  if (
    node.kind === ts.SyntaxKind.AnyKeyword
    || node.kind === ts.SyntaxKind.UnknownKeyword
    || node.kind === ts.SyntaxKind.VoidKeyword
    || node.kind === ts.SyntaxKind.UndefinedKeyword
  ) {
    return true
  }
  if (node.kind === ts.SyntaxKind.NeverKeyword) return false
  return undefined
}

function literalTypeNodeToAiJsonSchema(node: ts.LiteralTypeNode): AiJsonSchema {
  const literal = node.literal
  if (ts.isStringLiteral(literal)) return { type: 'string', enum: [literal.text] }
  if (ts.isNumericLiteral(literal)) return { type: 'number', enum: [Number(literal.text)] }
  if (literal.kind === ts.SyntaxKind.TrueKeyword) return { type: 'boolean', enum: [true] }
  if (literal.kind === ts.SyntaxKind.FalseKeyword) return { type: 'boolean', enum: [false] }
  if (literal.kind === ts.SyntaxKind.NullKeyword) return { type: 'null' }
  return true
}

function typeToAiJsonSchemaByFlags(
  checker: ts.TypeChecker,
  type: ts.Type,
  text: string,
): AiJsonSchema {
  if (isFlagSet(type, ts.TypeFlags.Any) || isFlagSet(type, ts.TypeFlags.Unknown)) return true
  if (isFlagSet(type, ts.TypeFlags.Never)) return false
  if (isFlagSet(type, ts.TypeFlags.Void) || isFlagSet(type, ts.TypeFlags.Undefined)) return true
  if (isFlagSet(type, ts.TypeFlags.StringLike)) return { type: 'string' }
  if (isFlagSet(type, ts.TypeFlags.NumberLike)) return { type: 'number' }
  if (isFlagSet(type, ts.TypeFlags.BooleanLike)) return { type: 'boolean' }
  if (isFlagSet(type, ts.TypeFlags.Null)) return { type: 'null' }
  if (type.isUnion()) {
    return combineUnionSchemas(
      type.types
        .filter(item => !isUndefinedLikeType(item))
        .map(item => typeToAiJsonSchemaByFlags(checker, item, safeTypeToString(checker, item))),
    )
  }
  if (isFlagSet(type, ts.TypeFlags.TypeParameter)) return true
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    return { type: 'array' }
  }
  if (isFlagSet(type, ts.TypeFlags.Object)) {
    return text.length === 0 || text === 'object'
      ? { type: 'object' }
      : { type: 'object', title: text }
  }
  return true
}

function typeReferenceNodeToAiJsonSchema(checker: ts.TypeChecker, node: ts.TypeReferenceNode): AiJsonSchema {
  const typeName = node.typeName.getText()
  if ((typeName === 'Array' || typeName === 'ReadonlyArray') && node.typeArguments?.[0] !== undefined) {
    const item = node.typeArguments[0]
    return {
      type: 'array',
      items: typeToAiJsonSchema(checker, checker.getTypeFromTypeNode(item), item),
    }
  }
  const type = checker.getTypeFromTypeNode(node)
  if (isFlagSet(type, ts.TypeFlags.TypeParameter)) return true
  return {
    type: 'object',
    title: node.getText(),
  }
}

function isFlagSet(type: ts.Type, flag: ts.TypeFlags): boolean {
  return (type.flags & flag) !== 0
}

function combineUnionSchemas(schemas: readonly AiJsonSchema[]): AiJsonSchema {
  if (schemas.length === 0) return true
  if (schemas.some(schema => schema === true)) return true
  if (schemas.length === 1) return schemas[0] ?? true
  return { anyOf: schemas }
}

function isUndefinedLikeType(type: ts.Type): boolean {
  return isFlagSet(type, ts.TypeFlags.Undefined) || isFlagSet(type, ts.TypeFlags.Void)
}

function isUndefinedLikeTypeNode(node: ts.TypeNode): boolean {
  return node.kind === ts.SyntaxKind.UndefinedKeyword || node.kind === ts.SyntaxKind.VoidKeyword
}

function safeTypeToString(checker: ts.TypeChecker, type: ts.Type): string {
  try {
    return checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation)
  } catch {
    return ''
  }
}

export function paramsSchemaFromSignature(
  checker: ts.TypeChecker,
  signature: ts.Signature,
): AiJsonSchemaObject {
  const properties: Record<string, AiJsonSchema> = {}
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
  }
  return {
    type: 'object',
    properties,
    additionalProperties: false,
  }
}
