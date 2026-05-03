/**
 * 新注册制 AI 业务场景系统统一入口。
 *
 * - engine/  : 场景引擎基础设施（注册中心、运行时、类型、查询协议）
 * - page-design/    : 页面设计四文件编辑业务场景
 * - project-planning/ : 项目-模块-页面规划业务场景
 *
 * 旧 stills/orchestration 体系不在此域，两套系统相互独立。
 */

export * from './engine'

export {
  PAGE_DESIGN_SCENARIO_ID,
  PAGE_DESIGN_BUSINESS_SCENARIO_ID,
  createPageDesignScenario,
  createPageDesignBusinessScenario,
  createPageDesignBusinessScenarioFromSessionHost,
  registerPageDesignScenario,
  registerPageDesignBusinessScenario,
  isPageDesignScenarioWriteTool,
  isPageDesignBusinessWriteTool,
  type PageDesignScenarioStillEvent,
  type CreatePageDesignScenarioOptions,
  type CreatePageDesignBusinessScenarioOptions,
  type CreatePageDesignBusinessScenarioFromSessionHostOptions,
} from './page-design/page-design-scenario'

export {
  createPlanningScenario,
  type CreatePlanningScenarioOptions,
  type ProjectPlanningToolset,
} from './project-planning/planning-scenario'
