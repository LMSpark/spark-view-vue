import {
  WorkerVcmNativeKnowledgeProvider,
  type VcmNativeKnowledgeProvider,
} from '@spark-appworks/spark-ai/vcm-native'
import { vcmProjectModelManifestUrl } from '@/vcm/artifact-urls'

export function createProjectPlanningVcmKnowledgeProvider(): VcmNativeKnowledgeProvider {
  const worker = new Worker(
    new URL('./vcm-knowledge.worker.ts', import.meta.url),
    { type: 'module' },
  )

  return new WorkerVcmNativeKnowledgeProvider(worker, {
    manifestUrl: vcmProjectModelManifestUrl,
  })
}
