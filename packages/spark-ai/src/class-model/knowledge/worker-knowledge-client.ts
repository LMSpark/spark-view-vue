/**
 * @module @spark-appworks/spark-ai:class-model/knowledge/worker-knowledge-client
 * 职责：维护 DTS ClassModel 知识链路中的 worker-knowledge-client 能力，围绕 WorkerClassModelKnowledgeProvider 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不回退到 VCM，也不直接执行业务页面逻辑。
 * AI用途：当需要判断 ClassModel 在 class-model/knowledge/worker-knowledge-client 这一段如何生成、加载或投影时，用本模块定位职责。
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
