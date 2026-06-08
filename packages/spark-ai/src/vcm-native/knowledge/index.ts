export {
  ClassModelKnowledgeService,
} from './class-model-knowledge-service'

export {
  WorkerVcmNativeKnowledgeProvider,
} from './worker-knowledge-client'

export {
  createVcmNativeKnowledgeWorkerApi,
  exposeVcmNativeKnowledgeWorker,
} from './worker-knowledge-handler'

export type {
  ClassModelKnowledgeServiceOptions,
  VcmNativeAttributeGuideInput,
  VcmNativeKnowledgeProvider,
  VcmNativeKnowledgeQueryInput,
  VcmNativeMethodGuideInput,
  VcmNativeModelGuideInput,
} from './class-model-knowledge-service'

export type {
  CreateVcmNativeKnowledgeWorkerApiOptions,
} from './worker-knowledge-handler'

export type {
  VcmNativeKnowledgeWorkerApi,
  VcmNativeKnowledgeWorkerInitInput,
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
  ComponentCatalogLike,
} from '../projection'
