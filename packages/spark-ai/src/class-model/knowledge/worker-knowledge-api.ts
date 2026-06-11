/**
 * @module @spark-appworks/spark-ai:class-model/knowledge/worker-knowledge-api
 * @spark-appworks/spark-ai 的 class-model/knowledge/worker-knowledge-api 模块。
 * 导出 ClassModel symbol: ClassModelKnowledgeWorkerInitInput, ClassModelKnowledgeWorkerApi（共 2 个 symbol）。
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
