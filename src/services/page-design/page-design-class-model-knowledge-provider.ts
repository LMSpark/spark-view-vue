import {
  WorkerClassModelKnowledgeProvider,
  type ClassModelKnowledgeProvider,
} from '@spark-appworks/spark-ai/class-model'
import { dtsClassModelManifestUrl } from '@/class-model-artifacts/artifact-urls'

const PAGE_DESIGN_ROOT_CLASS_NAME = 'ProjectModel'

export function createPageDesignClassModelKnowledgeProvider(): ClassModelKnowledgeProvider {
  if (typeof Worker === 'undefined') {
    throw new Error('DTS ClassModel knowledge requires Web Worker on-demand loading.')
  }

  const worker = new Worker(
    new URL('../class-model-knowledge.worker.ts', import.meta.url),
    { type: 'module' },
  )

  return new WorkerClassModelKnowledgeProvider(worker, {
    dtsClassModelManifestUrl,
    rootClassName: PAGE_DESIGN_ROOT_CLASS_NAME,
  })
}
