import type { AiJsonValue } from '../../json'
import type {
  VcmNativeAttributeGuideInput,
  VcmNativeKnowledgeQueryInput,
  VcmNativeMethodGuideInput,
  VcmNativeModelGuideInput,
} from './class-model-knowledge-service'

export type VcmNativeKnowledgeWorkerInitInput = Readonly<{
  /** Worker 内部 fetch 的 runtime metadata URL；主线程只传路径，不传大 JSON。 */
  metadataUrl: string
  /** Worker 记录该 URL；仅 methodGuide 需要组件 props 时才按需 fetch。 */
  componentCatalogUrl?: string
}>

export type VcmNativeKnowledgeWorkerApi = Readonly<{
  init(input: VcmNativeKnowledgeWorkerInitInput): Promise<{ initialized: true }>
  query(input: VcmNativeKnowledgeQueryInput): Promise<AiJsonValue>
  modelGuide(input: VcmNativeModelGuideInput): Promise<string>
  attributeGuide(input: VcmNativeAttributeGuideInput): Promise<string>
  methodGuide(input: VcmNativeMethodGuideInput): Promise<string>
}>
