import type { AiJsonValue } from '../../json'
import type {
  ClassModelAttributeGuideInput,
  ClassModelKnowledgeQueryInput,
  ClassModelMethodGuideInput,
  ClassModelModelGuideInput,
} from './class-model-knowledge-service'

export type ClassModelKnowledgeWorkerInitInput = Readonly<{
  /** declarations 分片 class-model manifest.json。 */
  dtsClassModelManifestUrl: string
  /** 业务根 className；DTS 模型里 kind 与 className 同值。 */
  rootClassName: string
}>

export type ClassModelKnowledgeWorkerApi = Readonly<{
  init(input: ClassModelKnowledgeWorkerInitInput): Promise<{ initialized: true }>
  query(input: ClassModelKnowledgeQueryInput): Promise<AiJsonValue>
  modelGuide(input: ClassModelModelGuideInput): Promise<string>
  attributeGuide(input: ClassModelAttributeGuideInput): Promise<string>
  methodGuide(input: ClassModelMethodGuideInput): Promise<string>
}>
