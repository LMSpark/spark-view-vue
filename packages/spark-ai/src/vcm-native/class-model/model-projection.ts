import type {
  AiApiActionMetadata,
  AiApiAttributeMetadata,
  AiApiJsDocMetadata,
  AiApiObjectMetadata,
  AiApiSourceProvenanceMetadata,
  AiModuleMetadataJson,
} from '../metadata'
import type {
  AttributeMeta,
  ClassModel,
  ClassModelDocument,
  ConstructorMeta,
  JsDocMeta,
  MethodMeta,
  SourceProvenanceMeta,
} from './types'

/**
 * 按 className 从 VCM module 取完整 API 元数据（apiRegistry 优先）。
 * registry key 与 className 同构；仍兼容遗留 kebab-case kind 键。
 */
export function resolveModuleApi(document: ClassModelDocument, className: string): AiApiObjectMetadata {
  const api = resolveModuleApiOrUndefined(document, className)
  if (api === undefined) {
    throw new Error(`VCM module API not found for className "${className}".`)
  }
  return api
}

export function resolveModuleApiOrUndefined(
  document: ClassModelDocument,
  className: string,
): AiApiObjectMetadata | undefined {
  const root = document.module.rootApi
  if (root.kind === className || apiClassName(root) === className) return root
  const fromRegistry = document.module.apiRegistry?.[className]
  if (fromRegistry !== undefined) return fromRegistry
  for (const api of Object.values(document.module.apiRegistry ?? {})) {
    if (apiClassName(api) === className) return api
  }
  return undefined
}

/**
 * 从 root 沿子模型公开字段（attribute.api）属性链可达的 className（LLM 发现索引）。
 */
export function listAttributeReachableKinds(document: ClassModelDocument): readonly string[] {
  const kinds: string[] = []
  const visited = new Set<string>()
  const queue = [document.module.rootApi]
  while (queue.length > 0) {
    const api = queue.shift()
    if (api === undefined || visited.has(api.kind)) continue
    visited.add(api.kind)
    kinds.push(api.kind)
    for (const attribute of api.attributes ?? []) {
      const childKind = readAttributeLinkedKind(attribute)
      if (childKind === undefined) continue
      const childApi = resolveModuleApiOrUndefined(document, childKind)
      if (childApi !== undefined) queue.push(childApi)
    }
  }
  return kinds
}

/** @alias listAttributeReachableKinds — registry kind 与 className 同构。 */
export const listAttributeReachableClassNames = listAttributeReachableKinds

/** LLM guide 投影：仅当 className 在属性链上（或为 root）时返回 ClassModel。 */
export function projectClassModelForGuide(document: ClassModelDocument, className: string): ClassModel {
  const reachable = new Set(listAttributeReachableKinds(document))
  if (!reachable.has(className)) {
    throw new Error(
      `ClassModel "${className}" is not reachable from root "${document.rootKind}" via submodel field chain; fix native planning model / VCM attribute reflection.`,
    )
  }
  return projectClassModelFromApi(resolveModuleApi(document, className))
}

export function projectClassModelFromApi(api: AiApiObjectMetadata): ClassModel {
  const constructorMeta = createConstructorMeta(api)
  return {
    kind: api.kind,
    className: apiClassName(api),
    jsdoc: jsdocFromMetadata(api.jsdoc, api.description),
    ...provenanceProperty(api.provenance),
    ...(constructorMeta === undefined ? {} : { constructor: constructorMeta }),
    attributes: (api.attributes ?? []).map(attribute => createAttributeMeta(attribute)),
    methods: api.actions.map(action => createMethodMeta(action)),
  }
}

export function classNameForKind(document: ClassModelDocument, registryKey: string): string {
  const api = resolveModuleApiOrUndefined(document, registryKey)
  return api === undefined ? registryKey : apiClassName(api)
}

export function findNestedAttributeApi(
  document: ClassModelDocument,
  ownerKind: string,
  attributeName: string,
): AiApiObjectMetadata | undefined {
  const owner = resolveModuleApiOrUndefined(document, ownerKind)
  const attribute = owner?.attributes?.find(item => item.name === attributeName)
  if (attribute?.api === undefined) return undefined
  const childKind = readAttributeLinkedKind(attribute)
  if (childKind === undefined) return undefined
  return resolveModuleApiOrUndefined(document, childKind)
}

export function collectModuleApiKinds(module: AiModuleMetadataJson): readonly string[] {
  const kinds = new Set<string>()
  const pending: AiApiObjectMetadata[] = [module.rootApi, ...Object.values(module.apiRegistry ?? {})]
  while (pending.length > 0) {
    const api = pending.shift()
    if (api === undefined || kinds.has(api.kind)) continue
    kinds.add(api.kind)
    for (const attribute of api.attributes ?? []) {
      const childKind = readAttributeLinkedKind(attribute)
      if (childKind !== undefined) {
        const childApi = resolveModuleApiFromRegistry(module, childKind)
        if (childApi !== undefined) pending.push(childApi)
        continue
      }
      if (attribute.api !== undefined && 'kind' in attribute.api) {
        pending.push(attribute.api)
      }
    }
    for (const action of api.actions) {
      for (const ref of action.resultApis ?? []) {
        if (ref.api !== undefined) pending.push(ref.api)
      }
    }
  }
  return [...kinds].sort()
}

function createConstructorMeta(api: AiApiObjectMetadata): ConstructorMeta | undefined {
  if (api.constructorSignature === undefined) return undefined
  return {
    paramsSchema: api.constructorSignature.paramsSchema,
    jsdoc: jsdocFromMetadata(api.constructorSignature.jsdoc, api.constructorSignature.description),
    ...provenanceProperty(api.constructorSignature.provenance),
  }
}

function createAttributeMeta(attribute: AiApiAttributeMetadata): AttributeMeta {
  return {
    name: attribute.name,
    schema: attribute.schema,
    readable: attribute.readable,
    writable: attribute.writable,
    jsdoc: jsdocFromMetadata(attribute.jsdoc, attribute.description),
    ...provenanceProperty(attribute.provenance),
  }
}

function createMethodMeta(action: AiApiActionMetadata): MethodMeta {
  return {
    name: action.name,
    paramsSchema: action.paramsSchema,
    ...(action.resultSchema === undefined ? {} : { returnSchema: action.resultSchema }),
    ...(action.returnTypeText === undefined ? {} : { returnTypeText: action.returnTypeText }),
    ...(action.takesContext === undefined ? {} : { takesContext: action.takesContext }),
    jsdoc: jsdocFromAction(action),
    ...(action.paramsTypeText === undefined ? {} : { paramsTypeText: action.paramsTypeText }),
    ...provenanceProperty(action.provenance),
  }
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

function apiClassName(api: AiApiObjectMetadata): string {
  const className: unknown = Reflect.get(api, 'className')
  return typeof className === 'string' && className.length > 0 ? className : api.name
}

/** bundle 分片 attribute.api 可能是 { $ref: kind } 紧凑引用。 */
function readAttributeLinkedKind(attribute: AiApiAttributeMetadata): string | undefined {
  const api = attribute.api
  if (api === undefined) return undefined
  if ('kind' in api && typeof api.kind === 'string' && api.kind.length > 0) return api.kind
  if (!('kind' in api)) {
    const ref: unknown = Reflect.get(api, '$ref')
    if (typeof ref === 'string' && ref.trim().length > 0) return ref.trim()
  }
  return undefined
}

function resolveModuleApiFromRegistry(
  module: AiModuleMetadataJson,
  kind: string,
): AiApiObjectMetadata | undefined {
  if (module.rootApi.kind === kind) return module.rootApi
  return module.apiRegistry?.[kind]
}
