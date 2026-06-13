/**
 * @module @spark-appworks/spark-ai:class-model/class-model/dts-class-model-bundle-loader
 * 职责：维护 DTS ClassModel 知识链路中的 dts-class-model-bundle-loader 能力，围绕 DtsClassModelBundleLoaderOptions、DtsClassModelBundleLoader 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 ClassModel 在 class-model/class-model/dts-class-model-bundle-loader 这一段如何生成、加载或投影时，用本模块定位职责。
 */
import type { ClassModel, DtsTypeMeta } from './types'
import { resolveMethodReturnType, visitDtsTypeMeta } from './dts-type-meta-ops'
import type {
  DtsClassModelBundleManifest,
  DtsFileProjectionDocument,
} from './dts-bundle-types'
import type { DtsClassModelSurfaceDocument } from './dts-surface-types'
import { resolveDtsBundleRelativeUrl } from './dts-bundle-url'
import {
  readDtsClassModelBundleManifest,
  readDtsFileProjectionDocument,
} from './read-dts-class-model-bundle-json'

/** Dts Class Model Bundle Loader Options 的调用配置。 */
export type DtsClassModelBundleLoaderOptions = Readonly<{
  manifestUrl: string
  fetchJson?: (url: string) => Promise<unknown>
}>

/** Dts Class Model Bundle Loader 的语义模型。 */
export class DtsClassModelBundleLoader {
  private manifestPromise?: Promise<DtsClassModelBundleManifest>
  private readonly filePromises = new Map<string, Promise<DtsFileProjectionDocument>>()
  private readonly loadedModels = new Map<string, ClassModel>()
  private readonly loadedFilePaths = new Set<string>()
  private readonly fetchJson: (url: string) => Promise<unknown>

    /** 创建 Dts Class Model Bundle Loader 实例。 */
public constructor(private readonly options: DtsClassModelBundleLoaderOptions) {
    this.fetchJson = options.fetchJson ?? defaultFetchJson
  }

    /** 执行 init 操作。 */
public async init(): Promise<DtsClassModelBundleManifest> {
    return await this.loadManifest()
  }

    /** ensure Class Name 名称。 */
public async ensureClassName(className: string): Promise<ClassModel> {
    const cached = this.loadedModels.get(className)
    if (cached !== undefined) return cached

    const manifest = await this.loadManifest()
    const entry = manifest.classIndex[className]
    if (entry === undefined) {
      throw new Error(`DTS class-model bundle has no className "${className}".`)
    }
    await this.ensureSourcePath(entry.sourcePath)
    const model = this.loadedModels.get(className)
    if (model === undefined) throw new Error(`DTS file did not provide className "${className}".`)
    return model
  }

    /** ensure Source Path 路径。 */
public async ensureSourcePath(sourcePath: string): Promise<DtsFileProjectionDocument> {
    const existing = this.filePromises.get(sourcePath)
    if (existing !== undefined) return await existing

    const manifest = await this.loadManifest()
    const entry = manifest.files[sourcePath]
    if (entry === undefined) {
      throw new Error(`DTS class-model bundle has no sourcePath "${sourcePath}".`)
    }
    const promise = this.loadFile(resolveDtsBundleRelativeUrl(this.options.manifestUrl, entry.file))
    this.filePromises.set(sourcePath, promise)
    const projection = await promise
    this.loadedFilePaths.add(sourcePath)
    for (const [className, model] of Object.entries(projection.models)) {
      if (!this.loadedModels.has(className)) this.loadedModels.set(className, model)
    }
    return projection
  }

    /** 执行 ensure Reachable Closure 操作。 */
public async ensureReachableClosure(rootClassName: string): Promise<readonly string[]> {
    await this.ensureClassName(rootClassName)
    const manifest = await this.loadManifest()
    const visited = new Set<string>()
    const reachable: string[] = []
    const queue = [rootClassName]
    while (queue.length > 0) {
      const className = queue.shift()
      if (className === undefined || visited.has(className)) continue
      visited.add(className)
      reachable.push(className)
      const model = await this.ensureClassName(className)
      for (const linked of listLinkedClassNames(manifest, model)) {
        if (!visited.has(linked)) queue.push(linked)
      }
    }
    return reachable
  }

    /** 执行 build Loaded Surface 操作。 */
public buildLoadedSurface(configPath = ''): DtsClassModelSurfaceDocument {
    const models: Record<string, ClassModel> = {}
    for (const [className, model] of this.loadedModels.entries()) models[className] = model
    const fileIndex: Record<string, readonly string[]> = {}
    for (const sourcePath of this.loadedFilePaths) fileIndex[sourcePath] = []
    return {
      schemaVersion: 1,
      source: 'declarations',
      configPath,
      models,
      fileIndex,
      generatedAt: new Date().toISOString(),
    }
  }

  private async loadManifest(): Promise<DtsClassModelBundleManifest> {
    this.manifestPromise ??= this.fetchJson(this.options.manifestUrl).then(readDtsClassModelBundleManifest)
    return await this.manifestPromise
  }

  private async loadFile(url: string): Promise<DtsFileProjectionDocument> {
    return readDtsFileProjectionDocument(await this.fetchJson(url))
  }
}

function listLinkedClassNames(manifest: DtsClassModelBundleManifest, model: ClassModel): readonly string[] {
  const linked = new Set<string>()
  const constructorMeta = model.constructorMeta
  if (constructorMeta !== undefined) {
    collectFromTypeText(manifest, linked, constructorMeta.signatureText)
    for (const parameter of constructorMeta.parameters ?? []) {
      collectFromDtsType(manifest, linked, parameter.type)
    }
    if (constructorMeta.paramsSchema !== undefined) {
      for (const schema of Object.values(constructorMeta.paramsSchema.properties ?? {})) {
        collectFromSchema(manifest, linked, schema)
      }
    }
  }
  for (const attribute of model.attributes) collectFromSchema(manifest, linked, attribute.schema)
  for (const method of model.methods) {
    collectFromTypeText(manifest, linked, method.signatureText)
    for (const parameter of method.parameters ?? []) {
      collectFromDtsType(manifest, linked, parameter.type)
    }
    collectFromDtsType(manifest, linked, resolveMethodReturnType(method))
    collectFromSchema(manifest, linked, method.returnSchema)
    if (method.paramsSchema !== undefined) {
      for (const schema of Object.values(method.paramsSchema.properties ?? {})) {
        collectFromSchema(manifest, linked, schema)
      }
    }
  }
  return [...linked]
}

function collectFromDtsType(
  manifest: DtsClassModelBundleManifest,
  linked: Set<string>,
  typeMeta: DtsTypeMeta | undefined,
): void {
  visitDtsTypeMeta(typeMeta, (node) => {
    if (node.type !== 'reference' || node.refersToTypeParameter === true) return
    if (manifest.classIndex[node.name] !== undefined) {
      linked.add(node.name)
      return
    }
    collectFromTypeText(manifest, linked, node.name)
  })
}

function collectFromTypeText(
  manifest: DtsClassModelBundleManifest,
  linked: Set<string>,
  typeText: string | undefined,
): void {
  if (typeText === undefined) return
  for (const className of Object.keys(manifest.classIndex)) {
    if (containsTypeReference(typeText, className)) linked.add(className)
  }
}

function collectFromSchema(
  manifest: DtsClassModelBundleManifest,
  linked: Set<string>,
  schema: ClassModel['attributes'][number]['schema'] | undefined,
): void {
  if (schema === undefined || schema === true || schema === false || typeof schema !== 'object') return
  if (typeof schema.$ref === 'string') collectFromTypeText(manifest, linked, schema.$ref)
  if (typeof schema.title === 'string') collectFromTypeText(manifest, linked, schema.title)
  if (schema.items !== undefined) collectFromSchema(manifest, linked, schema.items)
  for (const child of Object.values(schema.properties ?? {})) collectFromSchema(manifest, linked, child)
  for (const child of schema.anyOf ?? []) collectFromSchema(manifest, linked, child)
  for (const child of schema.oneOf ?? []) collectFromSchema(manifest, linked, child)
  for (const child of schema.allOf ?? []) collectFromSchema(manifest, linked, child)
}

function containsTypeReference(typeText: string, className: string): boolean {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'u').test(typeText)
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load DTS class-model JSON: ${url} ${String(response.status)}`)
  }
  return await response.json()
}
