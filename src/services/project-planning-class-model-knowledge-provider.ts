/**
 * @module app:services/project-planning-class-model-knowledge-provider
 * 职责：提供应用层 projectPlanning 的 project-planning-class-model-knowledge-provider 能力，围绕 模块入口、副作用注册或内部组合逻辑 编排项目需求、导航规划和 AI 业务注册。
 * 边界：只停留在项目规划阶段，不生成页面 rule/pagedata/script/template，也不越界进入 pageDesign。
 * AI用途：规划模块/页面概要或排查项目策划 Agent 时，用本模块理解 services/project-planning-class-model-knowledge-provider。
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
