/**
 * Compact inline action resultApis into a shared apiRegistry keyed by module kind.
 *
 * Runtime JSON keeps rootApi + one entry per downstream API kind; action returns
 * reference registry kinds instead of embedding duplicate API subtrees.
 */

type AiApiResultApiRefMetadata = Readonly<{
  resultPath: readonly string[]
  api: AiApiObjectMetadata
}>

type AiApiActionMetadata = Readonly<{
  name: string
  methodName: string
  description: string
  jsdoc?: unknown
  provenance?: unknown
  paramsSchema: unknown
  takesContext?: boolean
  resultSchema?: unknown
  resultApis?: readonly AiApiResultApiRefMetadata[]
  usageRules?: readonly string[]
  requiredBeforeCall?: readonly string[]
  failureModes?: readonly unknown[]
}>

type AiApiConstructorMetadata = Readonly<{
  description: string
  jsdoc?: unknown
  provenance?: unknown
  paramsSchema: unknown
}>

type AiApiAttributeMetadata = Readonly<{
  name: string
  description: string
  jsdoc?: unknown
  provenance?: unknown
  schema: unknown
  readable: boolean
  writable: boolean
  api?: AiApiObjectMetadata
}>

type AiApiObjectMetadata = Readonly<{
  className: string
  kind: string
  name: string
  description: string
  jsdoc?: unknown
  provenance?: unknown
  constructorSignature?: AiApiConstructorMetadata
  attributes?: readonly AiApiAttributeMetadata[]
  actions: readonly AiApiActionMetadata[]
}>

export type AiApiResultApiRefCompact = Readonly<{
  resultPath: readonly string[]
  $ref: string
}>

type AiApiJsDocMetadataCompact = Readonly<{
  summary?: string
  tags?: readonly unknown[]
}>

export type AiApiActionMetadataCompact = Readonly<Omit<AiApiActionMetadata, 'resultApis' | 'jsdoc' | 'provenance'>> & {
  jsdoc?: AiApiJsDocMetadataCompact
  resultApis?: readonly AiApiResultApiRefCompact[]
}

export type AiApiConstructorMetadataCompact = Readonly<Omit<AiApiConstructorMetadata, 'jsdoc' | 'provenance'>> & {
  jsdoc?: AiApiJsDocMetadataCompact
}

export type AiApiAttributeMetadataCompact = Readonly<Omit<AiApiAttributeMetadata, 'api' | 'jsdoc' | 'provenance'>> & {
  jsdoc?: AiApiJsDocMetadataCompact
  api?: AiApiObjectMetadataCompact
}

export type AiApiObjectMetadataCompact = Readonly<Omit<AiApiObjectMetadata, 'actions' | 'attributes' | 'constructorSignature' | 'jsdoc' | 'provenance'>> & {
  jsdoc?: AiApiJsDocMetadataCompact
  constructorSignature?: AiApiConstructorMetadataCompact
  attributes?: readonly AiApiAttributeMetadataCompact[]
  actions: readonly AiApiActionMetadataCompact[]
}

export type AiModuleMetadataJsonCompact = Readonly<{
  schemaVersion: 2
  rootApi: AiApiObjectMetadataCompact
  apiRegistry: Readonly<Record<string, AiApiObjectMetadataCompact>>
}>

export type AiModuleMetadataJsonInline = Readonly<{
  schemaVersion: 1
  rootApi: AiApiObjectMetadata
}>

export function compactModuleMetadataApiRegistry(
  module: AiModuleMetadataJsonInline,
): AiModuleMetadataJsonCompact {
  const registry = new Map<string, AiApiObjectMetadata>()
  collectApiObjects(module.rootApi, registry)

  const apiRegistry: Record<string, AiApiObjectMetadataCompact> = {}
  for (const [kind, api] of registry) {
    if (kind === module.rootApi.kind) continue
    apiRegistry[kind] = compactApiObjectActions(api)
  }

  return {
    schemaVersion: 2,
    rootApi: compactApiObjectActions(module.rootApi),
    apiRegistry,
  }
}

function collectApiObjects(api: AiApiObjectMetadata, registry: Map<string, AiApiObjectMetadata>): void {
  const existing = registry.get(api.kind)
  if (existing === undefined) {
    registry.set(api.kind, api)
  }
  for (const action of api.actions) {
    for (const ref of action.resultApis ?? []) {
      collectApiObjects(ref.api, registry)
    }
  }
  for (const attribute of api.attributes ?? []) {
    if (attribute.api !== undefined) {
      collectApiObjects(attribute.api, registry)
    }
  }
}

function compactApiObjectActions(api: AiApiObjectMetadata): AiApiObjectMetadataCompact {
  return {
    className: api.className,
    kind: api.kind,
    name: api.name,
    description: api.description,
    ...compactJsDocProperty(api.jsdoc, api.description),
    ...(api.constructorSignature === undefined ? {} : { constructorSignature: compactConstructorSignature(api.constructorSignature) }),
    ...(api.attributes === undefined ? {} : { attributes: api.attributes.map(compactAttribute) }),
    actions: api.actions.map(compactActionResultApis),
  }
}

function compactActionResultApis(action: AiApiActionMetadata): AiApiActionMetadataCompact {
  return {
    name: action.name,
    methodName: action.methodName,
    description: action.description,
    ...compactJsDocProperty(action.jsdoc, action.description),
    paramsSchema: action.paramsSchema,
    ...(action.takesContext === undefined ? {} : { takesContext: action.takesContext }),
    ...(action.resultSchema === undefined ? {} : { resultSchema: action.resultSchema }),
    ...(action.resultApis === undefined
      ? {}
      : {
          resultApis: action.resultApis.map(ref => ({
            resultPath: [...ref.resultPath],
            $ref: ref.api.kind,
          })),
        }),
    ...(action.usageRules === undefined ? {} : { usageRules: [...action.usageRules] }),
    ...(action.requiredBeforeCall === undefined ? {} : { requiredBeforeCall: [...action.requiredBeforeCall] }),
    ...(action.failureModes === undefined ? {} : { failureModes: [...action.failureModes] }),
  }
}

function compactConstructorSignature(constructorSignature: AiApiConstructorMetadata): AiApiConstructorMetadataCompact {
  return {
    description: constructorSignature.description,
    ...compactJsDocProperty(constructorSignature.jsdoc, constructorSignature.description),
    paramsSchema: constructorSignature.paramsSchema,
  }
}

function compactAttribute(attribute: AiApiAttributeMetadata): AiApiAttributeMetadataCompact {
  return {
    name: attribute.name,
    description: attribute.description,
    ...compactJsDocProperty(attribute.jsdoc, attribute.description),
    schema: attribute.schema,
    readable: attribute.readable,
    writable: attribute.writable,
    ...(attribute.api === undefined ? {} : { api: compactApiObjectActions(attribute.api) }),
  }
}

function compactJsDocProperty(
  jsdoc: unknown,
  fallbackDescription: string,
): { jsdoc?: AiApiJsDocMetadataCompact } {
  const compact = compactJsDoc(jsdoc, fallbackDescription)
  return compact === undefined ? {} : { jsdoc: compact }
}

function compactJsDoc(
  jsdoc: unknown,
  fallbackDescription: string,
): AiApiJsDocMetadataCompact | undefined {
  if (!isRecord(jsdoc)) return undefined
  const summary = typeof jsdoc['summary'] === 'string' ? jsdoc['summary'] : undefined
  const tags = Array.isArray(jsdoc['tags']) ? jsdoc['tags'] : undefined
  const compact: { summary?: string; tags?: readonly unknown[] } = {}
  if (summary !== undefined && summary !== fallbackDescription) {
    compact.summary = summary
  }
  if (tags !== undefined && tags.length > 0) {
    compact.tags = tags
  }
  return Object.keys(compact).length === 0 ? undefined : compact
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
