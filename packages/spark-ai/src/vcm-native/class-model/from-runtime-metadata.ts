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
  ClassModel,
  ClassModelDiagnostic,
  ClassModelDocument,
  ConstructorMeta,
  JsDocMeta,
  MethodMeta,
  SourceProvenanceMeta,
} from './types'
import { CLASS_MODEL_DOCUMENT_VERSION } from './types'

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
  _apiByKind: ReadonlyMap<string, AiApiObjectMetadata>,
  diagnostics: ClassModelDiagnostic[],
): ClassModel {
  const attributes = (api.attributes ?? []).map(attribute => createAttributeMeta(attribute, diagnostics, api.kind))
  const methods = api.actions.map(action => createMethodMeta(action, diagnostics, api.kind))
  const constructorMeta = createConstructorMeta(api)

  return {
    kind: api.kind,
    className: apiClassName(api),
    jsdoc: jsdocFromMetadata(api.jsdoc, api.description),
    ...provenanceProperty(api.provenance),
    ...(constructorMeta === undefined ? {} : { constructor: constructorMeta }),
    attributes,
    methods,
  }
}

function createConstructorMeta(api: AiApiObjectMetadata): ConstructorMeta | undefined {
  if (api.constructorSignature === undefined) return undefined
  return {
    paramsSchema: api.constructorSignature.paramsSchema,
    jsdoc: jsdocFromMetadata(api.constructorSignature.jsdoc, api.constructorSignature.description),
    ...provenanceProperty(api.constructorSignature.provenance),
  }
}

function createAttributeMeta(
  attribute: AiApiAttributeMetadata,
  diagnostics: ClassModelDiagnostic[],
  ownerKind: string,
): AttributeMeta {
  const valueKind = resolveAttributeValueKind(attribute, diagnostics, ownerKind)
  return {
    name: attribute.name,
    schema: attribute.schema,
    readable: attribute.readable,
    writable: attribute.writable,
    jsdoc: jsdocFromMetadata(attribute.jsdoc, attribute.description),
    ...(valueKind === undefined ? {} : { valueKind }),
    ...provenanceProperty(attribute.provenance),
  }
}

function resolveAttributeValueKind(
  attribute: AiApiAttributeMetadata,
  diagnostics: ClassModelDiagnostic[],
  ownerKind: string,
): string | undefined {
  if (attribute.api === undefined) return undefined
  if (attribute.api.kind.length === 0) {
    diagnostics.push({
      level: 'warning',
      code: 'ATTRIBUTE_API_KIND_EMPTY',
      target: `${ownerKind}.${attribute.name}`,
      message: '属性 API 引用缺少 kind，已按 schema 类型投影。',
    })
    return undefined
  }
  return attribute.api.kind
}

function createMethodMeta(
  action: AiApiActionMetadata,
  diagnostics: ClassModelDiagnostic[],
  ownerKind: string,
): MethodMeta {
  const resultApiRefs = normalizeResultApiRefs(action.resultApis ?? [], diagnostics, `${ownerKind}.${action.name}`)
  const navigation = resolveMethodNavigation(action, resultApiRefs)

  return {
    name: action.name,
    paramsSchema: action.paramsSchema,
    ...(action.resultSchema === undefined ? {} : { returnSchema: action.resultSchema }),
    ...(action.takesContext === undefined ? {} : { takesContext: action.takesContext }),
    jsdoc: jsdocFromAction(action),
    ...(navigation.returnsKind === undefined ? {} : { returnsKind: navigation.returnsKind }),
    ...(navigation.callbackTargetKind === undefined ? {} : { callbackTargetKind: navigation.callbackTargetKind }),
    ...provenanceProperty(action.provenance),
  }
}

function resolveMethodNavigation(
  action: AiApiActionMetadata,
  resultApiRefs: readonly ApiRef[],
): Readonly<{ returnsKind?: string; callbackTargetKind?: string }> {
  if (requiresRunCallback(action) && resultApiRefs.length > 0) {
    const callbackTargetKind = resultApiRefs[0]?.kind
    return callbackTargetKind === undefined ? {} : { callbackTargetKind }
  }
  const returnRef = resultApiRefs.find(ref => ref.path.length === 0)
  if (returnRef !== undefined) return { returnsKind: returnRef.kind }
  return {}
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
        code: 'RESULT_API_KIND_MISSING',
        target,
        message: 'resultApi 引用缺少 kind，已按 schema 类型投影。',
      })
      continue
    }
    normalized.push({ kind, path: [...ref.resultPath], ...(ref.api === undefined ? {} : { api: ref.api }) })
  }
  return normalized
}

function jsdocFromAction(action: AiApiActionMetadata): JsDocMeta {
  if (action.jsdoc !== undefined) return jsdocFromMetadata(action.jsdoc, action.description)
  return renderJsDoc([
    action.description,
    ...tagLines('requiredBeforeCall', action.requiredBeforeCall ?? []),
    ...tagLines('usageRule', action.usageRules ?? []),
    ...tagLines('failureMode', (action.failureModes ?? []).map(mode => `${mode.code} ${mode.when} => ${mode.fix}`)),
  ])
}

function jsdocFromMetadata(jsdoc: AiApiJsDocMetadata | undefined, fallbackSummary: string): JsDocMeta {
  return typeof jsdoc === 'string' && jsdoc.trim().length > 0 ? jsdoc : renderJsDoc([fallbackSummary])
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

function tagLines(name: string, values: readonly string[]): readonly string[] {
  return values.map(text => `@${name}${text.length === 0 ? '' : ` ${text}`}`)
}

function renderJsDoc(lines: readonly string[]): string {
  const normalized = lines.filter(line => line.trim().length > 0)
  if (normalized.length === 0) return ''
  if (normalized.length === 1) return `/** ${normalized[0]} */`
  return [
    '/**',
    ...normalized.map(line => ` * ${line}`),
    ' */',
  ].join('\n')
}

function requiresRunCallback(action: AiApiActionMetadata): boolean {
  const properties = action.paramsSchema.properties
  return properties !== undefined
    && Object.prototype.hasOwnProperty.call(properties, 'run')
    && action.paramsSchema.required?.includes('run') === true
}

function apiClassName(api: AiApiObjectMetadata): string {
  const className: unknown = Reflect.get(api, 'className')
  return typeof className === 'string' && className.length > 0 ? className : api.name
}
