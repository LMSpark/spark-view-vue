/**
 * @module @spark-appworks/spark-ai:class-model/knowledge/index
 * @spark-appworks/spark-ai 的 class-model/knowledge/index 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
export {
  ClassModelKnowledgeService,
} from './class-model-knowledge-service'

export {
  DtsBundleClassModelKnowledgeService,
} from './dts-bundle-class-model-knowledge-service'

export {
  WorkerClassModelKnowledgeProvider,
} from './worker-knowledge-client'

export {
  createClassModelKnowledgeWorkerApi,
  exposeClassModelKnowledgeWorker,
} from './worker-knowledge-handler'

export type {
  ClassModelKnowledgeServiceOptions,
  ClassModelAttributeGuideInput,
  ClassModelKnowledgeProvider,
  ClassModelKnowledgeQueryInput,
  ClassModelMethodGuideInput,
  ClassModelModelGuideInput,
} from './class-model-knowledge-service'

export type {
  DtsBundleClassModelKnowledgeServiceOptions,
} from './dts-bundle-class-model-knowledge-service'

export type {
  CreateClassModelKnowledgeWorkerApiOptions,
} from './worker-knowledge-handler'

export type {
  ClassModelKnowledgeWorkerApi,
  ClassModelKnowledgeWorkerInitInput,
} from './worker-knowledge-api'

export {
  renderAttributeGuide,
  renderMethodGuide,
  renderModelGuide,
} from '../projection'

export type {
  AttributeGuide,
  AttributeGuideRenderInput,
  MethodGuide,
  MethodGuideRenderInput,
  ModelGuide,
  ModelGuideRenderInput,
} from '../projection'
