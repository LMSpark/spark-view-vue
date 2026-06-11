/**
 * @module @spark-appworks/spark-ai:class-model/knowledge/worker-knowledge-client
 * @spark-appworks/spark-ai 的 class-model/knowledge/worker-knowledge-client 模块。
 * 导出 ClassModel symbol: WorkerClassModelKnowledgeProvider（共 1 个 symbol）。
 */
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

    /** 创建 Worker Class Model Knowledge Provider 实例。 */
public constructor(worker: Worker, init: ClassModelKnowledgeWorkerInitInput) {
    this.api = wrap<ClassModelKnowledgeWorkerApi>(worker)
    this.initialized = this.api.init(init)
  }

    /** 查询参数。 */
public async query(input: ClassModelKnowledgeQueryInput): Promise<AiJsonValue> {
    await this.initialized
    return this.api.query(input)
  }

    /** 执行 model Guide 操作。 */
public async modelGuide(input: ClassModelModelGuideInput): Promise<string> {
    await this.initialized
    return this.api.modelGuide(input)
  }

    /** 执行 attribute Guide 操作。 */
public async attributeGuide(input: ClassModelAttributeGuideInput): Promise<string> {
    await this.initialized
    return this.api.attributeGuide(input)
  }

    /** 执行 method Guide 操作。 */
public async methodGuide(input: ClassModelMethodGuideInput): Promise<string> {
    await this.initialized
    return this.api.methodGuide(input)
  }
}
