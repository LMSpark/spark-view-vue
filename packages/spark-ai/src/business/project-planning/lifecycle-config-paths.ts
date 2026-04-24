import type {
  LifecycleConfigNode,
  LifecycleOwnerTree,
  LifecycleStage,
} from '../../core/lifecycle-config-paths'

export type BusinessLifecycleOwner = 'business'

export interface BusinessLifecycleConfigPath extends LifecycleConfigNode {
  stage: LifecycleStage
  owner: BusinessLifecycleOwner
}

export const BUSINESS_SESSION_LIFECYCLE_STAGES: LifecycleStage[] = [
  'bootstrap',
  'prompt',
  'orchestration',
  'post-action',
]

export const BUSINESS_LIFECYCLE_CONFIG_TREE: LifecycleOwnerTree = {
  bootstrap: [
    {
      key: 'business.stills-domain-registry',
      target: 'core/stills/domain.ts#registerDomain',
      configureWith: 'registerDomain(domainProvider)',
      description: '注册业务域 stills（edit/blueprint 等）。',
    },
    {
      key: 'business.stills-registry',
      target: 'core/stills/dispatcher.ts#registerStill',
      configureWith: 'registerStill(stillDefinition)',
      description: '注册业务动作定义。',
    },
  ],
  prompt: [
    {
      key: 'prompt.mode.registry',
      target: 'prompts/prompt-builder.ts#registerPromptMode',
      configureWith: 'registerPromptMode(mode, factory)',
      description: '注册新的 PromptMode 及其系统提示词工厂。',
    },
    {
      key: 'prompt.page.build-options',
      target: 'prompts/prompt-builder.ts#buildPageSystemPrompt',
      configureWith: 'BuildPagePromptOptions(context, metadataProvider)',
      description: '配置页面提示词拼接上下文与组件元数据提供器。',
    },
  ],
  'post-action': [
    {
      key: 'post-action.nav-register',
      target: 'business/index.ts#createNavRegister',
      configureWith: 'getNavApiUrl/getHeaders',
      description: '配置 AI 生成页面后导航注册 API 与请求头。',
    },
    {
      key: 'post-action.page-cache',
      target: 'business/index.ts#createPageCache',
      configureWith: 'ConfigLoaderRef',
      description: '配置页面四文件缓存失效与统计。',
    },
  ],
  orchestration: [
    {
      key: 'orchestration.monitors-factory',
      target: 'business/project-planning/orchestration-monitor-factory.ts#createMonitorsForScenario',
      configureWith: "createMonitorsForScenario('generate' | 'iterate' | 'debug')",
      description: '场景化组装 monitors（generate/iterate/debug），替代硬编码列表。',
    },
    {
      key: 'orchestration.followup-policy-default',
      target: 'business/project-planning/business-follow-up-policy.ts#createDefaultFollowUpPolicy',
      configureWith: 'createDefaultFollowUpPolicy()',
      description: '业务层通用反馈策略实现（原 core 中的默认逻辑）。',
    },
    {
      key: 'orchestration.followup-policy-business',
      target: 'business/project-planning/business-follow-up-policy.ts#createBusinessFollowUpPolicy',
      configureWith: 'createBusinessFollowUpPolicy(businessContext)',
      description: '业务层特化反馈策略（加业务域知识），必须注入 OrchestratorConfig。',
    },
    {
      key: 'orchestration.config-factory',
      target: 'business/project-planning/orchestrator-config-factory.ts#createOrchestratorConfig',
      configureWith: 'createOrchestratorConfig(options) | createGenerateConfig / createIterateConfig / createDebugConfig',
      description: '一键生成完整 OrchestratorConfig（整合 monitors + followUpPolicy + 其他参数）。',
    },
  ],
}

export function listBusinessLifecycleConfigPaths(stage?: LifecycleStage): BusinessLifecycleConfigPath[] {
  const stages = stage ? [stage] : BUSINESS_SESSION_LIFECYCLE_STAGES
  const flattened: BusinessLifecycleConfigPath[] = []

  for (const stageKey of stages) {
    const nodes = BUSINESS_LIFECYCLE_CONFIG_TREE[stageKey]
    if (!nodes) continue
    for (const node of nodes) {
      flattened.push({
        owner: 'business',
        stage: stageKey,
        ...node,
      })
    }
  }

  return flattened
}
