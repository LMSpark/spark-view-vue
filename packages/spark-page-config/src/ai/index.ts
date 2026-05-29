/**
 * spark-page-config AI 子系统的公共入口（barrel）。
 *
 * ## 架构层次
 * ```
 * index.ts  (公共 barrel — 外部消费者唯一入口)
 *   ├── page-design-module.ts      编排入口：组装 5 个子 kind → AiAgentRegistration
 *   ├── page-design-kind-ids.ts    常量注册：root + 5 个子 kind 的 ID 与元数据
 *   └── page-design-session-diagnostics.ts  质量诊断：事后校验 payload guide 覆盖率
 * ```
 *
 * ## 暴露原则
 * - 只暴露 PageDesign 相关符号：业务注册入口、kind ID 常量、诊断工具。
 * - 人工请假模块（leave-request）已独立为 `src/leave-request/`，通过 `./leave-request` 子路径导出。
 * - 内部 AiModule 子类（PageDesignDatasetAiModule 等）不从此 barrel 导出，
 *   它们由 page-design-module.ts 内部组装，外部只通过 Host registry 间接使用。
 */

// ── 编排入口：pageDesign 业务注册与 Host 门面 ──────────────

export {
  PAGE_DESIGN_MODULE_ID,
  PAGE_DESIGN_AI_AGENT_HOST_ALIAS,
  createPageDesignBusinessKindDefinition,
  createPageDesignBusinessRegistration,
  ensurePageDesignBusiness,
} from './page-design-module'

export type {
  PageDesignAllowedOperations,
  PageDesignRunInput,
  PageDesignRunMode,
} from './page-design-module'

// ── 常量：pageDesign 的 root + 5 个子 kind ID ──────────────

export {
  PAGE_DESIGN_COMPONENT_PAYLOAD_REF,
  PAGE_DESIGN_DATASET_KIND,
  PAGE_DESIGN_LIFECYCLE_KIND,
  PAGE_DESIGN_NODE_TREE_KIND,
  PAGE_DESIGN_PAYLOAD_CATALOG_KIND,
  PAGE_DESIGN_ROOT_KIND,
  PAGE_DESIGN_TEXT_MODEL_KIND,
} from './page-design-kind-ids'

// ── 质量诊断：事后校验 payload guide 覆盖率 ─────────────────

export {
  componentTypesFromPageDesignRule,
  flattenPageDesignSparkNodes,
  guidedPageDesignPayloadKeysFromSession,
  parsePageDesignJsonFile,
  validatePageDesignPayloadGuidesFromSession,
} from './page-design-session-diagnostics'

export type {
  PageDesignFileSnapshot,
  PageDesignPayloadGuideValidation,
} from './page-design-session-diagnostics'
