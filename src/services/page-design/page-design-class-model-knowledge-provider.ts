/**
 * @module app:services/page-design/page-design-class-model-knowledge-provider
 * 职责：提供应用层 pageDesign 的 page-design-class-model-knowledge-provider 能力，围绕 模块入口、副作用注册或内部组合逻辑 接线 AI runner、业务门禁、知识服务或编辑器状态。
 * 边界：只编排 app 层页面设计流程，不替代 spark-ai Host，也不直接实现底层组件渲染器。
 * AI用途：排查 pageDesign 会话、工具门禁或页面四文件生成链路时，用本模块定位 services/page-design/page-design-class-model-knowledge-provider。
 */
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
