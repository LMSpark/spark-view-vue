/**
 * @module app:services/page-data-design/page-data-design-class-model-knowledge-provider
 * 职责：pageDataDesign 的 DTS ClassModel 知识索引，rootClassName 仍为 ProjectModel。
 * 边界：只提供 Worker 知识加载，不注册 Host 或执行 script。
 * AI用途：排查 pageDataDesign 知识闭包或 manifest 加载问题时，用本模块确认 rootClassName。
 */
import {
  WorkerClassModelKnowledgeProvider,
  type ClassModelKnowledgeProvider,
} from '@spark-appworks/spark-ai/class-model'
import { dtsClassModelManifestUrl } from '@/class-model-artifacts/artifact-urls'

const PAGE_DATA_DESIGN_ROOT_CLASS_NAME = 'ProjectModel'

export function createPageDataDesignClassModelKnowledgeProvider(): ClassModelKnowledgeProvider {
  if (typeof Worker === 'undefined') {
    throw new Error('DTS ClassModel knowledge requires Web Worker on-demand loading.')
  }

  const worker = new Worker(
    new URL('../class-model-knowledge.worker.ts', import.meta.url),
    { type: 'module' },
  )

  return new WorkerClassModelKnowledgeProvider(worker, {
    dtsClassModelManifestUrl,
    rootClassName: PAGE_DATA_DESIGN_ROOT_CLASS_NAME,
  })
}
