import { wrap, type Remote } from 'comlink'
import type { AiJsonValue } from '../../json'
import type {
  VcmNativeAttributeGuideInput,
  VcmNativeKnowledgeProvider,
  VcmNativeKnowledgeQueryInput,
  VcmNativeMethodGuideInput,
  VcmNativeModelGuideInput,
} from './class-model-knowledge-service'
import type {
  VcmNativeKnowledgeWorkerApi,
  VcmNativeKnowledgeWorkerInitInput,
} from './worker-knowledge-api'

/**
 * 主线程 knowledge provider。
 *
 * 成熟 Worker 通信由 Comlink 负责；主线程只传 metadata/catalog URL 和小查询参数。
 * 注意：本文件不得 import spark-json-document，也不得 import generated metadata JSON。
 */
export class WorkerVcmNativeKnowledgeProvider implements VcmNativeKnowledgeProvider {
  private readonly api: Remote<VcmNativeKnowledgeWorkerApi>
  private readonly initialized: Promise<{ initialized: true }>

  public constructor(worker: Worker, init: VcmNativeKnowledgeWorkerInitInput) {
    this.api = wrap<VcmNativeKnowledgeWorkerApi>(worker)
    this.initialized = this.api.init(init)
  }

  public async query(input: VcmNativeKnowledgeQueryInput): Promise<AiJsonValue> {
    await this.initialized
    return this.api.query(input)
  }

  public async modelGuide(input: VcmNativeModelGuideInput): Promise<string> {
    await this.initialized
    return this.api.modelGuide(input)
  }

  public async attributeGuide(input: VcmNativeAttributeGuideInput): Promise<string> {
    await this.initialized
    return this.api.attributeGuide(input)
  }

  public async methodGuide(input: VcmNativeMethodGuideInput): Promise<string> {
    await this.initialized
    return this.api.methodGuide(input)
  }
}
