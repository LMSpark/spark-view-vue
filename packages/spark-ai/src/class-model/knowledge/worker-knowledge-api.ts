/**
 * @module @spark-appworks/spark-ai:class-model/knowledge/worker-knowledge-api
 * 职责：维护 DTS ClassModel 知识链路中的 worker-knowledge-api 能力，围绕 ClassModelKnowledgeWorkerInitInput、ClassModelKnowledgeWorkerApi 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不回退到 VCM，也不直接执行业务页面逻辑。
 * AI用途：当需要判断 ClassModel 在 class-model/knowledge/worker-knowledge-api 这一段如何生成、加载或投影时，用本模块定位职责。
 */
import type { AiJsonValue } from '../../json'
import type {
  ClassModelAttributeGuideInput,
  ClassModelKnowledgeQueryInput,
  ClassModelMethodGuideInput,
  ClassModelModelGuideInput,
} from './class-model-knowledge-service'

/** Class Model Knowledge Worker Init Input 的输入数据。 */
export type ClassModelKnowledgeWorkerInitInput = Readonly<{
  /** declarations 分片 class-model manifest.json。 */
  dtsClassModelManifestUrl: string
  /** 业务根 className；DTS 模型里 kind 与 className 同值。 */
  rootClassName: string
}>

/** Class Model Knowledge Worker Api 的语义模型。 */
export type ClassModelKnowledgeWorkerApi = Readonly<{
  init(input: ClassModelKnowledgeWorkerInitInput): Promise<{ initialized: true }>
  query(input: ClassModelKnowledgeQueryInput): Promise<AiJsonValue>
  modelGuide(input: ClassModelModelGuideInput): Promise<string>
  attributeGuide(input: ClassModelAttributeGuideInput): Promise<string>
  methodGuide(input: ClassModelMethodGuideInput): Promise<string>
}>
