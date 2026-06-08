import {
  WorkerVcmNativeKnowledgeProvider,
  type VcmNativeKnowledgeProvider,
} from '@spark-appworks/spark-ai/vcm-native'

export function createPageDesignVcmKnowledgeProvider(): VcmNativeKnowledgeProvider {
  const worker = new Worker(
    new URL('./page-design-vcm-knowledge.worker.ts', import.meta.url),
    { type: 'module' },
  )

  return new WorkerVcmNativeKnowledgeProvider(worker, {
    metadataUrl: new URL('./page-design-module-metadata.runtime.generated.json', import.meta.url).href,
    componentCatalogUrl: new URL('./payload/component-catalog.json', import.meta.url).href,
  })
}
