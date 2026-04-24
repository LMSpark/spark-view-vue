/**
 * 项目策划域共享业务上下文。
 *
 * 语义范围：从软件项目级到页面级。
 */
import type { OrchestrationScenario } from './orchestration-scenarios'

export interface ProjectPlanningBusinessContext {
  scenario?: OrchestrationScenario
  projectId?: string
  projectName?: string
  pageId?: string
  pageName?: string
  phase?: string
}
