/**
 * @module app:services/project-planning-class-model-knowledge-provider
 * app 的 services/project-planning-class-model-knowledge-provider 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
import {
  WorkerClassModelKnowledgeProvider,
  type ClassModelKnowledgeProvider,
} from '@spark-appworks/spark-ai/class-model'
import { dtsClassModelManifestUrl } from '@/class-model-artifacts/artifact-urls'

const PROJECT_PLANNING_ROOT_CLASS_NAME = 'ProjectRootModel'

export function createProjectPlanningClassModelKnowledgeProvider(): ClassModelKnowledgeProvider {
  if (typeof Worker === 'undefined') {
    throw new Error('DTS ClassModel knowledge requires Web Worker on-demand loading.')
  }

  const worker = new Worker(
    new URL('./class-model-knowledge.worker.ts', import.meta.url),
    { type: 'module' },
  )

  return new WorkerClassModelKnowledgeProvider(worker, {
    dtsClassModelManifestUrl,
    rootClassName: PROJECT_PLANNING_ROOT_CLASS_NAME,
  })
}
