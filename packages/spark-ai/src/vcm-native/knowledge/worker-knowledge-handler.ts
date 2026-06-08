import { expose, type Endpoint } from 'comlink'
import { findMissingJsonSchemaDefRefs } from '@spark-appworks/spark-json-document'
import { createClassModelDocumentFromRuntimeDocument, type ClassModelDocument } from '../class-model'
import type { ComponentCatalogLike } from '../projection'
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
 * Worker 内部负责 fetch metadata、复用 spark-json-document 做 $defs 审计、
 * 再构建 ClassModelKnowledgeService；component catalog 按需 lazy fetch。
 * 主线程不会 import 大 JSON 或 schema 公共包。
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

export function exposeVcmNativeKnowledgeWorker(workerGlobal: Endpoint = globalThis as unknown as Endpoint): void {
  expose(createVcmNativeKnowledgeWorkerApi(), workerGlobal)
}

class VcmNativeKnowledgeWorkerState {
  public readonly baseProvider: VcmNativeKnowledgeProvider
  public readonly componentCatalogUrl?: string
  private catalogProviderPromise?: Promise<VcmNativeKnowledgeProvider>

  public constructor(
    private readonly document: ClassModelDocument,
    private readonly fetchJson: (url: string) => Promise<unknown>,
    componentCatalogUrl?: string,
  ) {
    this.baseProvider = new ClassModelKnowledgeService({ document })
    if (componentCatalogUrl !== undefined) this.componentCatalogUrl = componentCatalogUrl
  }

  public catalogProvider(): Promise<VcmNativeKnowledgeProvider> {
    this.catalogProviderPromise ??= this.createCatalogProvider()
    return this.catalogProviderPromise
  }

  private async createCatalogProvider(): Promise<VcmNativeKnowledgeProvider> {
    if (this.componentCatalogUrl === undefined) return this.baseProvider
    const componentCatalog = await this.fetchJson(this.componentCatalogUrl)
    return new ClassModelKnowledgeService({
      document: this.document,
      componentCatalog: componentCatalog as ComponentCatalogLike,
    })
  }
}

async function createWorkerStateFromInitInput(
  input: VcmNativeKnowledgeWorkerInitInput,
  fetchJson: (url: string) => Promise<unknown>,
): Promise<VcmNativeKnowledgeWorkerState> {
  const runtimeDocument = await fetchJson(input.metadataUrl)
  assertRuntimeMetadataSchemaRefs(runtimeDocument, input.metadataUrl)
  const document = createClassModelDocumentFromRuntimeDocument(
    runtimeDocument as Parameters<typeof createClassModelDocumentFromRuntimeDocument>[0],
  )

  return new VcmNativeKnowledgeWorkerState(document, fetchJson, input.componentCatalogUrl)
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
