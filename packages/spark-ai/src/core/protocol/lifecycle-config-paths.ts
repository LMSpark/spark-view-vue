export type LifecycleStage =
  | 'bootstrap'
  | 'prompt'
  | 'session'
  | 'tooling'
  | 'orchestration'
  | 'post-action'
  | 'teardown'

export interface LifecycleConfigNode {
  key: string
  target: string
  configureWith: string
  description: string
}

export interface LifecycleConfigPath extends LifecycleConfigNode {
  stage: LifecycleStage
  owner: 'core'
}

export type LifecycleOwnerTree = Partial<Record<LifecycleStage, LifecycleConfigNode[]>>

export type LifecycleConfigTree = LifecycleOwnerTree

export const CORE_SESSION_LIFECYCLE_STAGES: LifecycleStage[] = [
  'session',
  'tooling',
  'orchestration',
  'teardown',
]

// core 树型 SSoT：按 stage 分组。
export const CORE_LIFECYCLE_CONFIG_TREE: LifecycleOwnerTree = {
  session: [
      {
        key: 'session.backend.base-url',
        target: 'core/runtime/session-backend.ts#createSessionBackend',
        configureWith: 'createSessionBackend(baseUrl, options)',
        description: '配置会话后端 API 基址。',
      },
      {
        key: 'session.backend.headers',
        target: 'core/runtime/session-backend.ts#createSessionBackend',
        configureWith: 'options.getHeaders',
        description: '注入租户/项目/鉴权请求头。',
      },
      {
        key: 'session.backend.sse-event-hook',
        target: 'core/runtime/session-backend.ts#createSessionBackend',
        configureWith: 'options.onSseEvent',
        description: '订阅后端 SSE 事件用于调试与观测。',
      },
    ],
  tooling: [
      {
        key: 'tooling.fc.definition-filter',
        target: 'core/runtime/tool-schema-builder.ts#generateToolDefinitions',
        configureWith: 'filter(types/actions/compactDescriptions)',
        description: '控制本轮暴露给 LLM 的 tool 集合。',
      },
    ],
  orchestration: [
      {
        key: 'orchestration.max-rounds',
        target: 'core/protocol/session-contracts.ts#OrchestratorConfig.maxRounds',
        configureWith: 'runFunctionLoop(config.maxRounds)',
        description: '配置单次会话最大编排轮次。',
      },
      {
        key: 'orchestration.sliding-window',
        target: 'core/protocol/session-contracts.ts#OrchestratorConfig.slidingWindow',
        configureWith: 'backend.createSession(windowSize)',
        description: '配置后端对话滑动窗口大小。',
      },
      {
        key: 'orchestration.monitors',
        target: 'core/protocol/session-contracts.ts#OrchestratorConfig.monitors',
        configureWith: 'SessionMonitor[]',
        description: '插拔重复检测/流程推进/终止判定等监控器策略。',
      },
      {
        key: 'orchestration.sse-hook',
        target: 'core/protocol/session-contracts.ts#OrchestratorConfig.onSseEvent',
        configureWith: 'per-run onSseEvent callback',
        description: '为单次 run 注入 SSE 事件回调。',
      },
    ],
  teardown: [
      {
        key: 'session.destroy-all',
        target: 'core/protocol/session-contracts.ts#SessionBackend.destroyAllSessions',
        configureWith: 'backend.destroyAllSessions()',
        description: '切换上下文时批量销毁会话。',
      },
    ],
}

export function listLifecycleConfigPaths(stage?: LifecycleStage): LifecycleConfigPath[] {
  const stages = stage ? [stage] : CORE_SESSION_LIFECYCLE_STAGES
  const flattened: LifecycleConfigPath[] = []

  for (const stageKey of stages) {
    const nodes = CORE_LIFECYCLE_CONFIG_TREE[stageKey]
    if (!nodes) continue
    for (const node of nodes) {
      flattened.push({
        owner: 'core',
        stage: stageKey,
        ...node,
      })
    }
  }

  return flattened
}

export function getLifecycleConfigTree(): LifecycleConfigTree {
  return CORE_LIFECYCLE_CONFIG_TREE
}

export function getCoreLifecycleTree(): LifecycleOwnerTree {
  return CORE_LIFECYCLE_CONFIG_TREE
}

export function listCoreLifecycleConfigPaths(stage?: LifecycleStage): LifecycleConfigPath[] {
  if (stage !== undefined && !CORE_SESSION_LIFECYCLE_STAGES.includes(stage)) {
    return []
  }
  return listLifecycleConfigPaths(stage)
}
