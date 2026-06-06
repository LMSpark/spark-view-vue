import ts from 'typescript'
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

export function tsTypeToJsonSchema(checker: ts.TypeChecker, type: ts.Type): GeneratedJsonSchema {
  const state = createJsonSchemaGenerationState()
  const schema = typeToJsonSchema(checker, type, state, { inlineNamedObject: true })
  return attachDefinitions(schema, state)
}

type TypeToSchemaOptions = Readonly<{
  inlineNamedObject: boolean
}>

type JsonSchemaGenerationState = {
  depth: number
  definitions: JsonSchemaDefinitionPool<GeneratedJsonSchema>
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

  if (type.isUnion()) return unionToJsonSchema(checker, type, state)
  if (isStringLike(type)) return { type: 'string' }
  if (isNumberLike(type)) return { type: 'number' }
  if (isBooleanLike(type)) return { type: 'boolean' }
  if (isArrayLike(checker, type)) return arrayToJsonSchema(checker, type, state)
  if (isRecordType(checker, type)) return { type: 'object', additionalProperties: true }

  const classInstanceName = readClassInstanceName(checker, type)
  if (classInstanceName !== undefined) return { type: 'object', title: classInstanceName }

  const typeKey = readNamedObjectKey(checker, type)
  if (typeKey !== undefined && !options.inlineNamedObject) {
    ensureDefinition(checker, type, state, typeKey)
    return { $ref: state.definitions.refFor(typeKey) }
  }

  return objectToJsonSchema(checker, type, state)
}

function unionToJsonSchema(
  checker: ts.TypeChecker,
  type: ts.UnionType,
  state: JsonSchemaGenerationState,
): GeneratedJsonSchema {
  const schemas = type.types
    .filter(part => !isUndefinedLike(part))
    .map(item => withNestedDepth(state, () => typeToJsonSchema(checker, item, state, { inlineNamedObject: false })))
  if (schemas.length === 0) return true

  const typeNames = schemas.map(schema => isSchemaObject(schema) ? schema.type : undefined).filter((value): value is string => typeof value === 'string')
  if (typeNames.length === schemas.length) return { type: [...new Set(typeNames)] }
  return { anyOf: dedupeSchemas(schemas) }
}

function arrayToJsonSchema(
  checker: ts.TypeChecker,
  type: ts.Type,
  state: JsonSchemaGenerationState,
): GeneratedJsonSchema {
  const item = readArrayElementType(checker, type)
  return {
    type: 'array',
    items: item === undefined
      ? true
      : withNestedDepth(state, () => typeToJsonSchema(checker, item, state, { inlineNamedObject: false })),
  }
}

function objectToJsonSchema(
  checker: ts.TypeChecker,
  type: ts.Type,
  state: JsonSchemaGenerationState,
): GeneratedJsonSchema {
  const properties = type.getProperties()
  if (properties.length === 0) return true

  const out: Record<string, GeneratedJsonSchema> = {}
  const required: string[] = []
  for (const property of properties) {
    const declaration = property.declarations?.[0]
    if (declaration === undefined) continue
    const propertyType = safeGetTypeOfSymbolAtLocation(checker, property, declaration)
    if (propertyType === undefined) continue
    out[property.name] = withNestedDepth(state, () =>
      typeToJsonSchema(checker, propertyType, state, { inlineNamedObject: false }))
    if ((property.flags & ts.SymbolFlags.Optional) === 0) required.push(property.name)
  }

  return { type: 'object', properties: out, required }
}

function ensureDefinition(
  checker: ts.TypeChecker,
  type: ts.Type,
  state: JsonSchemaGenerationState,
  typeKey: string,
): void {
  state.definitions.ensure(typeKey, () => withNestedDepth(state, () => objectToJsonSchema(checker, type, state)))
}

function attachDefinitions(schema: GeneratedJsonSchema, state: JsonSchemaGenerationState): GeneratedJsonSchema {
  return state.definitions.attachToRoot(schema)
}

function isSchemaObject(schema: GeneratedJsonSchema): schema is GeneratedJsonSchemaObject {
  return isJsonSchemaPoolObject(schema)
}

function createJsonSchemaGenerationState(): JsonSchemaGenerationState {
  return {
    depth: 0,
    definitions: new JsonSchemaDefinitionPool<GeneratedJsonSchema>(),
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
