/**
 * @module @spark-appworks/spark-ai:class-model/class-model/read-dts-class-model-bundle-json
 * 职责：结构化校验 DTS ClassModel manifest 和 shard JSON，读取 module、model、attribute、method、provenance 与 relation 字段。
 * 边界：只做 JSON 协议解析和 fail-fast 校验，不生成 bundle、不访问网络，也不修复缺失语义。
 * AI用途：运行时或测试加载 generated/dts-class-model 失败时，用本模块确认是哪一层 JSON 字段不符合协议。
 */
import type { AiJsonSchema, AiJsonSchemaObject } from '../../json'
import type {
  AttributeMeta,
  ClassModel,
  ClassModelDeclarationRelation,
  ClassModelDeclarationRelationKind,
  ComponentClassModelLayer,
  ComponentClassModelLevel,
  ConstructorMeta,
  DtsTypeMeta,
  MethodMeta,
  MethodParameterMeta,
  MethodParameterStyle,
  SourceProvenanceMeta,
} from './types'
import type {
  DtsClassModelBundleClassEntry,
  DtsClassModelBundleFileEntry,
  DtsClassModelBundleManifest,
  DtsClassModelDuplicateRecord,
  DtsFileModuleJsDocSource,
  DtsFileModuleSemanticMeta,
  DtsFileProjectionDocument,
} from './dts-bundle-types'
import {
  DTS_CLASS_MODEL_BUNDLE_PROTOCOL,
  DTS_CLASS_MODEL_BUNDLE_VERSION,
  DTS_FILE_PROJECTION_VERSION,
} from './dts-bundle-types'

const DECLARATION_KINDS = new Set<NonNullable<SourceProvenanceMeta['declarationKind']>>([
  'class',
  'interface',
  'type',
  'enum',
  'function',
  'const',
  'component',
])

const SHAPE_KINDS = new Set<NonNullable<ClassModel['shapeKind']>>([
  'class',
  'interface',
  'type',
  'enum',
  'function',
  'const',
  'component',
])

const COMPONENT_LEVELS = new Set<ComponentClassModelLevel>([
  'table-level',
  'container',
  'field-level',
  'display',
  'infrastructure',
])

const COMPONENT_LAYERS = new Set<ComponentClassModelLayer>([
  'data-view-container',
  'layout-container',
  'zone-container',
  'data-field',
  'field-support',
  'data-display',
  'static-display',
  'editor',
  'support',
])

const DECLARATION_RELATION_KINDS = new Set<ClassModelDeclarationRelationKind>([
  'alias',
  'intersection',
  'union',
  'extends',
  'implements',
])

const MODULE_JSDOC_SOURCES = new Set<DtsFileModuleJsDocSource>([
  'leading-jsdoc',
  'source-file-jsdoc',
  'inferred',
])

const METHOD_PARAMETER_STYLES = new Set<MethodParameterStyle>([
  'positional',
  'named',
])

type DeclarationKindReadCommand<T extends string> = Readonly<{
  record: Record<string, unknown>
  field: string
  path: string
  allowed: ReadonlySet<T>
}>

type StringKeyedRecordReadCommand<T> = Readonly<{
  record: Record<string, unknown>
  field: string
  path: string
  parseEntry: (value: unknown, entryPath: string) => T
}>

type ArrayReadCommand<T> = Readonly<{
  record: Record<string, unknown>
  field: string
  path: string
  parseEntry: (value: unknown, entryPath: string) => T
}>

export function readDtsClassModelBundleManifest(value: unknown): DtsClassModelBundleManifest {
  const record = requireJsonRecord(value, 'DTS class-model manifest')
  const schemaVersion = readRequiredNumber(record, 'schemaVersion', 'manifest.schemaVersion')
  if (schemaVersion !== DTS_CLASS_MODEL_BUNDLE_VERSION) {
    throw new Error(`Unsupported DTS class-model manifest schemaVersion: ${String(schemaVersion)}`)
  }
  const protocol = readRequiredString(record, 'protocol', 'manifest.protocol')
  if (protocol !== DTS_CLASS_MODEL_BUNDLE_PROTOCOL) {
    throw new Error(`Unsupported DTS class-model manifest protocol: ${protocol}`)
  }
  const duplicates = readOptionalArray({
    record,
    field: 'duplicates',
    path: 'manifest.duplicates',
    parseEntry: parseDuplicateRecord,
  })
  return {
    schemaVersion: DTS_CLASS_MODEL_BUNDLE_VERSION,
    protocol: DTS_CLASS_MODEL_BUNDLE_PROTOCOL,
    generatedAt: readRequiredString(record, 'generatedAt', 'manifest.generatedAt'),
    scannedFileCount: readRequiredNumber(record, 'scannedFileCount', 'manifest.scannedFileCount'),
    files: readRequiredStringKeyedRecord({
      record,
      field: 'files',
      path: 'manifest.files',
      parseEntry: parseBundleFileEntry,
    }),
    classIndex: readRequiredStringKeyedRecord({
      record,
      field: 'classIndex',
      path: 'manifest.classIndex',
      parseEntry: parseBundleClassEntry,
    }),
    ...(duplicates === undefined ? {} : { duplicates }),
  }
}

export function readDtsFileProjectionDocument(value: unknown): DtsFileProjectionDocument {
  const record = requireJsonRecord(value, 'DTS file projection')
  const schemaVersion = readRequiredNumber(record, 'schemaVersion', 'projection.schemaVersion')
  if (schemaVersion !== DTS_FILE_PROJECTION_VERSION) {
    throw new Error(`Unsupported DTS file projection schemaVersion: ${String(schemaVersion)}`)
  }
  const generatedAt = readOptionalString(record, 'generatedAt', 'projection.generatedAt')
  const sourcePath = readRequiredString(record, 'sourcePath', 'projection.sourcePath')
  const symbols = readRequiredStringArray(record, 'symbols', 'projection.symbols')
  const schemaDefs = readOptionalStringKeyedRecord({
    record,
    field: '$defs',
    path: 'projection.$defs',
    parseEntry: parseJsonSchemaObject,
  })
  const models = readRequiredStringKeyedRecord({
    record,
    field: 'models',
    path: 'projection.models',
    parseEntry: parseClassModel,
  })
  const module = readOptionalModuleMeta(record, 'module', 'projection.module')
    ?? createLegacyModuleMeta(sourcePath, symbols)
  return {
    schemaVersion: DTS_FILE_PROJECTION_VERSION,
    sourcePath,
    module,
    symbols,
    ...(schemaDefs === undefined ? {} : { $defs: schemaDefs }),
    models,
    ...(generatedAt === undefined ? {} : { generatedAt }),
  }
}

function parseBundleFileEntry(value: unknown, path: string): DtsClassModelBundleFileEntry {
  const record = requireJsonRecord(value, path)
  const file = readRequiredString(record, 'file', `${path}.file`)
  const module = readOptionalModuleMeta(record, 'module', `${path}.module`)
    ?? createLegacyModuleMeta(path.replace(/^manifest\.files\./u, ''), [])
  return {
    file,
    module,
  }
}

function readOptionalModuleMeta(
  record: Record<string, unknown>,
  field: string,
  path: string,
): DtsFileModuleSemanticMeta | undefined {
  if (!Object.hasOwn(record, field)) return undefined
  return parseModuleMeta(record[field], path)
}

function parseModuleMeta(value: unknown, path: string): DtsFileModuleSemanticMeta {
  const record = requireJsonRecord(value, path)
  const packageName = readOptionalString(record, 'packageName', `${path}.packageName`)
  const componentName = readOptionalString(record, 'componentName', `${path}.componentName`)
  const componentType = readOptionalString(record, 'componentType', `${path}.componentType`)
  const componentLevel = readOptionalDeclarationKind({
    record,
    field: 'componentLevel',
    path: `${path}.componentLevel`,
    allowed: COMPONENT_LEVELS,
  })
  const componentLayer = readOptionalDeclarationKind({
    record,
    field: 'componentLayer',
    path: `${path}.componentLayer`,
    allowed: COMPONENT_LAYERS,
  })
  const componentDirectory = readOptionalString(record, 'componentDirectory', `${path}.componentDirectory`)
  return {
    name: readRequiredString(record, 'name', `${path}.name`),
    sourcePath: readRequiredString(record, 'sourcePath', `${path}.sourcePath`),
    sourceFile: readRequiredString(record, 'sourceFile', `${path}.sourceFile`),
    ...(packageName === undefined ? {} : { packageName }),
    modulePath: readRequiredString(record, 'modulePath', `${path}.modulePath`),
    jsdoc: readRequiredString(record, 'jsdoc', `${path}.jsdoc`),
    jsdocSource: readRequiredDeclarationKind({
      record,
      field: 'jsdocSource',
      path: `${path}.jsdocSource`,
      allowed: MODULE_JSDOC_SOURCES,
    }),
    symbols: readRequiredStringArray(record, 'symbols', `${path}.symbols`),
    ...(componentName === undefined ? {} : { componentName }),
    ...(componentType === undefined ? {} : { componentType }),
    ...(componentLevel === undefined ? {} : { componentLevel }),
    ...(componentLayer === undefined ? {} : { componentLayer }),
    ...(componentDirectory === undefined ? {} : { componentDirectory }),
  }
}

function createLegacyModuleMeta(sourcePath: string, symbols: readonly string[]): DtsFileModuleSemanticMeta {
  const sourceFile = sourceFileFromDeclarationFile(sourcePath)
  const modulePath = sourceFile.replace(/^packages\/[^/]+\/src\//u, '').replace(/^src\//u, '').replace(/\.vue$|\.ts$/u, '')
  const packageMatch = /^packages\/([^/]+)\/src\//u.exec(sourceFile)
  const packageName = packageMatch?.[1] === undefined
    ? sourceFile.startsWith('src/') ? 'app' : undefined
    : `@spark-appworks/${packageMatch[1]}`
  return {
    name: packageName === undefined ? modulePath : `${packageName}:${modulePath}`,
    sourcePath,
    sourceFile,
    ...(packageName === undefined ? {} : { packageName }),
    modulePath,
    jsdoc: `${packageName ?? 'workspace'} 的 ${modulePath} 模块。`,
    jsdocSource: 'inferred',
    symbols,
  }
}

function sourceFileFromDeclarationFile(declarationFile: string): string {
  const sourcePath = declarationFile.startsWith('declarations/')
    ? declarationFile.slice('declarations/'.length)
    : declarationFile
  if (sourcePath.endsWith('.vue.d.ts')) return sourcePath.slice(0, -'.d.ts'.length)
  if (sourcePath.endsWith('.d.ts')) return `${sourcePath.slice(0, -'.d.ts'.length)}.ts`
  return sourcePath
}

function parseBundleClassEntry(value: unknown, path: string): DtsClassModelBundleClassEntry {
  const record = requireJsonRecord(value, path)
  return {
    sourcePath: readRequiredString(record, 'sourcePath', `${path}.sourcePath`),
    file: readRequiredString(record, 'file', `${path}.file`),
  }
}

function parseDuplicateRecord(value: unknown, path: string): DtsClassModelDuplicateRecord {
  const record = requireJsonRecord(value, path)
  return {
    className: readRequiredString(record, 'className', `${path}.className`),
    keptFile: readRequiredString(record, 'keptFile', `${path}.keptFile`),
    skippedFile: readRequiredString(record, 'skippedFile', `${path}.skippedFile`),
  }
}

function parseClassModel(value: unknown, path: string): ClassModel {
  const record = requireJsonRecord(value, path)
  const declarationTypeText = readOptionalString(record, 'declarationTypeText', `${path}.declarationTypeText`)
  const declarationRelations = readOptionalArray({
    record,
    field: 'declarationRelations',
    path: `${path}.declarationRelations`,
    parseEntry: parseDeclarationRelation,
  })
  const shapeKind = readOptionalDeclarationKind({
    record,
    field: 'shapeKind',
    path: `${path}.shapeKind`,
    allowed: SHAPE_KINDS,
  })
  const provenance = readOptionalSourceProvenance(record, 'provenance', `${path}.provenance`)
  const constructorMeta = readOptionalConstructorMeta(record, 'constructorMeta', `${path}.constructorMeta`)
  return {
    kind: readRequiredString(record, 'kind', `${path}.kind`),
    className: readRequiredString(record, 'className', `${path}.className`),
    jsdoc: readRequiredString(record, 'jsdoc', `${path}.jsdoc`),
    ...(declarationTypeText === undefined ? {} : { declarationTypeText }),
    ...(declarationRelations === undefined ? {} : { declarationRelations }),
    ...(shapeKind === undefined ? {} : { shapeKind }),
    ...(provenance === undefined ? {} : { provenance }),
    ...(constructorMeta === undefined ? {} : { constructorMeta }),
    attributes: readRequiredArray({
      record,
      field: 'attributes',
      path: `${path}.attributes`,
      parseEntry: parseAttributeMeta,
    }),
    methods: readRequiredArray({
      record,
      field: 'methods',
      path: `${path}.methods`,
      parseEntry: parseMethodMeta,
    }),
  }
}

function parseDeclarationRelation(value: unknown, path: string): ClassModelDeclarationRelation {
  const record = requireJsonRecord(value, path)
  const targetName = readOptionalString(record, 'targetName', `${path}.targetName`)
  return {
    kind: readRequiredDeclarationKind({
      record,
      field: 'kind',
      path: `${path}.kind`,
      allowed: DECLARATION_RELATION_KINDS,
    }),
    typeText: readRequiredString(record, 'typeText', `${path}.typeText`),
    ...(targetName === undefined ? {} : { targetName }),
  }
}

function parseAttributeMeta(value: unknown, path: string): AttributeMeta {
  const record = requireJsonRecord(value, path)
  const provenance = readOptionalSourceProvenance(record, 'provenance', `${path}.provenance`)
  return {
    name: readRequiredString(record, 'name', `${path}.name`),
    schema: readRequiredJsonSchema(record, 'schema', `${path}.schema`),
    readable: readRequiredBoolean(record, 'readable', `${path}.readable`),
    writable: readRequiredBoolean(record, 'writable', `${path}.writable`),
    jsdoc: readRequiredString(record, 'jsdoc', `${path}.jsdoc`),
    ...(provenance === undefined ? {} : { provenance }),
  }
}

function parseMethodMeta(value: unknown, path: string): MethodMeta {
  const record = requireJsonRecord(value, path)
  const paramsSchema = readOptionalJsonSchemaObject(record, 'paramsSchema', `${path}.paramsSchema`)
  const returnSchema = readOptionalJsonSchema(record, 'returnSchema', `${path}.returnSchema`)
  const returnType = readOptionalDtsTypeMeta(record, 'returnType', `${path}.returnType`)
  const takesContext = readOptionalBoolean(record, 'takesContext', `${path}.takesContext`)
  const provenance = readOptionalSourceProvenance(record, 'provenance', `${path}.provenance`)
  return {
    name: readRequiredString(record, 'name', `${path}.name`),
    signatureText: readRequiredString(record, 'signatureText', `${path}.signatureText`),
    parameterStyle: readRequiredDeclarationKind({
      record,
      field: 'parameterStyle',
      path: `${path}.parameterStyle`,
      allowed: METHOD_PARAMETER_STYLES,
    }),
    parameters: readRequiredArray({
      record,
      field: 'parameters',
      path: `${path}.parameters`,
      parseEntry: parseMethodParameterMeta,
    }),
    ...(returnType === undefined ? {} : { returnType }),
    ...(paramsSchema === undefined ? {} : { paramsSchema }),
    ...(returnSchema === undefined ? {} : { returnSchema }),
    ...(takesContext === undefined ? {} : { takesContext }),
    jsdoc: readRequiredString(record, 'jsdoc', `${path}.jsdoc`),
    ...(provenance === undefined ? {} : { provenance }),
  }
}

function parseMethodParameterMeta(value: unknown, path: string): MethodParameterMeta {
  const record = requireJsonRecord(value, path)
  return {
    name: readRequiredString(record, 'name', `${path}.name`),
    type: readRequiredDtsTypeMeta(record, 'type', `${path}.type`),
  }
}

function readOptionalDtsTypeMeta(
  record: Record<string, unknown>,
  field: string,
  path: string,
): DtsTypeMeta | undefined {
  if (!Object.hasOwn(record, field)) return undefined
  return parseDtsTypeMeta(record[field], path)
}

function readRequiredDtsTypeMeta(
  record: Record<string, unknown>,
  field: string,
  path: string,
): DtsTypeMeta {
  if (!Object.hasOwn(record, field)) {
    throw new Error(`Missing required field ${path}`)
  }
  return parseDtsTypeMeta(record[field], path)
}

function parseDtsTypeMeta(value: unknown, path: string): DtsTypeMeta {
  const record = requireJsonRecord(value, path)
  const type = readRequiredString(record, 'type', `${path}.type`)
  if (type === 'intrinsic') {
    return { type, name: readRequiredString(record, 'name', `${path}.name`) }
  }
  if (type === 'reference') {
    const sourcePath = readOptionalString(record, 'sourcePath', `${path}.sourcePath`)
    const refersToTypeParameter = readOptionalBoolean(record, 'refersToTypeParameter', `${path}.refersToTypeParameter`)
    const typeArguments = readOptionalArray({
      record,
      field: 'typeArguments',
      path: `${path}.typeArguments`,
      parseEntry: parseDtsTypeMeta,
    })
    return {
      type,
      name: readRequiredString(record, 'name', `${path}.name`),
      ...(sourcePath === undefined ? {} : { sourcePath }),
      ...(refersToTypeParameter === undefined ? {} : { refersToTypeParameter }),
      ...(typeArguments === undefined ? {} : { typeArguments }),
    }
  }
  if (type === 'array') {
    return { type, elementType: readRequiredDtsTypeMeta(record, 'elementType', `${path}.elementType`) }
  }
  if (type === 'union' || type === 'intersection') {
    return {
      type,
      types: readRequiredArray({
        record,
        field: 'types',
        path: `${path}.types`,
        parseEntry: parseDtsTypeMeta,
      }),
    }
  }
  if (type === 'literal') {
    return { type, value: readRequiredDtsLiteralValue(record, 'value', `${path}.value`) }
  }
  if (type === 'unknown') {
    return { type, name: readRequiredString(record, 'name', `${path}.name`) }
  }
  throw new Error(`Invalid DTS type discriminator at ${path}.type: ${type}`)
}

function readRequiredDtsLiteralValue(
  record: Record<string, unknown>,
  field: string,
  path: string,
): string | number | boolean | null {
  if (!Object.hasOwn(record, field)) throw new Error(`Missing required field ${path}`)
  const value = record[field]
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  throw new Error(`Expected ${path} to be a string, number, boolean, or null`)
}

function readOptionalJsonSchemaObject(
  record: Record<string, unknown>,
  field: string,
  path: string,
): AiJsonSchemaObject | undefined {
  if (!Object.hasOwn(record, field)) return undefined
  return parseJsonSchemaObject(record[field], path)
}

function readOptionalConstructorMeta(
  record: Record<string, unknown>,
  field: string,
  path: string,
): ConstructorMeta | undefined {
  if (!Object.hasOwn(record, field)) return undefined
  return parseConstructorMeta(record[field], path)
}

function parseConstructorMeta(value: unknown, path: string): ConstructorMeta {
  const record = requireJsonRecord(value, path)
  const paramsSchema = readOptionalJsonSchemaObject(record, 'paramsSchema', `${path}.paramsSchema`)
  const provenance = readOptionalSourceProvenance(record, 'provenance', `${path}.provenance`)
  return {
    jsdoc: readRequiredString(record, 'jsdoc', `${path}.jsdoc`),
    signatureText: readRequiredString(record, 'signatureText', `${path}.signatureText`),
    parameterStyle: readRequiredDeclarationKind({
      record,
      field: 'parameterStyle',
      path: `${path}.parameterStyle`,
      allowed: METHOD_PARAMETER_STYLES,
    }),
    parameters: readRequiredArray({
      record,
      field: 'parameters',
      path: `${path}.parameters`,
      parseEntry: parseMethodParameterMeta,
    }),
    ...(paramsSchema === undefined ? {} : { paramsSchema }),
    ...(provenance === undefined ? {} : { provenance }),
  }
}

function readOptionalSourceProvenance(
  record: Record<string, unknown>,
  field: string,
  path: string,
): SourceProvenanceMeta | undefined {
  if (!Object.hasOwn(record, field)) return undefined
  return parseSourceProvenance(record[field], path)
}

function parseSourceProvenance(value: unknown, path: string): SourceProvenanceMeta {
  const record = requireJsonRecord(value, path)
  const memberName = readOptionalString(record, 'memberName', `${path}.memberName`)
  const typeEntryFile = readOptionalString(record, 'typeEntryFile', `${path}.typeEntryFile`)
  const componentName = readOptionalString(record, 'componentName', `${path}.componentName`)
  const componentType = readOptionalString(record, 'componentType', `${path}.componentType`)
  const componentLevel = readOptionalDeclarationKind({
    record,
    field: 'componentLevel',
    path: `${path}.componentLevel`,
    allowed: COMPONENT_LEVELS,
  })
  const componentLayer = readOptionalDeclarationKind({
    record,
    field: 'componentLayer',
    path: `${path}.componentLayer`,
    allowed: COMPONENT_LAYERS,
  })
  const componentDirectory = readOptionalString(record, 'componentDirectory', `${path}.componentDirectory`)
  const declarationKind = readOptionalDeclarationKind({
    record,
    field: 'declarationKind',
    path: `${path}.declarationKind`,
    allowed: DECLARATION_KINDS,
  })
  return {
    file: readRequiredString(record, 'file', `${path}.file`),
    line: readRequiredNumber(record, 'line', `${path}.line`),
    className: readRequiredString(record, 'className', `${path}.className`),
    ...(memberName === undefined ? {} : { memberName }),
    ...(typeEntryFile === undefined ? {} : { typeEntryFile }),
    ...(componentName === undefined ? {} : { componentName }),
    ...(componentType === undefined ? {} : { componentType }),
    ...(componentLevel === undefined ? {} : { componentLevel }),
    ...(componentLayer === undefined ? {} : { componentLayer }),
    ...(componentDirectory === undefined ? {} : { componentDirectory }),
    ...(declarationKind === undefined ? {} : { declarationKind }),
  }
}

function readOptionalDeclarationKind<T extends string>(
  command: DeclarationKindReadCommand<T>,
): T | undefined {
  const { record, field } = command
  if (!Object.hasOwn(record, field)) return undefined
  return readRequiredDeclarationKind(command)
}

function readRequiredDeclarationKind<T extends string>(
  command: DeclarationKindReadCommand<T>,
): T {
  const { record, field, path, allowed } = command
  const value = record[field]
  if (typeof value !== 'string') {
    throw new Error(`${path} must be a string.`)
  }
  for (const candidate of allowed) {
    if (candidate === value) return candidate
  }
  throw new Error(`${path} must be one of: ${[...allowed].join(', ')}`)
}

function readRequiredJsonSchema(
  record: Record<string, unknown>,
  field: string,
  path: string,
): AiJsonSchema {
  if (!Object.hasOwn(record, field)) {
    throw new Error(`${path} is required.`)
  }
  return parseJsonSchema(record[field], path)
}

function readOptionalJsonSchema(
  record: Record<string, unknown>,
  field: string,
  path: string,
): AiJsonSchema | undefined {
  if (!Object.hasOwn(record, field)) return undefined
  return parseJsonSchema(record[field], path)
}

function parseJsonSchema(value: unknown, path: string): AiJsonSchema {
  if (value === true || value === false) return value
  if (isJsonRecord(value)) return value
  throw new Error(`${path} must be a JSON Schema object or boolean.`)
}

function parseJsonSchemaObject(value: unknown, path: string): AiJsonSchemaObject {
  if (!isJsonRecord(value)) {
    throw new Error(`${path} must be a JSON Schema object.`)
  }
  return value
}

function readRequiredStringKeyedRecord<T>(
  command: StringKeyedRecordReadCommand<T>,
): Record<string, T> {
  const { record, field, path, parseEntry } = command
  if (!Object.hasOwn(record, field)) {
    throw new Error(`${path} is required.`)
  }
  const raw = record[field]
  if (!isJsonRecord(raw)) {
    throw new Error(`${path} must be an object.`)
  }
  const result: Record<string, T> = {}
  for (const [key, entry] of Object.entries(raw)) {
    result[key] = parseEntry(entry, `${path}.${key}`)
  }
  return result
}

function readOptionalStringKeyedRecord<T>(
  command: StringKeyedRecordReadCommand<T>,
): Record<string, T> | undefined {
  const { record, field, path, parseEntry } = command
  if (!Object.hasOwn(record, field)) return undefined
  const raw = record[field]
  if (!isJsonRecord(raw)) {
    throw new Error(`${path} must be an object.`)
  }
  const result: Record<string, T> = {}
  for (const [key, entry] of Object.entries(raw)) {
    result[key] = parseEntry(entry, `${path}.${key}`)
  }
  return result
}

function readRequiredArray<T>(command: ArrayReadCommand<T>): readonly T[] {
  const { record, field, path, parseEntry } = command
  if (!Object.hasOwn(record, field)) {
    throw new Error(`${path} is required.`)
  }
  const raw = record[field]
  if (!Array.isArray(raw)) {
    throw new Error(`${path} must be an array.`)
  }
  return raw.map((entry, index) => parseEntry(entry, `${path}[${String(index)}]`))
}

function readOptionalArray<T>(command: ArrayReadCommand<T>): readonly T[] | undefined {
  const { record, field } = command
  if (!Object.hasOwn(record, field)) return undefined
  return readRequiredArray(command)
}

function readRequiredStringArray(
  record: Record<string, unknown>,
  field: string,
  path: string,
): readonly string[] {
  if (!Object.hasOwn(record, field)) {
    throw new Error(`${path} is required.`)
  }
  const raw = record[field]
  if (!Array.isArray(raw)) {
    throw new Error(`${path} must be an array.`)
  }
  return raw.map((entry, index) => {
    if (typeof entry !== 'string') {
      throw new Error(`${path}[${String(index)}] must be a string.`)
    }
    return entry
  })
}

function readRequiredString(
  record: Record<string, unknown>,
  field: string,
  path: string,
): string {
  if (!Object.hasOwn(record, field)) {
    throw new Error(`${path} is required.`)
  }
  const value = record[field]
  if (typeof value !== 'string') {
    throw new Error(`${path} must be a string.`)
  }
  return value
}

function readOptionalString(
  record: Record<string, unknown>,
  field: string,
  path: string,
): string | undefined {
  if (!Object.hasOwn(record, field)) return undefined
  const value = record[field]
  if (typeof value !== 'string') {
    throw new Error(`${path} must be a string.`)
  }
  return value
}

function readRequiredNumber(
  record: Record<string, unknown>,
  field: string,
  path: string,
): number {
  if (!Object.hasOwn(record, field)) {
    throw new Error(`${path} is required.`)
  }
  const value = record[field]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number.`)
  }
  return value
}

function readRequiredBoolean(
  record: Record<string, unknown>,
  field: string,
  path: string,
): boolean {
  if (!Object.hasOwn(record, field)) {
    throw new Error(`${path} is required.`)
  }
  const value = record[field]
  if (typeof value !== 'boolean') {
    throw new Error(`${path} must be a boolean.`)
  }
  return value
}

function readOptionalBoolean(
  record: Record<string, unknown>,
  field: string,
  path: string,
): boolean | undefined {
  if (!Object.hasOwn(record, field)) return undefined
  return readRequiredBoolean(record, field, path)
}

function requireJsonRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isJsonRecord(value)) {
    throw new Error(`${label} must be an object.`)
  }
  return value
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
