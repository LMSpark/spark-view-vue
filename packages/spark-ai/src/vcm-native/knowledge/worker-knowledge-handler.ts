import { expose, type Endpoint } from 'comlink'
import { findMissingJsonSchemaDefRefs } from '@spark-appworks/spark-json-document'
import { createClassModelDocumentFromRuntimeDocument, type ClassModelDocument } from '../class-model'
import { VcmBundleLoader } from '../metadata/vcm-bundle-loader'
import type { ComponentCatalogLike } from '../projection'
import { BundleClassModelKnowledgeService } from './bundle-class-model-knowledge-service'
import {
  ClassModelKnowledgeService,
  type VcmNativeKnowledgeProvider,
} from './class-model-knowledge-service'
import type {
  VcmNativeKnowledgeWorkerApi,
  VcmNativeKnowledgeWorkerInitInput,
} from './worker-knowledge-api'

export type CreateVcmNativeKnowledgeWorkerApiOptions = Readonly<{
  fetchJson?: (url: string) => Promise<unknown>
}>

/**
 * 创建 Worker 端 knowledge API。
 *
 * manifestUrl：只拉 manifest + $defs，kind 分片按需 fetch。
 * metadataUrl：legacy 整包 runtime JSON（兼容路径）。
 */
export function createVcmNativeKnowledgeWorkerApi(
  options: CreateVcmNativeKnowledgeWorkerApiOptions = {},
): VcmNativeKnowledgeWorkerApi {
  const fetchJson = options.fetchJson ?? defaultFetchJson
  let statePromise: Promise<VcmNativeKnowledgeWorkerState> | undefined

  return {
    async init(input) {
      statePromise = createWorkerStateFromInitInput(input, fetchJson)
      await statePromise
      return { initialized: true }
    },

    async query(input) {
      return (await requireState()).baseProvider.query(input)
    },

    async modelGuide(input) {
      return (await requireState()).baseProvider.modelGuide(input)
    },

    async attributeGuide(input) {
      return (await requireState()).baseProvider.attributeGuide(input)
    },

    async methodGuide(input) {
      const state = await requireState()
      if (input.componentType === undefined || state.componentCatalogUrl === undefined) {
        return state.baseProvider.methodGuide(input)
      }
      return (await state.catalogProvider()).methodGuide(input)
    },
  }

  function requireState(): Promise<VcmNativeKnowledgeWorkerState> {
    if (statePromise === undefined) {
      throw new Error('VCM-native knowledge worker has not been initialized.')
    }
    return statePromise
  }
}

export function exposeVcmNativeKnowledgeWorker(workerGlobal?: Endpoint): void {
  const api = createVcmNativeKnowledgeWorkerApi()
  if (workerGlobal === undefined) {
    expose(api)
    return
  }
  expose(api, workerGlobal)
}

class VcmNativeKnowledgeWorkerState {
  public readonly baseProvider: VcmNativeKnowledgeProvider
  public readonly componentCatalogUrl?: string
  private catalogProviderPromise?: Promise<VcmNativeKnowledgeProvider>
  private readonly bundleLoader?: VcmBundleLoader
  private readonly legacyDocument?: ClassModelDocument

  public constructor(options: Readonly<{
    baseProvider: VcmNativeKnowledgeProvider
    bundleLoader?: VcmBundleLoader
    legacyDocument?: ClassModelDocument
    componentCatalogUrl?: string
  }>) {
    this.baseProvider = options.baseProvider
    if (options.bundleLoader !== undefined) this.bundleLoader = options.bundleLoader
    if (options.legacyDocument !== undefined) this.legacyDocument = options.legacyDocument
    if (options.componentCatalogUrl !== undefined) this.componentCatalogUrl = options.componentCatalogUrl
  }

  public catalogProvider(): Promise<VcmNativeKnowledgeProvider> {
    this.catalogProviderPromise ??= this.createCatalogProvider()
    return this.catalogProviderPromise
  }

  private async createCatalogProvider(): Promise<VcmNativeKnowledgeProvider> {
    if (this.componentCatalogUrl === undefined) return this.baseProvider
    const response = await fetch(this.componentCatalogUrl)
    if (!response.ok) {
      throw new Error(
        `Failed to load component catalog: ${this.componentCatalogUrl} ${String(response.status)}`,
      )
    }
    const componentCatalog: unknown = await response.json()
    if (!isComponentCatalogLike(componentCatalog)) {
      throw new Error(`Component catalog JSON is not an object: ${this.componentCatalogUrl}`)
    }
    if (this.bundleLoader !== undefined) {
      return new BundleClassModelKnowledgeService({
        loader: this.bundleLoader,
        componentCatalog,
      })
    }
    if (this.legacyDocument !== undefined) {
      return new ClassModelKnowledgeService({
        document: this.legacyDocument,
        componentCatalog,
      })
    }
    return this.baseProvider
  }
}

async function createWorkerStateFromInitInput(
  input: VcmNativeKnowledgeWorkerInitInput,
  fetchJson: (url: string) => Promise<unknown>,
): Promise<VcmNativeKnowledgeWorkerState> {
  if (input.manifestUrl !== undefined) {
    const loader = new VcmBundleLoader({ manifestUrl: input.manifestUrl, fetchJson })
    await loader.init()
    const provider = new BundleClassModelKnowledgeService({ loader })
    return new VcmNativeKnowledgeWorkerState({
      baseProvider: provider,
      bundleLoader: loader,
      ...(input.componentCatalogUrl === undefined ? {} : { componentCatalogUrl: input.componentCatalogUrl }),
    })
  }

  const metadataUrl = input.metadataUrl
  if (metadataUrl === undefined) {
    throw new Error('VCM-native knowledge worker init requires manifestUrl or metadataUrl.')
  }
  const runtimeDocument = await fetchJson(metadataUrl)
  assertRuntimeMetadataSchemaRefs(runtimeDocument, metadataUrl)
  if (!isRuntimeDocumentInput(runtimeDocument)) {
    throw new Error(`VCM-native metadata is not a runtime document: ${metadataUrl}`)
  }
  const document = createClassModelDocumentFromRuntimeDocument(runtimeDocument)
  const provider = new ClassModelKnowledgeService({ document })
  return new VcmNativeKnowledgeWorkerState({
    baseProvider: provider,
    legacyDocument: document,
    ...(input.componentCatalogUrl === undefined ? {} : { componentCatalogUrl: input.componentCatalogUrl }),
  })
}

function assertRuntimeMetadataSchemaRefs(runtimeDocument: unknown, metadataUrl: string): void {
  const missing = findMissingJsonSchemaDefRefs(runtimeDocument)
  if (missing.length === 0) return
  throw new Error(
    `VCM-native metadata has unresolved $defs refs in ${metadataUrl}: ${missing.slice(0, 8).join(', ')}`,
  )
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load VCM-native knowledge JSON: ${url} ${String(response.status)}`)
  }
  return response.json()
}

function isComponentCatalogLike(value: unknown): value is ComponentCatalogLike {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isRuntimeDocumentInput(value: unknown): value is Parameters<typeof createClassModelDocumentFromRuntimeDocument>[0] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const modules: unknown = Reflect.get(value, 'modules')
  return Array.isArray(modules) && modules.length > 0
}
