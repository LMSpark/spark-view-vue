import type { AiRuntimeKnowledgeProjection } from '@spark-view/spark-ai'
import type {
  AppAiBusinessRuntime,
  AppAiBusinessScope,
} from './types'

export interface AppAiSelectedBusiness {
  readonly runtime: AppAiBusinessRuntime
  readonly scope: AppAiBusinessScope
  projection: AiRuntimeKnowledgeProjection
}
