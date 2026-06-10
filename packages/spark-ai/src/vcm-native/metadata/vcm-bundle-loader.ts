/**
 * Worker 侧 VCM bundle 按需加载：manifest + $defs 先加载，kind 文件按 guide/query 需要再 fetch。
 */

import { findMissingJsonSchemaDefRefs } from '@spark-appworks/spark-json-document'
import type { AiApiObjectMetadata } from './ai-api-object-metadata-schema'
import {
  assembleRuntimeModuleFromBundle,
  expandBundleKindsWithImportKinds,
  listManifestAttributeReachableKinds,
  readVcmBundleManifest,
  readVcmKindMetadataFile,
} from './vcm-bundle-assembler'
import type { VcmBundleManifest } from './vcm-bundle-types'
import { VCM_BUNDLE_PROTOCOL, VCM_BUNDLE_SCHEMA_VERSION } from './vcm-bundle-types'
import {
  MODULE_METADATA_RUNTIME_JSON_SCHEMA,
  type ModuleMetadataRuntimeDocument,
} from './module-metadata-runtime-document'

export type VcmBundleLoaderOptions = Readonly<{
  manifestUrl: string
  fetchJson?: (url: string) => Promise<unknown>
}>

export class VcmBundleLoader {
  private readonly manifestUrl: string
  private readonly fetchJson: (url: string) => Promise<unknown>
  private manifestPromise?: Promise<VcmBundleManifest>
  private defsPromise?: Promise<Readonly<Record<string, Readonly<Record<string, unknown>>>>>
  private readonly kindPromises = new Map<string, Promise<AiApiObjectMetadata>>()

  public constructor(options: VcmBundleLoaderOptions) {
    this.manifestUrl = options.manifestUrl
    this.fetchJson = options.fetchJson ?? defaultFetchJson
  }

  public async init(): Promise<VcmBundleManifest> {
    return this.loadManifest()
  }

  public async getSchemaDefs(): Promise<Readonly<Record<string, Readonly<Record<string, unknown>>>>> {
    return this.loadDefs()
  }

  public async listAttributeReachableKinds(): Promise<readonly string[]> {
    const manifest = await this.loadManifest()
    return listManifestAttributeReachableKinds(manifest)
  }

  public async ensureKinds(kinds: readonly string[]): Promise<void> {
    await Promise.all(kinds.map(kind => this.ensureKind(kind)))
  }

  public async ensureKind(kind: string): Promise<AiApiObjectMetadata> {
    const manifest = await this.loadManifest()
    const entry = manifest.kinds[kind]
    if (entry === undefined) {
      throw new Error(`VCM bundle kind "${kind}" is not declared in manifest.`)
    }
    const existing = this.kindPromises.get(kind)
    if (existing !== undefined) return existing

    const promise = this.loadKindFile(resolveBundleRelativeUrl(this.manifestUrl, entry.file))
    this.kindPromises.set(kind, promise)
    return promise
  }

  public async ensureReachableFromRoot(): Promise<void> {
    const kinds = await this.listAttributeReachableKinds()
    await this.ensureKinds(kinds)
  }

  public async ensureReachableForGuide(kind: string): Promise<void> {
    const manifest = await this.loadManifest()
    const reachable = new Set(listManifestAttributeReachableKinds(manifest))
    if (!reachable.has(kind)) {
      throw new Error(
        `ClassModel kind "${kind}" is not reachable from root "${manifest.rootKind}" via attribute.api.`,
      )
    }
    const kinds = expandBundleKindsWithImportKinds(manifest, [kind])
    await this.ensureKinds(kinds)
  }

  public async toRuntimeDocument(): Promise<ModuleMetadataRuntimeDocument> {
    await this.ensureReachableFromRoot()
    const manifest = await this.loadManifest()
    const defs = await this.loadDefs()
    const kinds: Record<string, AiApiObjectMetadata> = {}
    for (const kind of Object.keys(manifest.kinds)) {
      kinds[kind] = await this.ensureKind(kind)
    }
    const assembled = assembleRuntimeModuleFromBundle({ manifest, defs, kinds })
    const document: ModuleMetadataRuntimeDocument = {
      $schema: MODULE_METADATA_RUNTIME_JSON_SCHEMA,
      schemaVersion: 2,
      generatedBy: manifest.generatedBy,
      note: manifest.note,
      $defs: assembled.$defs,
      modules: [assembled.module],
    }
    assertRuntimeMetadataSchemaRefs(document, this.manifestUrl)
    return document
  }

  private async loadManifest(): Promise<VcmBundleManifest> {
    this.manifestPromise ??= this.fetchJson(this.manifestUrl).then(value => readVcmBundleManifest(value))
    return this.manifestPromise
  }

  private async loadDefs(): Promise<Readonly<Record<string, Readonly<Record<string, unknown>>>>> {
    this.defsPromise ??= this.loadDefsInner()
    return this.defsPromise
  }

  private async loadDefsInner(): Promise<Readonly<Record<string, Readonly<Record<string, unknown>>>>> {
    const manifest = await this.loadManifest()
    const defsUrl = resolveBundleRelativeUrl(this.manifestUrl, manifest.defsFile)
    const raw = await this.fetchJson(defsUrl)
    if (!isRecord(raw)) {
      throw new Error(`VCM bundle defs file must be an object: ${defsUrl}`)
    }
    if (raw['protocol'] !== VCM_BUNDLE_PROTOCOL) {
      throw new Error(`VCM bundle defs protocol must be "${VCM_BUNDLE_PROTOCOL}".`)
    }
    if (raw['schemaVersion'] !== VCM_BUNDLE_SCHEMA_VERSION) {
      throw new Error(`VCM bundle defs schemaVersion must be ${String(VCM_BUNDLE_SCHEMA_VERSION)}.`)
    }
    const defs = raw['$defs']
    if (!isRecord(defs)) {
      throw new Error(`VCM bundle defs file must include $defs: ${defsUrl}`)
    }
    return readBundleSchemaDefs(defs)
  }

  private async loadKindFile(url: string): Promise<AiApiObjectMetadata> {
    const raw = await this.fetchJson(url)
    const kindFile = readVcmKindMetadataFile(raw)
    return kindFile.api
  }
}

export function resolveBundleRelativeUrl(manifestUrl: string, relativePath: string): string {
  const base = new URL(manifestUrl)
  return new URL(relativePath, base).href
}

function assertRuntimeMetadataSchemaRefs(runtimeDocument: unknown, sourceLabel: string): void {
  const missing = findMissingJsonSchemaDefRefs(runtimeDocument)
  if (missing.length === 0) return
  throw new Error(
    `VCM-native metadata has unresolved $defs refs in ${sourceLabel}: ${missing.slice(0, 8).join(', ')}`,
  )
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load VCM bundle JSON: ${url} ${String(response.status)}`)
  }
  return response.json()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readBundleSchemaDefs(
  defs: Record<string, unknown>,
): Readonly<Record<string, Readonly<Record<string, unknown>>>> {
  const next: Record<string, Readonly<Record<string, unknown>>> = {}
  for (const [key, value] of Object.entries(defs)) {
    if (!isRecord(value)) {
      throw new Error(`VCM bundle $defs["${key}"] must be an object.`)
    }
    next[key] = value
  }
  return next
}
