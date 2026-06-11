import type { ClassModel } from './types'
import type {
  DtsClassModelBundleManifest,
  DtsFileProjectionDocument,
} from './dts-bundle-types'
import type { DtsClassModelSurfaceDocument } from './dts-surface-types'
import { resolveDtsBundleRelativeUrl } from './build-dts-class-model-bundle'
import {
  readDtsClassModelBundleManifest,
  readDtsFileProjectionDocument,
} from './read-dts-class-model-bundle-json'

export type DtsClassModelBundleLoaderOptions = Readonly<{
  manifestUrl: string
  fetchJson?: (url: string) => Promise<unknown>
}>

export class DtsClassModelBundleLoader {
  private manifestPromise?: Promise<DtsClassModelBundleManifest>
  private readonly filePromises = new Map<string, Promise<DtsFileProjectionDocument>>()
  private readonly loadedModels = new Map<string, ClassModel>()
  private readonly loadedFilePaths = new Set<string>()
  private readonly fetchJson: (url: string) => Promise<unknown>

  public constructor(private readonly options: DtsClassModelBundleLoaderOptions) {
    this.fetchJson = options.fetchJson ?? defaultFetchJson
  }

  public async init(): Promise<DtsClassModelBundleManifest> {
    return await this.loadManifest()
  }

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
  for (const attribute of model.attributes) collectFromTypeText(manifest, linked, readSchemaTitle(attribute.schema))
  for (const method of model.methods) {
    collectFromTypeText(manifest, linked, method.paramsTypeText)
    collectFromTypeText(manifest, linked, method.returnTypeText)
    collectFromTypeText(manifest, linked, readSchemaTitle(method.returnSchema))
    for (const schema of Object.values(method.paramsSchema.properties ?? {})) {
      collectFromTypeText(manifest, linked, readSchemaTitle(schema))
    }
  }
  return [...linked]
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

function readSchemaTitle(schema: ClassModel['attributes'][number]['schema'] | undefined): string | undefined {
  if (schema === undefined || schema === true || schema === false || typeof schema !== 'object') return undefined
  return typeof schema.title === 'string' ? schema.title : undefined
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
