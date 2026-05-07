// Public surface: runtime integration points used by the SPARK app.

export {
  extractFirstJsonObject,
  parseTokenUsage,
  formatTokenUsage,
} from './protocol-parser'
export type {
  ProtocolRole,
  ProtocolMessage,
  TokenUsage,
  StreamCallbacks,
} from './types'

export {
  createPageCache,
} from './business/page-design/page-cache'
export type { PageCacheHandle } from './business/page-design/page-cache'

export { DEV_TYPES, DEV_PROP_NAMES, DEV_PROP_ENUMS, DEV_TYPE_LABELS, DEV_REQUIRED_PROPS } from './catalog/catalog-dev-exports'

export type {
  DialogueTurn,
  SessionBackend,
} from './core/session/contracts'
export type { RepeatDetectionConfig } from './core/session/repeat-monitor'
export {
  createPageModelSessionBackend,
  createPageModelSessionHost,
  createPageModelEditSession,
  type PageDesignBusinessContext,
  type EditToolHost,
  type PageDesignNodeTree,
  type PageModelFunctionContext,
  type PageModelSessionHostRuntime,
  type PageModelSessionHostState,
  type PageModelSessionHostController,
  type CreatePageModelSessionHostOptions,
  type PageModelEditLogEntry,
  type PageModelEditSessionState,
  type StartPageModelIterateSessionOptions,
  type PageModelEditSessionRuntime,
  type PageModelEditSessionOptions,
  type PageModelEditRunHooks,
  type PageModelEditRunOptions,
  type PageModelEditBootstrapOptions,
  type PageModelEditSessionController,
} from './business/page-design'