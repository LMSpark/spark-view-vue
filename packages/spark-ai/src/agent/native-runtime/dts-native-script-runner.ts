/**
 * @module @spark-appworks/spark-ai:agent/native-runtime/dts-native-script-runner
 * 职责：定义 DTS ClassModel 脚本运行命令，让 native runtime 能在受控上下文中执行模型脚本。
 * 边界：只描述脚本调用输入输出，不负责生成脚本、不注册工具，也不直接访问页面配置文件。
 * AI用途：需要把 model_script tool call 交给本地脚本执行器时，用本模块确认命令载荷形状。
 */
import type {
  AiJsonSchema,
  AiJsonSchemaObject,
  AiJsonValue,
} from '../../json'
import type { AiAgentRuntimeHostContext } from '../tool-runtime'
import { AiAgentToolResult } from '../tool-runtime'
import { DtsClassModelBundleLoader } from '../../class-model/class-model/dts-class-model-bundle-loader'
import { resolveMethodReturnType } from '../../class-model/class-model/dts-type-meta-ops'
import type { DtsClassModelSurfaceDocument } from '../../class-model/class-model/dts-surface-types'
import type { ClassModel, DtsTypeMeta } from '../../class-model/class-model/types'
import type {
  AiApiActionMetadata,
  AiApiAttributeMetadata,
  AiApiObjectMetadata,
  AiRuntimeApiMetadataJson,
} from '../../class-model/metadata'
import { executeModuleScript } from './native-script-sandbox'
import { createAiApiScriptContext } from './native-script-context'

/** Dts Native Script Run Command 的命令参数。 */
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
      '让 LLM 直接生成 JavaScript async function body，例如 return { ... }；不要生成 TypeScript/TSX/JSX、类型注解、import/export 或函数包裹；this 绑定当前业务根实例。',
    )
  }

  const metadata = await createDtsNativeRuntimeApiMetadata({
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

export async function createDtsNativeRuntimeApiMetadata(command: Readonly<{
  manifestUrl: string
  rootClassName: string
  fetchJson?: (url: string) => Promise<unknown>
}>): Promise<AiRuntimeApiMetadataJson> {
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
              paramsSchema: requiredConstructorParamsSchema(model.className, constructorMeta),
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
      .map((method) => {
        if (method.paramsSchema === undefined) {
          throw new Error(
            `DTS method "${model.className}.${method.name}" must preserve executable paramsSchema in the DTS bundle.`,
          )
        }
        return {
          name: method.name,
          methodName: method.name,
          ...(method.signatureText === undefined ? {} : { signatureText: method.signatureText }),
          description: summarizeJsDoc(method.jsdoc),
          ...(method.jsdoc.trim().length === 0 ? {} : { jsdoc: method.jsdoc }),
          ...(method.provenance === undefined ? {} : { provenance: method.provenance }),
          paramsSchema: method.paramsSchema,
          takesContext: false,
          ...(method.returnSchema === undefined ? {} : { resultSchema: method.returnSchema }),
          ...resultApiProperty(surface, method, toApi),
        }
      })

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

function requiredConstructorParamsSchema(
  className: string,
  constructorMeta: NonNullable<ClassModel['constructorMeta']>,
): AiJsonSchemaObject {
  if (constructorMeta.paramsSchema === undefined) {
    throw new Error(
      `DTS constructor "${className}" must preserve executable paramsSchema in the DTS bundle.`,
    )
  }
  return constructorMeta.paramsSchema
}

function resolveMethodReturnClassName(
  surface: DtsClassModelSurfaceDocument,
  method: ClassModel['methods'][number],
): string | undefined {
  return resolveClassNameFromDtsType(surface, resolveMethodReturnType(method))
    ?? resolveSchemaClassName(surface, method.returnSchema)
}

function resolveClassNameFromDtsType(
  surface: DtsClassModelSurfaceDocument,
  typeMeta: DtsTypeMeta | undefined,
): string | undefined {
  if (typeMeta === undefined) return undefined
  if (typeMeta.type === 'reference') {
    return surface.models[typeMeta.name] === undefined
      ? firstDefined(typeMeta.typeArguments?.map(typeArgument => resolveClassNameFromDtsType(surface, typeArgument)) ?? [])
      : typeMeta.name
  }
  if (typeMeta.type === 'array' || typeMeta.type === 'optional' || typeMeta.type === 'rest') {
    return resolveClassNameFromDtsType(surface, typeMeta.elementType)
  }
  if (typeMeta.type === 'union' || typeMeta.type === 'intersection') {
    return firstDefined(typeMeta.types.map(item => resolveClassNameFromDtsType(surface, item)))
  }
  return undefined
}

function firstDefined<T>(items: ReadonlyArray<T | undefined>): T | undefined {
  return items.find(item => item !== undefined)
}

function resolveSchemaClassName(
  surface: DtsClassModelSurfaceDocument,
  schema: AiJsonSchema | undefined,
): string | undefined {
  if (schema === undefined || schema === true || schema === false || typeof schema !== 'object') return undefined
  return resolveClassNameFromSchemaRef(surface, schema.$ref)
    ?? resolveClassNameFromTypeText(surface, schema.title)
    ?? resolveClassNameFromSchema(surface, schema.items)
    ?? firstDefined(Object.values(schema.properties ?? {}).map(child => resolveClassNameFromSchema(surface, child)))
    ?? firstDefined((schema.anyOf ?? []).map(child => resolveClassNameFromSchema(surface, child)))
    ?? firstDefined((schema.oneOf ?? []).map(child => resolveClassNameFromSchema(surface, child)))
    ?? firstDefined((schema.allOf ?? []).map(child => resolveClassNameFromSchema(surface, child)))
}

function resolveClassNameFromSchema(
  surface: DtsClassModelSurfaceDocument,
  schema: AiJsonSchema | undefined,
): string | undefined {
  return resolveSchemaClassName(surface, schema)
}

function resolveClassNameFromSchemaRef(
  surface: DtsClassModelSurfaceDocument,
  ref: unknown,
): string | undefined {
  if (typeof ref !== 'string' || ref.length === 0) return undefined
  const marker = '#/$defs/'
  const markerIndex = ref.indexOf(marker)
  if (markerIndex < 0) return undefined
  const className = decodeJsonPointerToken(ref.slice(markerIndex + marker.length))
  return surface.models[className] === undefined ? undefined : className
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

function decodeJsonPointerToken(value: string): string {
  return value.replaceAll('~1', '/').replaceAll('~0', '~')
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
