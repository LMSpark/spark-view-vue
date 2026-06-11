import type {
  AiJsonSchema,
  AiJsonValue,
} from '../../json'
import type { AiAgentRuntimeHostContext } from '../tool-runtime'
import { AiAgentToolResult } from '../tool-runtime'
import {
  DtsClassModelBundleLoader,
  type ClassModel,
  type DtsClassModelSurfaceDocument,
} from '../../class-model/class-model'
import type {
  AiApiActionMetadata,
  AiApiAttributeMetadata,
  AiApiObjectMetadata,
  AiModuleMetadataJson,
} from '../../class-model/metadata'
import { executeModuleScript } from './native-script-sandbox'
import { createAiApiScriptContext } from './native-script-context'

export type DtsNativeScriptRunCommand<TInstance = unknown> = Readonly<{
  instance: TInstance
  manifestUrl: string
  rootClassName: string
  host?: AiAgentRuntimeHostContext
  fetchJson?: (url: string) => Promise<unknown>
  script: string
}>

type MutableAiApiObjectMetadata = {
  className: string
  kind: string
  name: string
  description: string
  jsdoc?: string
  provenance?: NonNullable<AiApiObjectMetadata['provenance']>
  constructorSignature?: NonNullable<AiApiObjectMetadata['constructorSignature']>
  actions: AiApiActionMetadata[]
  attributes?: AiApiAttributeMetadata[]
}

export async function executeDtsNativeScript(
  command: DtsNativeScriptRunCommand,
): Promise<AiAgentToolResult<AiJsonValue>> {
  if (command.script.trim().length === 0) {
    return AiAgentToolResult.failCode(
      'SCRIPT_EMPTY',
      'native script body must not be empty.',
      '让 LLM 直接生成 async function body，例如 return { ... }；this 绑定当前业务根实例。',
    )
  }

  const metadata = await createDtsNativeModuleMetadata({
    manifestUrl: command.manifestUrl,
    rootClassName: command.rootClassName,
    ...(command.fetchJson === undefined ? {} : { fetchJson: command.fetchJson }),
  })
  const context = createAiApiScriptContext({
    instance: command.instance,
    api: metadata.rootApi,
    ctx: createNativePathContext(command.host),
    validateOptions: {},
  })
  return await executeModuleScript(command.script, context)
}

export async function createDtsNativeModuleMetadata(command: Readonly<{
  manifestUrl: string
  rootClassName: string
  fetchJson?: (url: string) => Promise<unknown>
}>): Promise<AiModuleMetadataJson> {
  const loader = new DtsClassModelBundleLoader({
    manifestUrl: command.manifestUrl,
    ...(command.fetchJson === undefined ? {} : { fetchJson: command.fetchJson }),
  })
  await loader.ensureReachableClosure(command.rootClassName)
  const surface = loader.buildLoadedSurface()
  const rootApi = createApiFromSurface(surface, command.rootClassName)
  return {
    schemaVersion: 2,
    rootApi,
    apiRegistry: collectApiRegistry(rootApi),
  }
}

function createApiFromSurface(
  surface: DtsClassModelSurfaceDocument,
  rootClassName: string,
): AiApiObjectMetadata {
  const cache = new Map<string, MutableAiApiObjectMetadata>()
  return toApi(rootClassName)

  function toApi(className: string): AiApiObjectMetadata {
    const cached = cache.get(className)
    if (cached !== undefined) return cached

    const model = surface.models[className]
    if (model === undefined) {
      throw new Error(`DTS ClassModel missing class "${className}".`)
    }

    const constructorMeta = model.constructorMeta
    const api: MutableAiApiObjectMetadata = {
      className: model.className,
      kind: model.kind,
      name: model.className,
      description: summarizeJsDoc(model.jsdoc),
      ...(model.jsdoc.trim().length === 0 ? {} : { jsdoc: model.jsdoc }),
      ...(model.provenance === undefined ? {} : { provenance: model.provenance }),
      ...(constructorMeta === undefined
        ? {}
        : {
            constructorSignature: {
              description: summarizeJsDoc(constructorMeta.jsdoc),
              ...(constructorMeta.jsdoc.trim().length === 0 ? {} : { jsdoc: constructorMeta.jsdoc }),
              ...(constructorMeta.provenance === undefined ? {} : { provenance: constructorMeta.provenance }),
              paramsSchema: constructorMeta.paramsSchema,
            },
          }),
      actions: [],
      attributes: [],
    }
    cache.set(className, api)

    api.attributes = model.attributes.map(attribute => ({
      name: attribute.name,
      description: summarizeJsDoc(attribute.jsdoc),
      ...(attribute.jsdoc.trim().length === 0 ? {} : { jsdoc: attribute.jsdoc }),
      ...(attribute.provenance === undefined ? {} : { provenance: attribute.provenance }),
      schema: attribute.schema,
      readable: attribute.readable,
      writable: attribute.writable,
      ...apiRefProperty(surface, attribute.schema, toApi),
    }))

    api.actions = model.methods
      .filter(method => !method.name.startsWith('static '))
      .map(method => ({
        name: method.name,
        methodName: method.name,
        description: summarizeJsDoc(method.jsdoc),
        ...(method.jsdoc.trim().length === 0 ? {} : { jsdoc: method.jsdoc }),
        ...(method.provenance === undefined ? {} : { provenance: method.provenance }),
        paramsSchema: method.paramsSchema,
        ...(method.paramsTypeText === undefined ? {} : { paramsTypeText: method.paramsTypeText }),
        takesContext: false,
        ...(method.returnSchema === undefined ? {} : { resultSchema: method.returnSchema }),
        ...(method.returnTypeText === undefined ? {} : { returnTypeText: method.returnTypeText }),
        ...resultApiProperty(surface, method, toApi),
      }))

    return api
  }
}

function collectApiRegistry(rootApi: AiApiObjectMetadata): Readonly<Record<string, AiApiObjectMetadata>> {
  const registry: Record<string, AiApiObjectMetadata> = {}
  const visited = new Set<string>()
  const visit = (api: AiApiObjectMetadata): void => {
    if (visited.has(api.kind)) return
    visited.add(api.kind)
    if (api.kind !== rootApi.kind) registry[api.kind] = api
    for (const attribute of api.attributes ?? []) {
      if (attribute.api !== undefined) visit(attribute.api)
    }
    for (const action of api.actions) {
      for (const resultApi of action.resultApis ?? []) {
        if (resultApi.api !== undefined) visit(resultApi.api)
      }
    }
  }
  visit(rootApi)
  return registry
}

function apiRefProperty(
  surface: DtsClassModelSurfaceDocument,
  schema: AiJsonSchema,
  toApi: (className: string) => AiApiObjectMetadata,
): { api?: AiApiObjectMetadata } {
  const className = resolveSchemaClassName(surface, schema)
  return className === undefined ? {} : { api: toApi(className) }
}

function resultApiProperty(
  surface: DtsClassModelSurfaceDocument,
  method: ClassModel['methods'][number],
  toApi: (className: string) => AiApiObjectMetadata,
): { resultApis?: ReadonlyArray<{ resultPath: readonly string[]; api: AiApiObjectMetadata }> } {
  const className = resolveMethodReturnClassName(surface, method)
  return className === undefined
    ? {}
    : { resultApis: [{ resultPath: [], api: toApi(className) }] }
}

function resolveMethodReturnClassName(
  surface: DtsClassModelSurfaceDocument,
  method: ClassModel['methods'][number],
): string | undefined {
  return resolveClassNameFromTypeText(surface, method.returnTypeText)
    ?? resolveSchemaClassName(surface, method.returnSchema)
}

function resolveSchemaClassName(
  surface: DtsClassModelSurfaceDocument,
  schema: AiJsonSchema | undefined,
): string | undefined {
  if (schema === undefined || schema === true || schema === false || typeof schema !== 'object') return undefined
  return resolveClassNameFromTypeText(surface, schema.title)
}

function resolveClassNameFromTypeText(
  surface: DtsClassModelSurfaceDocument,
  typeText: unknown,
): string | undefined {
  if (typeof typeText !== 'string' || typeText.length === 0) return undefined
  const classNames = Object.keys(surface.models).sort((left, right) => right.length - left.length)
  return classNames.find(className => containsTypeReference(typeText, className))
}

function containsTypeReference(typeText: string, className: string): boolean {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'u').test(typeText)
}

function summarizeJsDoc(jsdoc: string): string {
  const lines = jsdoc
    .replace(/^\/\*\*/u, '')
    .replace(/\*\/$/u, '')
    .split(/\r?\n/u)
    .map(line => line.replace(/^\s*\*\s?/u, '').trim())
    .filter(line => line.length > 0 && !line.startsWith('@'))
  return lines[0] ?? ''
}

function createNativePathContext(host: AiAgentRuntimeHostContext | undefined): Readonly<{
  segments: readonly string[]
  host?: AiAgentRuntimeHostContext
}> {
  return host === undefined
    ? { segments: [] }
    : { segments: [], host }
}
