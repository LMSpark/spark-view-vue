/**
 * DevSystem ↔ spark-ai 桥接层（唯一入口）
 *
 * 目标：
 * - 收口 dev-system 对 @spark-view/spark-ai 的直接依赖。
 * - 将会话能力与目录投影能力在本地统一导出，降低跨文件耦合面。
 */

// ── 会话/编排能力 ──────────────────────────────────────────
export {
  bindLiveModelAdapter,
  clearRegistry,
  clearDomains,
  registerEditStills,
  createSession,
  getEditState,
  getActiveNodeTree,
  executeStill,
  startIterateSession,
  generateToolDefinitions,
  functionNameToAction,
  STILLS_EDIT_RUNTIME_PROMPT,
  createSessionBackend,
} from '@spark-view/spark-ai'

export type {
  SessionBackend,
  EditToolHost,
  IStillSession,
  DialogueTurn,
  StillResult,
} from '@spark-view/spark-ai'

// ── 目录投影（供 rule 编辑策略使用）──────────────────────────
export {
  DEV_TYPES,
  DEV_PROP_NAMES,
  DEV_PROP_ENUMS,
  DEV_TYPE_LABELS,
  DEV_REQUIRED_PROPS,
} from '@spark-view/spark-ai'
