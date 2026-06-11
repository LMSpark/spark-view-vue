/**
 * @module @spark-appworks/spark-ai:class-model/class-model/read-dts-class-model-bundle-json
 * @spark-appworks/spark-ai 的 class-model/class-model/read-dts-class-model-bundle-json 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
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
  MethodMeta,
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
  const returnSchema = readOptionalJsonSchema(record, 'returnSchema', `${path}.returnSchema`)
  const returnTypeText = readOptionalString(record, 'returnTypeText', `${path}.returnTypeText`)
  const takesContext = readOptionalBoolean(record, 'takesContext', `${path}.takesContext`)
  const paramsTypeText = readOptionalString(record, 'paramsTypeText', `${path}.paramsTypeText`)
  const provenance = readOptionalSourceProvenance(record, 'provenance', `${path}.provenance`)
  return {
    name: readRequiredString(record, 'name', `${path}.name`),
    paramsSchema: readRequiredJsonSchemaObject(record, 'paramsSchema', `${path}.paramsSchema`),
    ...(returnSchema === undefined ? {} : { returnSchema }),
    ...(returnTypeText === undefined ? {} : { returnTypeText }),
    ...(takesContext === undefined ? {} : { takesContext }),
    jsdoc: readRequiredString(record, 'jsdoc', `${path}.jsdoc`),
    ...(paramsTypeText === undefined ? {} : { paramsTypeText }),
    ...(provenance === undefined ? {} : { provenance }),
  }
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
  const provenance = readOptionalSourceProvenance(record, 'provenance', `${path}.provenance`)
  return {
    paramsSchema: readRequiredJsonSchemaObject(record, 'paramsSchema', `${path}.paramsSchema`),
    jsdoc: readRequiredString(record, 'jsdoc', `${path}.jsdoc`),
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

function readRequiredJsonSchemaObject(
  record: Record<string, unknown>,
  field: string,
  path: string,
): AiJsonSchemaObject {
  if (!Object.hasOwn(record, field)) {
    throw new Error(`${path} is required.`)
  }
  return parseJsonSchemaObject(record[field], path)
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
