/**
 * @module @spark-appworks/spark-ai:class-model/knowledge/worker-knowledge-handler
 * 职责：维护 DTS ClassModel 知识链路中的 worker-knowledge-handler 能力，围绕 CreateClassModelKnowledgeWorkerApiOptions 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 ClassModel 在 class-model/knowledge/worker-knowledge-handler 这一段如何生成、加载或投影时，用本模块定位职责。
 */
import { expose, type Endpoint } from 'comlink'
import { DtsClassModelBundleLoader } from '../class-model/dts-class-model-bundle-loader'
import { DtsBundleClassModelKnowledgeService } from './dts-bundle-class-model-knowledge-service'
import type {
  ClassModelKnowledgeProvider,
} from './class-model-knowledge-service'
import type {
  ClassModelKnowledgeWorkerApi,
  ClassModelKnowledgeWorkerInitInput,
} from './worker-knowledge-api'

/** Create Class Model Knowledge Worker Api Options 的调用配置。 */
export type CreateClassModelKnowledgeWorkerApiOptions = Readonly<{
  fetchJson?: (url: string) => Promise<unknown>
}>

/**
 * 创建 Worker 端 knowledge API。
 */
export function createClassModelKnowledgeWorkerApi(
  options: CreateClassModelKnowledgeWorkerApiOptions = {},
): ClassModelKnowledgeWorkerApi {
  const fetchJson = options.fetchJson ?? defaultFetchJson
  let statePromise: Promise<ClassModelKnowledgeWorkerState> | undefined

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
      return (await requireState()).baseProvider.methodGuide(input)
    },
  }

  function requireState(): Promise<ClassModelKnowledgeWorkerState> {
    if (statePromise === undefined) {
      throw new Error('ClassModel knowledge worker has not been initialized.')
    }
    return statePromise
  }
}

export function exposeClassModelKnowledgeWorker(workerGlobal?: Endpoint): void {
  const api = createClassModelKnowledgeWorkerApi()
  if (workerGlobal === undefined) {
    expose(api)
    return
  }
  expose(api, workerGlobal)
}

class ClassModelKnowledgeWorkerState {
  public readonly baseProvider: ClassModelKnowledgeProvider

  public constructor(options: Readonly<{
    baseProvider: ClassModelKnowledgeProvider
  }>) {
    this.baseProvider = options.baseProvider
  }
}

async function createWorkerStateFromInitInput(
  input: ClassModelKnowledgeWorkerInitInput,
  fetchJson: (url: string) => Promise<unknown>,
): Promise<ClassModelKnowledgeWorkerState> {
  if (input.dtsClassModelManifestUrl.length === 0) {
    throw new Error('DTS class-model worker init requires dtsClassModelManifestUrl.')
  }
  if (input.rootClassName.length === 0) {
    throw new Error('DTS class-model worker init requires rootClassName.')
  }
  const loader = new DtsClassModelBundleLoader({
    manifestUrl: input.dtsClassModelManifestUrl,
    fetchJson,
  })
  await loader.init()
  const provider = new DtsBundleClassModelKnowledgeService({
    loader,
    rootClassName: input.rootClassName,
  })
  return new ClassModelKnowledgeWorkerState({
    baseProvider: provider,
  })
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load ClassModel knowledge JSON: ${url} ${String(response.status)}`)
  }
  return response.json()
}
