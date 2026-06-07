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
  paramsSchema: unknown
  takesContext?: boolean
  resultSchema?: unknown
  resultApis?: readonly AiApiResultApiRefMetadata[]
  usageRules?: readonly string[]
  requiredBeforeCall?: readonly string[]
  failureModes?: readonly unknown[]
}>

type AiApiAttributeMetadata = Readonly<{
  name: string
  description: string
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
  constructorSignature?: unknown
  attributes?: readonly AiApiAttributeMetadata[]
  actions: readonly AiApiActionMetadata[]
}>

export type AiApiResultApiRefCompact = Readonly<{
  resultPath: readonly string[]
  $ref: string
}>

export type AiApiActionMetadataCompact = Readonly<Omit<AiApiActionMetadata, 'resultApis'>> & {
  resultApis?: readonly AiApiResultApiRefCompact[]
}

export type AiApiObjectMetadataCompact = Readonly<Omit<AiApiObjectMetadata, 'actions'>> & {
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
    ...(api.constructorSignature === undefined ? {} : { constructorSignature: api.constructorSignature }),
    ...(api.attributes === undefined ? {} : { attributes: api.attributes }),
    actions: api.actions.map(compactActionResultApis),
  }
}

function compactActionResultApis(action: AiApiActionMetadata): AiApiActionMetadataCompact {
  return {
    name: action.name,
    methodName: action.methodName,
    description: action.description,
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
