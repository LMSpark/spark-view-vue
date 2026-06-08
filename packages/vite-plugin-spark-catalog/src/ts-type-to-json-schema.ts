import ts from 'typescript'
import { standardizeJsonSchemaWithLocalDefs } from '@spark-appworks/spark-json-document'
import {
  JsonSchemaDefinitionPool,
  isJsonSchemaPoolObject,
  type JsonSchemaPoolObject,
} from './json-schema-pool'

export type GeneratedJsonSchema = boolean | GeneratedJsonSchemaObject

export type GeneratedJsonSchemaObject = JsonSchemaPoolObject & {
  readonly [keyword: string]: unknown
  readonly $ref?: string
  readonly $defs?: Readonly<Record<string, GeneratedJsonSchema>>
  readonly type?: string | readonly string[]
  readonly properties?: Readonly<Record<string, GeneratedJsonSchema>>
  readonly required?: readonly string[]
  readonly items?: GeneratedJsonSchema
  readonly enum?: readonly unknown[]
  readonly additionalProperties?: GeneratedJsonSchema
}

export type JsonSchemaDescriptionTodo = Readonly<{
  path: readonly string[]
  propertyName: string
  typeText: string
  file: string
  line: number
  declarationOwnerKind: 'type' | 'interface' | 'class' | 'inline-object'
  declarationOwnerName?: string
}>

export type TsTypeToJsonSchemaOptions = Readonly<{
  /**
   * 只做语义缺口审计，不生成语义。
   * JSON Schema description 只能来自源码 JSDoc/VCM 注释，反射层不会猜业务含义。
   */
  onMissingDescription?: (todo: JsonSchemaDescriptionTodo) => void
  rootPath?: readonly string[]
  skipMissingDescriptionPathLengthLessThan?: number
}>

export function tsTypeToJsonSchema(
  checker: ts.TypeChecker,
  type: ts.Type,
  options: TsTypeToJsonSchemaOptions = {},
): GeneratedJsonSchema {
  const state = createJsonSchemaGenerationState(options)
  const schema = typeToJsonSchema(checker, type, state, {
    inlineNamedObject: true,
    path: options.rootPath ?? [],
  })
  return standardizeJsonSchemaWithLocalDefs(attachDefinitions(schema, state))
}

type TypeToSchemaOptions = Readonly<{
  inlineNamedObject: boolean
  path: readonly string[]
}>

type JsonSchemaGenerationState = {
  depth: number
  definitions: JsonSchemaDefinitionPool<GeneratedJsonSchema>
  options: TsTypeToJsonSchemaOptions
}

const MAX_SCHEMA_DEPTH = 8

function typeToJsonSchema(
  checker: ts.TypeChecker,
  type: ts.Type,
  state: JsonSchemaGenerationState,
  options: TypeToSchemaOptions,
): GeneratedJsonSchema {
  if (state.depth > MAX_SCHEMA_DEPTH) return true

  const literalValues = literalUnionValues(type)
  if (literalValues.length > 0) {
    const primitiveTypes = new Set(literalValues.map(jsonTypeNameForValue).filter(isNotUndefined))
    const typeValue = primitiveTypes.size === 1 ? [...primitiveTypes][0] : [...primitiveTypes]
    return typeValue === undefined ? { enum: literalValues } : { type: typeValue, enum: literalValues }
  }

  if (type.isUnion()) return unionToJsonSchema(checker, type, state, options)
  if (isStringLike(type)) return { type: 'string' }
  if (isNumberLike(type)) return { type: 'number' }
  if (isBooleanLike(type)) return { type: 'boolean' }
  if (isFunctionLike(checker, type)) return true
  if (isArrayLike(checker, type)) return arrayToJsonSchema(checker, type, state, options)
  if (isRecordType(checker, type)) return { type: 'object', additionalProperties: true }
  if (isBuiltInCollectionType(checker, type)) return { type: 'object', additionalProperties: true }
  const externalObjectName = readExternalObjectName(checker, type)
  if (externalObjectName !== undefined) {
    return { type: 'object', title: externalObjectName, additionalProperties: true }
  }

  const classInstanceName = readClassInstanceName(checker, type)
  if (classInstanceName !== undefined) return { type: 'object', title: classInstanceName }

  const typeKey = readNamedObjectKey(checker, type)
  if (typeKey !== undefined && !options.inlineNamedObject) {
    ensureDefinition(checker, type, state, typeKey)
    return { $ref: state.definitions.refFor(typeKey) }
  }

  return objectToJsonSchema(checker, type, state, options)
}

function unionToJsonSchema(
  checker: ts.TypeChecker,
  type: ts.UnionType,
  state: JsonSchemaGenerationState,
  options: TypeToSchemaOptions,
): GeneratedJsonSchema {
  const schemas = type.types
    .filter(part => !isUndefinedLike(part))
    .map(item => withNestedDepth(state, () => typeToJsonSchema(checker, item, state, {
      inlineNamedObject: false,
      path: options.path,
    })))
  if (schemas.length === 0) return true
  if (schemas.length === 1) return schemas[0] ?? true

  const typeNames = schemas.map(schema => isSchemaObject(schema) ? schema.type : undefined).filter((value): value is string => typeof value === 'string')
  if (typeNames.length === schemas.length) return { type: [...new Set(typeNames)] }
  return { anyOf: dedupeSchemas(schemas) }
}

function arrayToJsonSchema(
  checker: ts.TypeChecker,
  type: ts.Type,
  state: JsonSchemaGenerationState,
  options: TypeToSchemaOptions,
): GeneratedJsonSchema {
  if (checker.isTupleType(type)) {
    const elementTypes = readTypeReferenceArguments(type)
    if (elementTypes.length > 0) {
      return {
        type: 'array',
        prefixItems: elementTypes.map((elementType, index) =>
          withNestedDepth(state, () => typeToJsonSchema(checker, elementType, state, {
            inlineNamedObject: false,
            path: [...options.path, 'prefixItems', String(index)],
          }))),
        items: false,
      }
    }
  }

  const item = readArrayElementType(checker, type)
  return {
    type: 'array',
    items: item === undefined
      ? true
      : withNestedDepth(state, () => typeToJsonSchema(checker, item, state, {
        inlineNamedObject: false,
        path: [...options.path, 'items'],
      })),
  }
}

function objectToJsonSchema(
  checker: ts.TypeChecker,
  type: ts.Type,
  state: JsonSchemaGenerationState,
  options: TypeToSchemaOptions,
): GeneratedJsonSchema {
  const properties = type.getProperties()
  if (properties.length === 0) return true

  const out: Record<string, GeneratedJsonSchema> = {}
  const required: string[] = []
  for (const property of properties) {
    if (shouldSkipObjectSchemaProperty(checker, property)) continue
    const declaration = property.declarations?.[0]
    if (declaration === undefined) continue
    const propertyType = safeGetTypeOfSymbolAtLocation(checker, property, declaration)
    if (propertyType === undefined) continue
    const propertyPath = [...options.path, 'properties', property.name]
    const propertySchema = withNestedDepth(state, () =>
      typeToJsonSchema(checker, propertyType, state, { inlineNamedObject: false, path: propertyPath }))
    const description = readSymbolJsDocDescription(checker, property)
    if (description === undefined) {
      pushMissingDescriptionTodo(checker, state, property, declaration, propertyType, propertyPath)
    }
    out[property.name] = withSchemaDescription(propertySchema, description)
    if ((property.flags & ts.SymbolFlags.Optional) === 0) required.push(property.name)
  }

  return { type: 'object', properties: out, required }
}

function shouldSkipObjectSchemaProperty(checker: ts.TypeChecker, property: ts.Symbol): boolean {
  if (property.name.startsWith('#')) return true
  const declaration = property.declarations?.[0]
  if (declaration === undefined) return false
  if (ts.isMethodDeclaration(declaration) || ts.isMethodSignature(declaration)) return true
  const modifiers = ts.canHaveModifiers(declaration) ? ts.getModifiers(declaration) : undefined
  if (modifiers?.some(modifier =>
    modifier.kind === ts.SyntaxKind.PrivateKeyword
    || modifier.kind === ts.SyntaxKind.ProtectedKeyword) === true) {
    return true
  }
  const propertyType = safeGetTypeOfSymbolAtLocation(checker, property, declaration)
  return propertyType !== undefined && isFunctionLike(checker, propertyType)
}

function withSchemaDescription(schema: GeneratedJsonSchema, description: string | undefined): GeneratedJsonSchema {
  if (description === undefined || description.length === 0 || schema === false) return schema
  if (schema === true) return { description }
  if (typeof schema['description'] === 'string' && schema['description'].trim().length > 0) return schema
  return { ...schema, description }
}

function readSymbolJsDocDescription(checker: ts.TypeChecker, symbol: ts.Symbol): string | undefined {
  const text = ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim()
  return text.length === 0 ? undefined : text
}

function pushMissingDescriptionTodo(
  checker: ts.TypeChecker,
  state: JsonSchemaGenerationState,
  property: ts.Symbol,
  declaration: ts.Declaration,
  propertyType: ts.Type,
  path: readonly string[],
): void {
  const onMissingDescription = state.options.onMissingDescription
  if (onMissingDescription === undefined) return
  const minPathLength = state.options.skipMissingDescriptionPathLengthLessThan
  if (minPathLength !== undefined && path.length < minPathLength) return
  const sourceFile = declaration.getSourceFile()
  const position = sourceFile.getLineAndCharacterOfPosition(declaration.getStart(sourceFile))
  const owner = readDeclarationOwner(declaration)
  onMissingDescription({
    path,
    propertyName: property.name,
    typeText: safeTypeToString(checker, propertyType),
    file: sourceFile.fileName,
    line: position.line + 1,
    ...owner,
  })
}

function readDeclarationOwner(
  declaration: ts.Declaration,
): Pick<JsonSchemaDescriptionTodo, 'declarationOwnerKind' | 'declarationOwnerName'> {
  const current = ts.findAncestor(declaration, node => node !== declaration && (
    ts.isInterfaceDeclaration(node)
    || ts.isTypeAliasDeclaration(node)
    || ts.isParameter(node)
    || ts.isMethodDeclaration(node)
    || ts.isMethodSignature(node)
    || ts.isClassDeclaration(node)
  ))
  if (current !== undefined && ts.isInterfaceDeclaration(current)) {
    return { declarationOwnerKind: 'interface', declarationOwnerName: current.name.text }
  }
  if (current !== undefined && ts.isTypeAliasDeclaration(current)) {
    return { declarationOwnerKind: 'type', declarationOwnerName: current.name.text }
  }
  if (current !== undefined && ts.isParameter(current)) {
    const name = bindingNameText(current.name, current.getSourceFile())
    return { declarationOwnerKind: 'inline-object', declarationOwnerName: `${name} 参数对象` }
  }
  if (current !== undefined && (ts.isMethodDeclaration(current) || ts.isMethodSignature(current))) {
    const methodName = ts.isPrivateIdentifier(current.name)
      ? `#${current.name.text}`
      : current.name.getText(current.getSourceFile())
    return { declarationOwnerKind: 'inline-object', declarationOwnerName: `${methodName} 返回对象` }
  }
  if (current !== undefined && ts.isClassDeclaration(current) && current.name !== undefined) {
    return { declarationOwnerKind: 'class', declarationOwnerName: current.name.text }
  }
  return { declarationOwnerKind: 'inline-object' }
}

function bindingNameText(name: ts.BindingName, sourceFile: ts.SourceFile): string {
  return ts.isIdentifier(name) ? name.text : name.getText(sourceFile)
}

function ensureDefinition(
  checker: ts.TypeChecker,
  type: ts.Type,
  state: JsonSchemaGenerationState,
  typeKey: string,
): void {
  state.definitions.ensure(typeKey, () => withNestedDepth(state, () =>
    objectToJsonSchema(checker, type, state, { inlineNamedObject: false, path: ['$defs', typeKey] })))
}

function attachDefinitions(schema: GeneratedJsonSchema, state: JsonSchemaGenerationState): GeneratedJsonSchema {
  return state.definitions.attachToRoot(schema)
}

function isSchemaObject(schema: GeneratedJsonSchema): schema is GeneratedJsonSchemaObject {
  return isJsonSchemaPoolObject(schema)
}

function createJsonSchemaGenerationState(options: TsTypeToJsonSchemaOptions): JsonSchemaGenerationState {
  return {
    depth: 0,
    definitions: new JsonSchemaDefinitionPool<GeneratedJsonSchema>(),
    options,
  }
}

function withNestedDepth<T>(state: JsonSchemaGenerationState, run: () => T): T {
  state.depth++
  try {
    return run()
  } finally {
    state.depth--
  }
}

function readNamedObjectKey(checker: ts.TypeChecker, type: ts.Type): string | undefined {
  if (type.getProperties().length === 0) return undefined
  if (isAnonymousObjectType(type)) return undefined
  const symbol = type.aliasSymbol ?? type.getSymbol()
  if (symbol === undefined) return undefined
  const name = checker.symbolToString(symbol)
  return isUsefulDefinitionName(name) ? name : undefined
}

function readClassInstanceName(checker: ts.TypeChecker, type: ts.Type): string | undefined {
  const symbol = type.getSymbol()
  if (symbol === undefined) return undefined
  if (symbol.declarations?.some(ts.isClassDeclaration) !== true) return undefined
  const name = checker.symbolToString(symbol)
  return isUsefulDefinitionName(name) ? name : undefined
}

function readExternalObjectName(checker: ts.TypeChecker, type: ts.Type): string | undefined {
  if (type.getProperties().length === 0) return undefined
  const symbol = type.aliasSymbol ?? type.getSymbol()
  if (symbol === undefined) return undefined
  const declarations = symbol.declarations
  if (declarations === undefined || declarations.length === 0) return undefined
  if (!declarations.every(declaration => isExternalTypeDeclarationFile(declaration.getSourceFile().fileName))) {
    return undefined
  }
  const name = checker.symbolToString(symbol)
  return isUsefulDefinitionName(name) ? name : undefined
}

function isExternalTypeDeclarationFile(fileName: string): boolean {
  const normalized = fileName.replace(/\\/g, '/')
  return normalized.includes('/node_modules/') || /\/typescript\/lib\/lib\.[^/]+\.d\.ts$/u.test(normalized)
}

function isAnonymousObjectType(type: ts.Type): boolean {
  const symbol = type.aliasSymbol ?? type.getSymbol()
  if (symbol === undefined) return true
  return symbol.declarations?.some(declaration =>
    ts.isTypeLiteralNode(declaration)
    || ts.isObjectLiteralExpression(declaration)
    || ts.isMappedTypeNode(declaration)) === true
}

function isUsefulDefinitionName(name: string): boolean {
  return name.length > 0 && name !== '__type' && !name.startsWith('__')
}

function dedupeSchemas(schemas: readonly GeneratedJsonSchema[]): readonly GeneratedJsonSchema[] {
  const seen = new Set<string>()
  const result: GeneratedJsonSchema[] = []
  for (const schema of schemas) {
    const key = JSON.stringify(schema)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(schema)
  }
  return result
}

function literalUnionValues(type: ts.Type): readonly unknown[] {
  if (!type.isUnion()) return literalValue(type) === undefined ? [] : [literalValue(type)]
  const values = type.types.map(literalValue)
  return values.some(value => value === undefined) ? [] : values
}

function literalValue(type: ts.Type): string | number | boolean | null | undefined {
  if (type.isStringLiteral()) return type.value
  if (type.isNumberLiteral()) return type.value
  if ((type.flags & ts.TypeFlags.BooleanLiteral) !== 0) {
    return isIndexableObject(type) && type['intrinsicName'] === 'true'
  }
  if ((type.flags & ts.TypeFlags.Null) !== 0) return null
  return undefined
}

function isStringLike(type: ts.Type): boolean {
  return (type.flags & ts.TypeFlags.StringLike) !== 0
}

function isNumberLike(type: ts.Type): boolean {
  return (type.flags & ts.TypeFlags.NumberLike) !== 0
}

function isBooleanLike(type: ts.Type): boolean {
  return (type.flags & ts.TypeFlags.BooleanLike) !== 0
}

function isUndefinedLike(type: ts.Type): boolean {
  return (type.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Never)) !== 0
}

function isRecordType(checker: ts.TypeChecker, type: ts.Type): boolean {
  const text = safeTypeToString(checker, type)
  return text.startsWith('Record<') || text === '{ [x: string]: unknown; }'
}

function isBuiltInCollectionType(checker: ts.TypeChecker, type: ts.Type): boolean {
  const text = safeTypeToString(checker, type)

  // Map/Set 是 JS 运行时集合，不是 VCM 业务数据模型；
  // 在 JSON Schema 中强行反射其方法集合只会制造无用 defs 和递归噪音。
  return /^(ReadonlyMap|Map|ReadonlySet|Set|WeakMap|WeakSet)</u.test(text)
}

function safeTypeToString(checker: ts.TypeChecker, type: ts.Type): string {
  try {
    return checker.typeToString(type)
  } catch {
    return ''
  }
}

function isArrayLike(checker: ts.TypeChecker, type: ts.Type): boolean {
  return checker.isArrayType(type) || checker.isTupleType(type)
}

function isFunctionLike(checker: ts.TypeChecker, type: ts.Type): boolean {
  if (type.getCallSignatures().length > 0) return true
  const text = safeTypeToString(checker, type).toLowerCase()
  return text.includes('=>') || text.includes('function')
}

function readArrayElementType(checker: ts.TypeChecker, type: ts.Type): ts.Type | undefined {
  if (checker.isArrayType(type)) return readTypeReferenceArguments(type)[0]
  if (checker.isTupleType(type)) return readTypeReferenceArguments(type)[0]
  return undefined
}

function readTypeReferenceArguments(type: ts.Type): readonly ts.Type[] {
  if (!isIndexableObject(type)) return []
  const args = type['typeArguments']
  if (!Array.isArray(args)) return []
  return args.filter(isTsType)
}

function safeGetTypeOfSymbolAtLocation(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  node: ts.Node,
): ts.Type | undefined {
  try {
    return checker.getTypeOfSymbolAtLocation(symbol, node)
  } catch {
    return undefined
  }
}

function isTsType(value: unknown): value is ts.Type {
  return isIndexableObject(value) && typeof value['flags'] === 'number'
}

function isIndexableObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object'
}

function jsonTypeNameForValue(value: unknown): string | undefined {
  if (value === null) return 'null'
  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'boolean') return type
  return undefined
}

function isNotUndefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
