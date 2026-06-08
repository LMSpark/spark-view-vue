import type { AiJsonSchemaObject } from '../../json'
import type {
  AiApiActionMetadata,
  AiApiAttributeMetadata,
  AiApiJsDocMetadata,
  AiApiObjectMetadata,
  AiApiResultApiRef,
  AiApiSourceProvenanceMetadata,
  AiModuleMetadataJson,
} from '../metadata'
import type {
  AttributeMeta,
  ChildModelLink,
  ClassModel,
  ClassModelDiagnostic,
  ClassModelDocument,
  ConstructorMeta,
  JsDocMeta,
  JsDocTagMeta,
  MethodMeta,
  SourceProvenanceMeta,
} from './types'
import { CLASS_MODEL_DOCUMENT_VERSION } from './types'
import { jsonSchemaToTypeText } from './json-schema-to-type'

type RuntimeDocumentInput = Readonly<{
  $defs?: Readonly<Record<string, AiJsonSchemaObject>>
  modules: readonly AiModuleMetadataJson[]
}>

type ApiRef = Readonly<{
  kind: string
  path: readonly string[]
  api?: AiApiObjectMetadata
}>

/**
 * 输入适配层：这里读取 VCM runtime metadata 的池化结果和标准化 schema，
 * 并投影为 ClassModel 新协议。
 */
export function createClassModelDocumentFromRuntimeDocument(
  document: RuntimeDocumentInput,
): ClassModelDocument {
  const module = document.modules[0]
  if (module === undefined) {
    throw new Error('ClassModel runtime document requires at least one module metadata entry.')
  }
  return createClassModelDocumentFromModuleMetadata({
    module,
    ...(document.$defs === undefined ? {} : { schemaDefs: document.$defs }),
  })
}

export function createClassModelDocumentFromModuleMetadata(command: Readonly<{
  module: AiModuleMetadataJson
  schemaDefs?: Readonly<Record<string, AiJsonSchemaObject>>
}>): ClassModelDocument {
  const apiByKind = collectApis(command.module)
  const diagnostics: ClassModelDiagnostic[] = []
  const models: Record<string, ClassModel> = {}

  for (const api of apiByKind.values()) {
    models[api.kind] = createClassModel(api, apiByKind, diagnostics)
  }

  return {
    schemaVersion: CLASS_MODEL_DOCUMENT_VERSION,
    rootKind: command.module.rootApi.kind,
    models,
    ...(command.schemaDefs === undefined ? {} : { $defs: command.schemaDefs }),
    diagnostics,
  }
}

function collectApis(module: AiModuleMetadataJson): Map<string, AiApiObjectMetadata> {
  const apiByKind = new Map<string, AiApiObjectMetadata>()
  const pending = [module.rootApi, ...Object.values(module.apiRegistry ?? {})]
  for (const api of pending) {
    if (apiByKind.has(api.kind)) continue
    apiByKind.set(api.kind, api)
    pending.push(...inlineApis(api))
  }
  return apiByKind
}

function inlineApis(api: AiApiObjectMetadata): readonly AiApiObjectMetadata[] {
  const apis: AiApiObjectMetadata[] = []
  for (const attribute of api.attributes ?? []) {
    if (attribute.api !== undefined) apis.push(attribute.api)
  }
  for (const action of api.actions) {
    for (const ref of action.resultApis ?? []) {
      if (ref.api !== undefined) apis.push(ref.api)
    }
  }
  return apis
}

function createClassModel(
  api: AiApiObjectMetadata,
  apiByKind: ReadonlyMap<string, AiApiObjectMetadata>,
  diagnostics: ClassModelDiagnostic[],
): ClassModel {
  const attributes = (api.attributes ?? []).map(attribute => createAttributeMeta(attribute, apiByKind, diagnostics, api.kind))
  const methods = api.actions.map(action => createMethodMeta(action, apiByKind, diagnostics, api.kind))
  const constructorMeta = createConstructorMeta(api)

  return {
    kind: api.kind,
    className: apiClassName(api),
    name: api.name,
    declaration: `class ${apiClassName(api)}`,
    jsdoc: jsdocFromMetadata(api.jsdoc, api.description),
    ...provenanceProperty(api.provenance),
    ...(constructorMeta === undefined ? {} : { constructor: constructorMeta }),
    attributes,
    methods,
  }
}

function createConstructorMeta(api: AiApiObjectMetadata): ConstructorMeta | undefined {
  if (api.constructorSignature === undefined) return undefined
  const paramsText = paramsTextFromSchema(api.constructorSignature.paramsSchema)
  const signature = `constructor(${paramsText})`
  return {
    signature,
    declaration: signature,
    paramsSchema: api.constructorSignature.paramsSchema,
    jsdoc: jsdocFromMetadata(api.constructorSignature.jsdoc, api.constructorSignature.description),
    ...provenanceProperty(api.constructorSignature.provenance),
  }
}

function createAttributeMeta(
  attribute: AiApiAttributeMetadata,
  apiByKind: ReadonlyMap<string, AiApiObjectMetadata>,
  diagnostics: ClassModelDiagnostic[],
  ownerKind: string,
): AttributeMeta {
  const childModels = createAttributeChildModels(attribute, diagnostics, ownerKind)
  const typeText = childModels[0]?.targetKind === undefined
    ? jsonSchemaToTypeText(attribute.schema)
    : classNameByKind(apiByKind, childModels[0].targetKind)
  const readonlyText = attribute.writable ? '' : 'readonly '
  return {
    name: attribute.name,
    declaration: `${readonlyText}${attribute.name}: ${typeText}`,
    typeText,
    schema: attribute.schema,
    readable: attribute.readable,
    writable: attribute.writable,
    jsdoc: jsdocFromMetadata(attribute.jsdoc, attribute.description),
    ...provenanceProperty(attribute.provenance),
    childModels,
  }
}

function createMethodMeta(
  action: AiApiActionMetadata,
  apiByKind: ReadonlyMap<string, AiApiObjectMetadata>,
  diagnostics: ClassModelDiagnostic[],
  ownerKind: string,
): MethodMeta {
  const childModels = createMethodChildModels(action, diagnostics, ownerKind)
  const returnTypeText = inferMethodReturnTypeText(action, childModels, apiByKind)
  const paramsText = paramsTextFromSchema(action.paramsSchema, childModels, apiByKind)
  const signature = `${action.name}(${paramsText}): ${returnTypeText}`

  return {
    name: action.name,
    methodName: action.methodName,
    signature,
    declaration: signature,
    paramsSchema: action.paramsSchema,
    returnTypeText,
    ...(action.resultSchema === undefined ? {} : { returnSchema: action.resultSchema }),
    ...(action.takesContext === undefined ? {} : { takesContext: action.takesContext }),
    jsdoc: jsdocFromAction(action),
    ...provenanceProperty(action.provenance),
    childModels,
    requiredBeforeCall: action.requiredBeforeCall ?? [],
    usageRules: action.usageRules ?? [],
    failureModes: action.failureModes ?? [],
  }
}

function createAttributeChildModels(
  attribute: AiApiAttributeMetadata,
  diagnostics: ClassModelDiagnostic[],
  ownerKind: string,
): readonly ChildModelLink[] {
  if (attribute.api === undefined) return []
  if (attribute.api.kind.length === 0) {
    diagnostics.push({
      level: 'warning',
      code: 'ATTRIBUTE_CHILD_MODEL_KIND_EMPTY',
      target: `${ownerKind}.${attribute.name}`,
      message: '属性子模型缺少 kind，已跳过 childModels 链接。',
    })
    return []
  }
  return [{
    source: 'attribute',
    targetKind: attribute.api.kind,
    path: [attribute.name],
  }]
}

function createMethodChildModels(
  action: AiApiActionMetadata,
  diagnostics: ClassModelDiagnostic[],
  ownerKind: string,
): readonly ChildModelLink[] {
  const refs = normalizeResultApiRefs(action.resultApis ?? [], diagnostics, `${ownerKind}.${action.name}`)
  // 旧 resultApis 只记录“还能进入哪些模型”；ClassModel 在此区分返回值入口和回调参数入口。
  if (requiresRunCallback(action)) {
    return refs.map((ref): ChildModelLink => ({
      source: 'callback-param',
      targetKind: ref.kind,
      methodParamName: 'run',
      methodParamIndex: 0,
      callbackParamName: inferCallbackParamName(ref.kind),
      callbackParamIndex: 0,
    }))
  }

  return refs.map((ref): ChildModelLink => ({
    source: 'return',
    targetKind: ref.kind,
    path: refPath(ref),
  }))
}

function normalizeResultApiRefs(
  refs: readonly AiApiResultApiRef[],
  diagnostics: ClassModelDiagnostic[],
  target: string,
): readonly ApiRef[] {
  const normalized: ApiRef[] = []
  for (const ref of refs) {
    const kind = ref.$ref ?? ref.api?.kind
    if (kind === undefined || kind.length === 0) {
      diagnostics.push({
        level: 'warning',
        code: 'CHILD_MODEL_KIND_MISSING',
        target,
        message: '子模型引用缺少 kind，已跳过 childModels 链接。',
      })
      continue
    }
    normalized.push({ kind, path: [...ref.resultPath], ...(ref.api === undefined ? {} : { api: ref.api }) })
  }
  return normalized
}

function refPath(ref: ApiRef): readonly string[] {
  return ref.path
}

function inferMethodReturnTypeText(
  action: AiApiActionMetadata,
  childModels: readonly ChildModelLink[],
  apiByKind: ReadonlyMap<string, AiApiObjectMetadata>,
): string {
  if (childModels.some(child => child.source === 'callback-param')) return 'Promise<void>'
  const returnChild = childModels.find(child => child.source === 'return' && child.path.length === 0)
  if (returnChild !== undefined) return classNameByKind(apiByKind, returnChild.targetKind)
  return jsonSchemaToTypeText(action.resultSchema)
}

function paramsTextFromSchema(
  schema: AiJsonSchemaObject,
  childModels: readonly ChildModelLink[] = [],
  apiByKind: ReadonlyMap<string, AiApiObjectMetadata> = new Map(),
): string {
  const callbackChild = childModels.find(child => child.source === 'callback-param')
  if (callbackChild !== undefined) {
    const typeName = classNameByKind(apiByKind, callbackChild.targetKind)
    return `${callbackChild.methodParamName}: (${callbackChild.callbackParamName}: ${typeName}) => void | Promise<void>`
  }

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

function jsdocFromAction(action: AiApiActionMetadata): JsDocMeta {
  if (action.jsdoc !== undefined) return jsdocFromMetadata(action.jsdoc, action.description)
  return {
    summary: action.description,
    tags: [
      ...tagValues('requiredBeforeCall', action.requiredBeforeCall ?? []),
      ...tagValues('usageRule', action.usageRules ?? []),
      ...tagValues('failureMode', (action.failureModes ?? []).map(mode => `${mode.code} ${mode.when} => ${mode.fix}`)),
    ],
  }
}

function jsdocFromMetadata(jsdoc: AiApiJsDocMetadata | undefined, fallbackSummary: string): JsDocMeta {
  if (jsdoc === undefined) return { summary: fallbackSummary, tags: [] }
  const summary = typeof jsdoc.summary === 'string' && jsdoc.summary.length > 0
    ? jsdoc.summary
    : fallbackSummary
  const tags = jsdoc.tags ?? []
  return {
    ...(typeof jsdoc.raw === 'string' && jsdoc.raw.length > 0 ? { raw: jsdoc.raw } : {}),
    summary,
    tags: tags.map(tag => ({
      name: tag.name,
      text: tag.text,
      ...(tag.paramName === undefined ? {} : { paramName: tag.paramName }),
    })),
  }
}

function provenanceProperty(
  provenance: AiApiSourceProvenanceMetadata | undefined,
): { provenance?: SourceProvenanceMeta } {
  if (provenance === undefined) return {}
  return {
    provenance: {
      file: provenance.file,
      line: provenance.line,
      className: provenance.className,
      ...(provenance.memberName === undefined ? {} : { memberName: provenance.memberName }),
      ...(provenance.typeEntryFile === undefined ? {} : { typeEntryFile: provenance.typeEntryFile }),
    },
  }
}

function tagValues(name: string, values: readonly string[]): readonly JsDocTagMeta[] {
  return values.map(text => ({ name, text }))
}

// 当前 runtime metadata 用必填 run 参数表达受控编辑，ClassModel 将其稳定化为 callback-param。
function requiresRunCallback(action: AiApiActionMetadata): boolean {
  const properties = action.paramsSchema.properties
  return properties !== undefined
    && Object.prototype.hasOwnProperty.call(properties, 'run')
    && action.paramsSchema.required?.includes('run') === true
}

function inferCallbackParamName(targetKind: string): string {
  if (targetKind === 'node-tree') return 'tree'
  if (targetKind === 'dataset') return 'tool'
  return 'model'
}

function classNameByKind(
  apiByKind: ReadonlyMap<string, AiApiObjectMetadata>,
  kind: string,
): string {
  const api = apiByKind.get(kind)
  return api === undefined ? kind : apiClassName(api)
}

function apiClassName(api: AiApiObjectMetadata): string {
  const className = (api as Readonly<Record<string, unknown>>)['className']
  return typeof className === 'string' && className.length > 0 ? className : api.name
}
