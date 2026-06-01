import ts from 'typescript'

export type GeneratedJsonSchema = {
  readonly [keyword: string]: unknown
  readonly type?: string | readonly string[]
  readonly properties?: Readonly<Record<string, GeneratedJsonSchema>>
  readonly required?: readonly string[]
  readonly items?: GeneratedJsonSchema
  readonly enum?: readonly unknown[]
  readonly additionalProperties?: boolean | GeneratedJsonSchema
}

export function tsTypeToJsonSchema(
  checker: ts.TypeChecker,
  type: ts.Type,
): GeneratedJsonSchema {
  const literalValues = literalUnionValues(type)
  if (literalValues.length > 0) {
    const primitiveTypes = new Set(literalValues.map(jsonTypeNameForValue).filter(isNotUndefined))
    const typeValue = primitiveTypes.size === 1 ? [...primitiveTypes][0] : [...primitiveTypes]
    return typeValue === undefined ? { enum: literalValues } : { type: typeValue, enum: literalValues }
  }

  if (type.isUnion()) {
    const schemas = type.types.map(item => tsTypeToJsonSchema(checker, item))
    const typeNames = schemas.map(schema => schema.type).filter((value): value is string => typeof value === 'string')
    if (typeNames.length === schemas.length) return { type: [...new Set(typeNames)] }
    return { anyOf: schemas }
  }

  if (isStringLike(type)) return { type: 'string' }
  if (isNumberLike(type)) return { type: 'number' }
  if (isBooleanLike(type)) return { type: 'boolean' }
  if (isArrayLike(checker, type)) {
    const item = readArrayElementType(checker, type)
    return { type: 'array', items: item === undefined ? {} : tsTypeToJsonSchema(checker, item) }
  }

  const properties = type.getProperties()
  if (properties.length > 0) {
    const out: Record<string, GeneratedJsonSchema> = {}
    const required: string[] = []
    for (const property of properties) {
      const declaration = property.declarations?.[0]
      if (declaration === undefined) continue
      out[property.name] = tsTypeToJsonSchema(checker, checker.getTypeOfSymbolAtLocation(property, declaration))
      if ((property.flags & ts.SymbolFlags.Optional) === 0) required.push(property.name)
    }
    return { type: 'object', properties: out, required }
  }

  const text = checker.typeToString(type)
  if (text.startsWith('Record<')) return { type: 'object', additionalProperties: true }
  return {}
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

function isArrayLike(checker: ts.TypeChecker, type: ts.Type): boolean {
  return checker.isArrayType(type) || checker.isTupleType(type)
}

function readArrayElementType(checker: ts.TypeChecker, type: ts.Type): ts.Type | undefined {
  if (checker.isArrayType(type)) return readTypeReferenceArguments(type)[0]
  if (checker.isTupleType(type)) {
    const args = readTypeReferenceArguments(type)
    return args[0]
  }
  return undefined
}

function readTypeReferenceArguments(type: ts.Type): readonly ts.Type[] {
  if (!isIndexableObject(type)) return []
  const args = type['typeArguments']
  if (!Array.isArray(args)) return []
  return args.filter(isTsType)
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
