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
  DtsReflectionSignature,
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
  DtsClassModelRuntimeAttribute,
  DtsClassModelRuntimeClassEntry,
  DtsClassModelRuntimeConstructor,
  DtsClassModelRuntimeFileEntry,
  DtsClassModelRuntimeLink,
  DtsClassModelRuntimeLinkRelation,
  DtsClassModelRuntimeManifest,
  DtsClassModelRuntimeMethod,
  DtsClassModelRuntimeModel,
  DtsClassModelRuntimeRef,
  DtsClassModelRuntimeRefEntry,
  DtsClassModelRuntimeSchemaRef,
  DtsClassModelRuntimeShard,
  DtsFileModuleJsDocSource,
  DtsFileModuleSemanticMeta,
  DtsFileProjectionDocument,
} from './dts-bundle-types'
import {
  DTS_CLASS_MODEL_BUNDLE_PROTOCOL,
  DTS_CLASS_MODEL_BUNDLE_VERSION,
  DTS_CLASS_MODEL_RUNTIME_PROTOCOL,
  DTS_CLASS_MODEL_RUNTIME_VERSION,
  DTS_FILE_PROJECTION_VERSION,
} from './dts-bundle-types'
import { canRenderMethodSignatureFromTypeTree } from './dts-type-meta-ops'
import { renderMethodSignatureFromMeta } from './signature-renderer'

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

const RUNTIME_LINK_RELATIONS = new Set<DtsClassModelRuntimeLinkRelation>([
  'attribute',
  'constructor-parameter',
  'method-parameter',
  'method-return',
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
  return {
    schemaVersion: DTS_FILE_PROJECTION_VERSION,
    sourcePath,
    module: readRequiredModuleMeta(record, 'module', 'projection.module'),
    symbols,
    ...(schemaDefs === undefined ? {} : { $defs: schemaDefs }),
    models,
    ...(generatedAt === undefined ? {} : { generatedAt }),
  }
}

export function readDtsClassModelRuntimeManifest(value: unknown): DtsClassModelRuntimeManifest {
  const record = requireJsonRecord(value, 'DTS class-model runtime manifest')
  const schemaVersion = readRequiredNumber(record, 'schemaVersion', 'runtimeManifest.schemaVersion')
  if (schemaVersion !== DTS_CLASS_MODEL_RUNTIME_VERSION) {
    throw new Error(`Unsupported DTS class-model runtime manifest schemaVersion: ${String(schemaVersion)}`)
  }
  const protocol = readRequiredString(record, 'protocol', 'runtimeManifest.protocol')
  if (protocol !== DTS_CLASS_MODEL_RUNTIME_PROTOCOL) {
    throw new Error(`Unsupported DTS class-model runtime manifest protocol: ${protocol}`)
  }
  return {
    schemaVersion: DTS_CLASS_MODEL_RUNTIME_VERSION,
    protocol: DTS_CLASS_MODEL_RUNTIME_PROTOCOL,
    files: readRequiredStringKeyedRecord({
      record,
      field: 'files',
      path: 'runtimeManifest.files',
      parseEntry: parseRuntimeFileEntry,
    }),
    classIndex: readRequiredStringKeyedRecord({
      record,
      field: 'classIndex',
      path: 'runtimeManifest.classIndex',
      parseEntry: parseRuntimeClassEntry,
    }),
    refIndex: readRequiredStringKeyedRecord({
      record,
      field: 'refIndex',
      path: 'runtimeManifest.refIndex',
      parseEntry: parseRuntimeRefEntry,
    }),
  }
}

export function readDtsClassModelRuntimeShard(value: unknown): DtsClassModelRuntimeShard {
  const record = requireJsonRecord(value, 'DTS class-model runtime shard')
  const schemaVersion = readRequiredNumber(record, 'schemaVersion', 'runtimeShard.schemaVersion')
  if (schemaVersion !== DTS_CLASS_MODEL_RUNTIME_VERSION) {
    throw new Error(`Unsupported DTS class-model runtime shard schemaVersion: ${String(schemaVersion)}`)
  }
  const protocol = readRequiredString(record, 'protocol', 'runtimeShard.protocol')
  if (protocol !== DTS_CLASS_MODEL_RUNTIME_PROTOCOL) {
    throw new Error(`Unsupported DTS class-model runtime shard protocol: ${protocol}`)
  }
  return {
    schemaVersion: DTS_CLASS_MODEL_RUNTIME_VERSION,
    protocol: DTS_CLASS_MODEL_RUNTIME_PROTOCOL,
    sourcePath: readRequiredString(record, 'sourcePath', 'runtimeShard.sourcePath'),
    symbols: readRequiredStringArray(record, 'symbols', 'runtimeShard.symbols'),
    '@refs': readRequiredStringKeyedRecord({
      record,
      field: '@refs',
      path: 'runtimeShard.@refs',
      parseEntry: parseRuntimeRef,
    }),
  }
}

function parseBundleFileEntry(value: unknown, path: string): DtsClassModelBundleFileEntry {
  const record = requireJsonRecord(value, path)
  const file = readRequiredString(record, 'file', `${path}.file`)
  return {
    file,
    module: readRequiredModuleMeta(record, 'module', `${path}.module`),
  }
}

function readRequiredModuleMeta(
  record: Record<string, unknown>,
  field: string,
  path: string,
): DtsFileModuleSemanticMeta {
  if (!Object.hasOwn(record, field)) {
    throw new Error(`${path} is required.`)
  }
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

function parseRuntimeFileEntry(value: unknown, path: string): DtsClassModelRuntimeFileEntry {
  const record = requireJsonRecord(value, path)
  return {
    file: readRequiredString(record, 'file', `${path}.file`),
    symbols: readRequiredStringArray(record, 'symbols', `${path}.symbols`),
  }
}

function parseRuntimeClassEntry(value: unknown, path: string): DtsClassModelRuntimeClassEntry {
  const record = requireJsonRecord(value, path)
  return {
    sourcePath: readRequiredString(record, 'sourcePath', `${path}.sourcePath`),
    file: readRequiredString(record, 'file', `${path}.file`),
    modelRef: readRequiredString(record, 'modelRef', `${path}.modelRef`),
    schemaRef: readRequiredString(record, 'schemaRef', `${path}.schemaRef`),
  }
}

function parseRuntimeRefEntry(value: unknown, path: string): DtsClassModelRuntimeRefEntry {
  const record = requireJsonRecord(value, path)
  return {
    file: readRequiredString(record, 'file', `${path}.file`),
  }
}

function parseRuntimeRef(value: unknown, path: string): DtsClassModelRuntimeRef {
  const record = requireJsonRecord(value, path)
  const kind = readRequiredString(record, 'kind', `${path}.kind`)
  if (kind === 'model') return parseRuntimeModel(record, path)
  if (kind === 'constructor') return parseRuntimeConstructor(record, path)
  if (kind === 'attribute') return parseRuntimeAttribute(record, path)
  if (kind === 'method') return parseRuntimeMethod(record, path)
  if (kind === 'schema') return parseRuntimeSchemaRef(record, path)
  if (kind === 'link') return parseRuntimeLink(record, path)
  throw new Error(`${path}.kind must be one of: model, constructor, attribute, method, schema, link`)
}

function parseRuntimeModel(value: unknown, path: string): DtsClassModelRuntimeModel {
  const record = requireJsonRecord(value, path)
  const constructorRef = readOptionalString(record, 'constructorRef', `${path}.constructorRef`)
  return {
    ref: readRequiredString(record, 'ref', `${path}.ref`),
    kind: 'model',
    className: readRequiredString(record, 'className', `${path}.className`),
    schemaRef: readRequiredString(record, 'schemaRef', `${path}.schemaRef`),
    ...(constructorRef === undefined ? {} : { constructorRef }),
    attributeRefs: readRequiredStringArray(record, 'attributeRefs', `${path}.attributeRefs`),
    methodRefs: readRequiredStringArray(record, 'methodRefs', `${path}.methodRefs`),
    linkRefs: readRequiredStringArray(record, 'linkRefs', `${path}.linkRefs`),
  }
}

function parseRuntimeConstructor(value: unknown, path: string): DtsClassModelRuntimeConstructor {
  const record = requireJsonRecord(value, path)
  return {
    ref: readRequiredString(record, 'ref', `${path}.ref`),
    kind: 'constructor',
    ownerRef: readRequiredString(record, 'ownerRef', `${path}.ownerRef`),
    parameterStyle: readRequiredDeclarationKind({
      record,
      field: 'parameterStyle',
      path: `${path}.parameterStyle`,
      allowed: METHOD_PARAMETER_STYLES,
    }),
    paramsSchemaRef: readRequiredString(record, 'paramsSchemaRef', `${path}.paramsSchemaRef`),
  }
}

function parseRuntimeAttribute(value: unknown, path: string): DtsClassModelRuntimeAttribute {
  const record = requireJsonRecord(value, path)
  return {
    ref: readRequiredString(record, 'ref', `${path}.ref`),
    kind: 'attribute',
    ownerRef: readRequiredString(record, 'ownerRef', `${path}.ownerRef`),
    name: readRequiredString(record, 'name', `${path}.name`),
    schemaRef: readRequiredString(record, 'schemaRef', `${path}.schemaRef`),
    readable: readRequiredBoolean(record, 'readable', `${path}.readable`),
    writable: readRequiredBoolean(record, 'writable', `${path}.writable`),
  }
}

function parseRuntimeMethod(value: unknown, path: string): DtsClassModelRuntimeMethod {
  const record = requireJsonRecord(value, path)
  const returnSchemaRef = readOptionalString(record, 'returnSchemaRef', `${path}.returnSchemaRef`)
  return {
    ref: readRequiredString(record, 'ref', `${path}.ref`),
    kind: 'method',
    ownerRef: readRequiredString(record, 'ownerRef', `${path}.ownerRef`),
    name: readRequiredString(record, 'name', `${path}.name`),
    parameterStyle: readRequiredDeclarationKind({
      record,
      field: 'parameterStyle',
      path: `${path}.parameterStyle`,
      allowed: METHOD_PARAMETER_STYLES,
    }),
    paramsSchemaRef: readRequiredString(record, 'paramsSchemaRef', `${path}.paramsSchemaRef`),
    ...(returnSchemaRef === undefined ? {} : { returnSchemaRef }),
  }
}

function parseRuntimeSchemaRef(value: unknown, path: string): DtsClassModelRuntimeSchemaRef {
  const record = requireJsonRecord(value, path)
  return {
    ref: readRequiredString(record, 'ref', `${path}.ref`),
    kind: 'schema',
    schema: readRequiredJsonSchema(record, 'schema', `${path}.schema`),
  }
}

function parseRuntimeLink(value: unknown, path: string): DtsClassModelRuntimeLink {
  const record = requireJsonRecord(value, path)
  return {
    ref: readRequiredString(record, 'ref', `${path}.ref`),
    kind: 'link',
    fromRef: readRequiredString(record, 'fromRef', `${path}.fromRef`),
    relation: readRequiredDeclarationKind({
      record,
      field: 'relation',
      path: `${path}.relation`,
      allowed: RUNTIME_LINK_RELATIONS,
    }),
    targetModelRef: readRequiredString(record, 'targetModelRef', `${path}.targetModelRef`),
    targetClassName: readRequiredString(record, 'targetClassName', `${path}.targetClassName`),
    targetFile: readRequiredString(record, 'targetFile', `${path}.targetFile`),
    targetSchemaRef: readRequiredString(record, 'targetSchemaRef', `${path}.targetSchemaRef`),
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
  const returnTypeMeta = readOptionalDtsTypeMeta(record, 'type', `${path}.type`)
  const takesContext = readOptionalBoolean(record, 'takesContext', `${path}.takesContext`)
  const provenance = readOptionalSourceProvenance(record, 'provenance', `${path}.provenance`)
  const core: MethodMeta = {
    name: readRequiredString(record, 'name', `${path}.name`),
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
    ...(returnTypeMeta === undefined ? {} : { type: returnTypeMeta }),
    ...(paramsSchema === undefined ? {} : { paramsSchema }),
    ...(returnSchema === undefined ? {} : { returnSchema }),
    ...(takesContext === undefined ? {} : { takesContext }),
    jsdoc: readRequiredString(record, 'jsdoc', `${path}.jsdoc`),
    ...(provenance === undefined ? {} : { provenance }),
  }
  const signatureText = readOptionalString(record, 'signatureText', `${path}.signatureText`)
    ?? (canRenderMethodSignatureFromTypeTree(core) ? renderMethodSignatureFromMeta(core) : undefined)
  if (signatureText === undefined) {
    throw new Error(`Missing required field signatureText at ${path}`)
  }
  return { ...core, signatureText }
}

function parseMethodParameterMeta(value: unknown, path: string): MethodParameterMeta {
  const record = requireJsonRecord(value, path)
  const flags = readOptionalParameterFlags(record, `${path}.flags`)
  const defaultValue = readOptionalDtsLiteralField(record, 'defaultValue', `${path}.defaultValue`)
  return {
    name: readRequiredString(record, 'name', `${path}.name`),
    type: readRequiredDtsTypeMeta(record, 'type', `${path}.type`),
    ...(flags === undefined ? {} : { flags }),
    ...(defaultValue === undefined ? {} : { defaultValue }),
  }
}

function readOptionalParameterFlags(
  record: Record<string, unknown>,
  path: string,
): MethodParameterMeta['flags'] | undefined {
  if (!Object.hasOwn(record, 'flags')) return undefined
  const flagsRecord = requireJsonRecord(record['flags'], path)
  const isOptional = readOptionalBoolean(flagsRecord, 'isOptional', `${path}.isOptional`)
  if (isOptional === undefined) return undefined
  return { isOptional }
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
  if (type === 'optional') {
    return { type, elementType: readRequiredDtsTypeMeta(record, 'elementType', `${path}.elementType`) }
  }
  if (type === 'rest') {
    return { type, elementType: readRequiredDtsTypeMeta(record, 'elementType', `${path}.elementType`) }
  }
  if (type === 'tuple') {
    return {
      type,
      elements: readRequiredArray({
        record,
        field: 'elements',
        path: `${path}.elements`,
        parseEntry: parseDtsTypeMeta,
      }),
    }
  }
  if (type === 'reflection') {
    const declarationRecord = requireJsonRecord(record['declaration'], `${path}.declaration`)
    return {
      type,
      declaration: {
        signatures: readRequiredArray({
          record: declarationRecord,
          field: 'signatures',
          path: `${path}.declaration.signatures`,
          parseEntry: parseDtsReflectionSignature,
        }),
      },
    }
  }
  if (type === 'unknown') {
    return { type, name: readRequiredString(record, 'name', `${path}.name`) }
  }
  throw new Error(`Invalid DTS type discriminator at ${path}.type: ${type}`)
}

function parseDtsReflectionSignature(value: unknown, path: string): DtsReflectionSignature {
  const record = requireJsonRecord(value, path)
  return {
    parameters: readRequiredArray({
      record,
      field: 'parameters',
      path: `${path}.parameters`,
      parseEntry: parseMethodParameterMeta,
    }),
    type: readRequiredDtsTypeMeta(record, 'type', `${path}.type`),
  }
}

function readOptionalDtsLiteralField(
  record: Record<string, unknown>,
  field: string,
  path: string,
): string | number | boolean | null | undefined {
  if (!Object.hasOwn(record, field)) return undefined
  return readRequiredDtsLiteralValue(record, field, path)
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
