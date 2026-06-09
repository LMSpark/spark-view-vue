import {
  WorkerVcmNativeKnowledgeProvider,
  type VcmNativeKnowledgeProvider,
} from '@spark-appworks/spark-ai/vcm-native'
import { vcmComponentCatalogUrl, vcmProjectPageSurfaceMetadataUrl } from '@/vcm/artifact-urls'

export function createPageDesignVcmKnowledgeProvider(): VcmNativeKnowledgeProvider {
  const worker = new Worker(
    new URL('../vcm-knowledge.worker.ts', import.meta.url),
    { type: 'module' },
  )

  return new WorkerVcmNativeKnowledgeProvider(worker, {
    metadataUrl: vcmProjectPageSurfaceMetadataUrl,
    componentCatalogUrl: vcmComponentCatalogUrl,
  })
}
