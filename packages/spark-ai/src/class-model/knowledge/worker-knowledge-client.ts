import { wrap, type Remote } from 'comlink'
import type { AiJsonValue } from '../../json'
import type {
  ClassModelAttributeGuideInput,
  ClassModelKnowledgeProvider,
  ClassModelKnowledgeQueryInput,
  ClassModelMethodGuideInput,
  ClassModelModelGuideInput,
} from './class-model-knowledge-service'
import type {
  ClassModelKnowledgeWorkerApi,
  ClassModelKnowledgeWorkerInitInput,
} from './worker-knowledge-api'

/**
 * 主线程 knowledge provider。
 *
 * 成熟 Worker 通信由 Comlink 负责；主线程只传 metadata/catalog URL 和小查询参数。
 * 注意：本文件不得 import spark-json-document，也不得 import generated metadata JSON。
 */
export class WorkerClassModelKnowledgeProvider implements ClassModelKnowledgeProvider {
  private readonly api: Remote<ClassModelKnowledgeWorkerApi>
  private readonly initialized: Promise<{ initialized: true }>

  public constructor(worker: Worker, init: ClassModelKnowledgeWorkerInitInput) {
    this.api = wrap<ClassModelKnowledgeWorkerApi>(worker)
    this.initialized = this.api.init(init)
  }

  public async query(input: ClassModelKnowledgeQueryInput): Promise<AiJsonValue> {
    await this.initialized
    return this.api.query(input)
  }

  public async modelGuide(input: ClassModelModelGuideInput): Promise<string> {
    await this.initialized
    return this.api.modelGuide(input)
  }

  public async attributeGuide(input: ClassModelAttributeGuideInput): Promise<string> {
    await this.initialized
    return this.api.attributeGuide(input)
  }

  public async methodGuide(input: ClassModelMethodGuideInput): Promise<string> {
    await this.initialized
    return this.api.methodGuide(input)
  }
}
